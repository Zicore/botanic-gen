// Tree generation: document graph -> skeleton (spines) -> mesh buffers.
// Runs inside a Web Worker; output is plain typed arrays.
//
// Conventions (match glTF / Godot):
//   UV v = 0 at the image top, textures use flipY = false.
//   tangent.w is chosen so cross(normal, tangent) * w points to image-up (decreasing v).
//   COLOR_0 = (ao * tint, 1) — Godot multiplies it into albedo automatically.
//   UV2.x   = branch flex weight (0 trunk -> 1 outermost twig tips), normalized.
//   UV2.y   = leaf flutter weight (0 at attachment -> 1 at leaf tip).

import { Vector3 } from 'three';
import { Rng, hashString, hashInts } from '../core/rng.js';
import { createNoise3, createNoiseVec3 } from '../core/noise.js';
import { bakeCurve } from '../core/curve.js';
import { NODE_TYPES, nodeDefaults, materialDefaults, withDefaults } from './schema.js';
import { leafLayout, leafUV } from '../materials/layout.js';

const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);
const DEG = Math.PI / 180;
const GOLDEN = 137.50776 * DEG;
const MAX_SPINES = 40000;
const MAX_LEAVES = 120000;

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Mesh builder

class MeshBuilder {
  constructor(key, kind, materialId) {
    this.key = key;
    this.kind = kind;
    this.materialId = materialId;
    this.pos = [];
    this.nrm = [];
    this.tan = [];
    this.uv = [];
    this.uv2 = [];
    this.tint = []; // per-vertex rgb multiplier before AO
    this.occl = []; // extra local occlusion factor (crotches), 1 = none
    this.idx = [];
  }
  get vertexCount() {
    return this.pos.length / 3;
  }
  vertex(p, n, t, w, u, v, u2x, u2y, tint, occl = 1) {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.tan.push(t.x, t.y, t.z, w);
    this.uv.push(u, v);
    this.uv2.push(u2x, u2y);
    this.tint.push(tint[0], tint[1], tint[2]);
    this.occl.push(occl);
  }
}

// ---------------------------------------------------------------------------
// Spine: a polyline with radii and rotation-minimizing frames

class Spine {
  constructor(node, parent, parentT) {
    this.node = node;
    this.parent = parent;
    this.parentT = parentT;
    this.pts = [];
    this.rad = [];
    this.T = [];
    this.N = [];
    this.B = [];
    this.s = [];
    this.length = 0;
    this.flexBase = 0;
    this.flexGain = 0;
    this.seed = 0;
    this.material = null;
    this.parentRadius = 0; // parent radius at attachment, for collar + crotch AO
  }

  computeFrames(initialNormal) {
    const n = this.pts.length;
    this.s = [0];
    for (let i = 1; i < n; i++) this.s.push(this.s[i - 1] + this.pts[i].distanceTo(this.pts[i - 1]));
    this.length = this.s[n - 1];

    this.T = this.pts.map((p, i) => {
      const a = this.pts[Math.max(0, i - 1)];
      const b = this.pts[Math.min(n - 1, i + 1)];
      const t = new Vector3().subVectors(b, a);
      return t.lengthSq() > 1e-12 ? t.normalize() : new Vector3(0, 1, 0);
    });

    // initial normal: projected hint, or any perpendicular
    const T0 = this.T[0];
    let N0 = initialNormal ? initialNormal.clone().addScaledVector(T0, -initialNormal.dot(T0)) : null;
    if (!N0 || N0.lengthSq() < 1e-8) {
      N0 = Math.abs(T0.y) < 0.95 ? new Vector3(0, 1, 0).cross(T0) : new Vector3(1, 0, 0).cross(T0);
    }
    N0.normalize();

    // double reflection (Wang et al. 2008)
    this.N = [N0];
    const v1 = new Vector3(), rL = new Vector3(), tL = new Vector3(), v2 = new Vector3();
    for (let i = 0; i < n - 1; i++) {
      v1.subVectors(this.pts[i + 1], this.pts[i]);
      const c1 = v1.dot(v1);
      if (c1 < 1e-14) {
        this.N.push(this.N[i].clone());
        continue;
      }
      rL.copy(this.N[i]).addScaledVector(v1, (-2 / c1) * v1.dot(this.N[i]));
      tL.copy(this.T[i]).addScaledVector(v1, (-2 / c1) * v1.dot(this.T[i]));
      v2.subVectors(this.T[i + 1], tL);
      const c2 = v2.dot(v2);
      const next = rL.clone();
      if (c2 > 1e-14) next.addScaledVector(v2, (-2 / c2) * v2.dot(rL));
      next.addScaledVector(this.T[i + 1], -next.dot(this.T[i + 1])).normalize();
      this.N.push(next);
    }
    this.B = this.T.map((t, i) => new Vector3().crossVectors(t, this.N[i]));
  }

  /** Interpolated sample at normalized arc length t. */
  sample(t) {
    const target = clamp(t, 0, 1) * this.length;
    const s = this.s;
    let i = 0;
    let hi = s.length - 1;
    while (i < hi - 1) {
      const mid = (i + hi) >> 1;
      if (s[mid] <= target) i = mid;
      else hi = mid;
    }
    const seg = s[i + 1] - s[i];
    const f = seg > 1e-9 ? (target - s[i]) / seg : 0;
    const lerpV = (arr) => new Vector3().lerpVectors(arr[i], arr[i + 1], f);
    const T = lerpV(this.T).normalize();
    const N = lerpV(this.N);
    N.addScaledVector(T, -N.dot(T)).normalize();
    return {
      p: lerpV(this.pts),
      r: this.rad[i] + (this.rad[i + 1] - this.rad[i]) * f,
      T,
      N,
      B: new Vector3().crossVectors(T, N),
    };
  }

  flexAt(t) {
    return this.flexBase + this.flexGain * t;
  }
}

// ---------------------------------------------------------------------------
// Growth

function growSpine(spine, o) {
  const n = Math.max(2, o.segments);
  const step = o.length / n;
  const p = o.origin.clone();
  const d = o.dir.clone().normalize();
  const nv = new Vector3();
  const horiz = new Vector3();
  const pts = [p.clone()];
  const inv = 1 / n;
  for (let i = 0; i < n; i++) {
    const t = i * inv;
    if (o.gravity) d.addScaledVector(DOWN, o.gravity * o.gravityCurve(t) * inv * 1.6);
    if (o.upAttraction) d.addScaledVector(UP, o.upAttraction * inv);
    if (o.flatten) {
      horiz.set(d.x, 0, d.z);
      if (horiz.lengthSq() > 1e-6) d.lerp(horiz.normalize(), Math.min(1, o.flatten * inv * 3));
    }
    if (o.gnarl) {
      const g = o.gnarlScale;
      o.noiseVec(p.x * g + o.noiseOffset, p.y * g, p.z * g - o.noiseOffset, nv);
      d.addScaledVector(nv, o.gnarl * inv * 2.2);
    }
    // keep drooping wood above ground
    if (o.groundAvoid && p.y < o.groundAvoid && d.y < 0) d.y *= -0.3;
    d.normalize();
    p.addScaledVector(d, step);
    pts.push(p.clone());
  }
  spine.pts = pts;
  spine.computeFrames(o.initialNormal);
  spine.rad = spine.s.map((s) => o.radiusAt(spine.length > 0 ? s / spine.length : 0, s));
}

/** Child positions along a parent spine: [{ t, phi }]. */
function spawnPositions(P, parentLength, refLength, rng) {
  let count = P.count * (P.countByLength && refLength > 0 ? parentLength / refLength : 1);
  let n = rng.round(Math.max(0, count));
  if (n === 0) return [];

  const out = [];
  const span = P.end - P.start;
  const phi0 = rng.range(0, Math.PI * 2);
  const jitterRot = () => rng.signed() * P.rotationJitter * DEG;
  const tAt = (g, G) => {
    const u = (g + 0.5 + rng.signed() * 0.5 * P.positionJitter) / G;
    return clamp(P.start + span * u, Math.min(P.start, P.end), Math.max(P.start, P.end));
  };

  switch (P.phyllotaxy) {
    case 'whorled': {
      const k = Math.max(2, P.whorlSize);
      const G = Math.max(1, Math.round(n / k));
      for (let g = 0; g < G; g++) {
        const t = tAt(g, G);
        const off = phi0 + g * (Math.PI / k) + rng.signed() * 0.3;
        for (let j = 0; j < k; j++) out.push({ t, phi: off + (j / k) * Math.PI * 2 + jitterRot() });
      }
      break;
    }
    case 'opposite': {
      const G = Math.max(1, Math.round(n / 2));
      for (let g = 0; g < G; g++) {
        const t = tAt(g, G);
        const off = phi0 + g * Math.PI * 0.5;
        out.push({ t, phi: off + jitterRot() }, { t, phi: off + Math.PI + jitterRot() });
      }
      break;
    }
    default: {
      for (let g = 0; g < n; g++) {
        let phi;
        if (P.phyllotaxy === 'alternate') phi = phi0 + g * Math.PI;
        else if (P.phyllotaxy === 'random') phi = rng.range(0, Math.PI * 2);
        else phi = phi0 + g * GOLDEN;
        out.push({ t: tAt(g, n), phi: phi + jitterRot() });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main entry

export function generateTree(doc) {
  const t0 = performance.now();
  const warnings = [];

  const materials = new Map();
  for (const m of doc.materials || []) {
    materials.set(m.id, { ...m, params: withDefaults(m.params, materialDefaults(m.kind)) });
  }
  const firstOfKind = (kind) => (doc.materials || []).find((m) => m.kind === kind)?.id ?? null;

  const nodes = new Map();
  for (const n of doc.nodes || []) {
    if (!NODE_TYPES[n.type]) continue;
    nodes.set(n.id, { ...n, params: withDefaults(n.params, nodeDefaults(n.type)) });
  }
  const children = new Map();
  for (const n of nodes.values()) {
    if (!n.parent || !nodes.has(n.parent)) continue;
    if (!children.has(n.parent)) children.set(n.parent, []);
    children.get(n.parent).push(n);
  }
  const root = [...nodes.values()].find((n) => n.type === 'tree');
  if (!root) return emptyResult(t0, ['Graph has no Tree node.']);

  const G = root.params;
  const scale = G.scale;
  const quality = G.quality;
  const treeSeed = G.seed >>> 0;
  const noiseVec = createNoiseVec3(treeSeed);
  const noise3 = createNoise3(treeSeed + 17);

  const builders = new Map();
  const builder = (kind, materialId) => {
    const key = `${kind}:${materialId ?? 'none'}`;
    if (!builders.has(key)) builders.set(key, new MeshBuilder(key, kind, materialId));
    return builders.get(key);
  };

  const spinesByNode = new Map();
  let spineCount = 0;
  let leafCount = 0;
  let spinesCapped = false;
  let leavesCapped = false;
  const skeleton = [];

  const nodeRng = (node, ...salt) => new Rng(hashInts(treeSeed, hashString(node.id), ...salt));

  // ---- skeleton pass: grow every wood/frond spine top-down
  const growNode = (node, parentSpines) => {
    if (node.enabled === false) return;
    const P = node.params;
    const spines = [];

    if (node.type === 'trunk') {
      const rng = nodeRng(node);
      const radiusCurve = bakeCurve(P.radiusCurve);
      const gravityCurve = bakeCurve(P.gravityCurve);
      for (let k = 0; k < P.count; k++) {
        const r = rng.fork(k);
        const spine = new Spine(node, null, 0);
        const base = new Vector3();
        if (P.spread > 0) {
          const ang = r.range(0, Math.PI * 2);
          const rad = Math.sqrt(r.next()) * P.spread * scale;
          base.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
        }
        const dir = new Vector3(0, 1, 0);
        const outward = base.lengthSq() > 1e-6 ? base.clone().normalize() : new Vector3(Math.cos(r.range(0, 7)), 0, Math.sin(r.range(0, 7)));
        if (P.count > 1 && P.splay > 0) dir.applyAxisAngle(new Vector3().crossVectors(UP, outward).normalize(), P.splay * DEG * r.range(0.6, 1.2));
        if (P.tilt > 0) {
          const az = r.range(0, Math.PI * 2);
          dir.applyAxisAngle(new Vector3(Math.cos(az), 0, Math.sin(az)), P.tilt * DEG * r.range(0.4, 1));
        }
        dir.normalize();
        const length = r.vary(P.length, P.lengthVar) * scale;
        const radius = P.radius * scale * r.range(0.92, 1.08);
        const sink = P.sink * scale;
        const origin = base.clone().addScaledVector(dir, -sink);
        const total = length + sink;
        growSpine(spine, {
          origin,
          dir,
          length: total,
          segments: Math.round(P.lengthSegments * quality),
          gravity: P.gravity,
          gravityCurve,
          upAttraction: P.upAttraction,
          gnarl: P.gnarl,
          gnarlScale: P.gnarlScale / scale,
          noiseVec,
          noiseOffset: r.range(0, 500),
          radiusAt: (t, s) => radius * radiusCurve(Math.max(0, (s - sink) / length)),
        });
        spine.seed = r.seed;
        spine.material = P.material ?? firstOfKind('bark');
        spine.sink = sink;
        spine.flexBase = 0;
        spine.flexGain = 0;
        spines.push(spine);
      }
    } else if (node.type === 'branches' || node.type === 'fronds') {
      const isFrond = node.type === 'fronds';
      const lengthCurve = bakeCurve(P.lengthCurve);
      const angleCurve = bakeCurve(P.angleCurve);
      const gravityCurve = bakeCurve(P.gravityCurve);
      const radiusCurve = isFrond ? null : bakeCurve(P.radiusCurve);
      const refLength = Math.max(1e-6, ...parentSpines.map((s) => s.length));

      parentSpines.forEach((parent, pi) => {
        const rng = nodeRng(node, pi, parent.seed);
        const positions = spawnPositions(P, parent.length, refLength, rng);
        positions.forEach((pos, ci) => {
          if (spineCount >= MAX_SPINES) {
            spinesCapped = true;
            return;
          }
          const r = rng.fork(ci);
          const at = parent.sample(pos.t);
          const R = at.N.clone().multiplyScalar(Math.cos(pos.phi)).addScaledVector(at.B, Math.sin(pos.phi));
          const theta = (P.angle * angleCurve(pos.t) + r.signed() * P.angleVar) * DEG;
          const dir = at.T.clone().multiplyScalar(Math.cos(theta)).addScaledVector(R, Math.sin(theta)).normalize();

          let length;
          if (isFrond) length = r.vary(P.length, P.lengthVar) * lengthCurve(pos.t) * scale;
          else length = parent.length * P.length * lengthCurve(pos.t) * r.vary(1, P.lengthVar);
          if (length < 0.01 * scale) return;

          const spine = new Spine(node, parent, pos.t);
          const parentR = at.r;
          spine.parentRadius = parentR;
          const nominal = isFrond ? P.length * scale : parent.length * P.length;
          const segs = Math.max(2, Math.round(P.lengthSegments * quality * clamp(0.35 + 0.65 * (length / Math.max(nominal, 1e-6)), 0.35, 1.3)));

          let radiusAt;
          if (isFrond) {
            const rr = Math.min(P.rachisRadius * scale, parentR * 0.9);
            const sheath = P.sheath || 0;
            radiusAt = (t) => rr * (1 - 0.75 * t) * (1 + sheath * Math.max(0, 1 - t / 0.14) ** 2);
          } else {
            const baseR = Math.min(parentR * P.radiusRatio, parentR * 0.92);
            const collarLen = parentR * 2.5;
            radiusAt = (t, s) => {
              const collar = s < collarLen ? 1 + P.collar * (1 - s / collarLen) ** 2 : 1;
              return Math.max(baseR * radiusCurve(t), 0.0006 * scale) * collar;
            };
          }

          growSpine(spine, {
            origin: at.p,
            dir,
            length,
            segments: segs,
            gravity: P.gravity,
            gravityCurve,
            upAttraction: P.upAttraction,
            flatten: P.flatten || 0,
            gnarl: P.gnarl,
            gnarlScale: (P.gnarlScale ?? 0.8) / scale,
            noiseVec,
            noiseOffset: r.range(0, 500),
            initialNormal: at.T,
            groundAvoid: 0.15 * scale,
            radiusAt,
          });
          spine.seed = r.seed;
          spine.phiFrame = R;
          spine.material = (isFrond ? P.rachisMaterial : P.material) ?? parent.material;
          spine.leafMaterial = isFrond ? P.material ?? firstOfKind('leaf') : null;
          spine.flexBase = parent.flexAt(pos.t);
          spine.flexGain = isFrond ? 0.6 : (P.flex ?? 0.5) * clamp(length / (3 * scale), 0.35, 1.2);
          spines.push(spine);
          spineCount++;
        });
      });
    } else {
      return; // leaves & grass are meshed directly, no spines
    }

    spinesByNode.set(node.id, spines);
    for (const s of spines) {
      for (let i = 0; i < s.pts.length - 1; i++) skeleton.push(s.pts[i].x, s.pts[i].y, s.pts[i].z, s.pts[i + 1].x, s.pts[i + 1].y, s.pts[i + 1].z);
    }
    for (const child of children.get(node.id) || []) {
      if (child.type === 'branches' || child.type === 'fronds') growNode(child, spines);
    }
  };

  for (const child of children.get(root.id) || []) {
    if (child.type === 'trunk') growNode(child, []);
  }

  // ---- mesh pass: wood
  for (const [nodeId, spines] of spinesByNode) {
    const node = nodes.get(nodeId);
    if (!spines.length) continue;
    const P = node.params;
    if (node.type === 'fronds') {
      for (const s of spines) {
        if (P.rachisRadius > 0) meshTube(s, node, builder('bark', s.material), { noise3, scale, quality, G, materials, radialMax: 5 });
        meshFrond(s, node, builder('leaf', s.leafMaterial), { scale, quality, G, materials });
        leafCount++;
      }
      continue;
    }
    if (node.hideWood) continue; // LOD: spines still carry leaves, the tubes are skipped
    const maxR = Math.max(...spines.map((s) => s.rad[0] || 0));
    for (const s of spines) {
      meshTube(s, node, builder('bark', s.material), { noise3, scale, quality, G, materials, maxR });
      if (node.type === 'trunk' && P.crownLength > 0) {
        const crown = crownSpine(s, P, scale);
        if (crown) meshTube(crown, { type: 'crown', params: { radialSegments: P.radialSegments, ripple: 0.025, rippleScale: 4 } }, builder('bark', crown.material), { noise3, scale, quality, G, materials });
      }
    }
  }

  // ---- collision proxy: low-poly trunk tubes
  const collision = { pos: [], idx: [] };
  for (const [nodeId, spines] of spinesByNode) {
    const node = nodes.get(nodeId);
    if (node.type !== 'trunk') continue;
    for (const s of spines) if (s.rad[0] >= 0.03 * scale) meshCollisionTube(s, node.params, collision, scale);
  }

  // ---- mesh pass: leaves
  for (const node of nodes.values()) {
    if (node.type !== 'leaves' || node.enabled === false) continue;
    if (!isNodeActive(node, nodes)) continue;
    const parentSpines = spinesByNode.get(node.parent) || [];
    if (!parentSpines.length) continue;
    const matId = node.params.material ?? firstOfKind('leaf');
    const mat = materials.get(matId);
    if (!mat) {
      warnings.push(`Leaves "${node.name}" has no leaf material.`);
      continue;
    }
    const b = builder('leaf', matId);
    const added = meshLeaves(node, parentSpines, b, mat, { scale, quality, G, treeSeed, budget: MAX_LEAVES - leafCount });
    leafCount += added.count;
    if (added.capped) leavesCapped = true;
  }

  // ---- grass
  for (const node of nodes.values()) {
    if (node.type !== 'grass' || node.enabled === false || node.parent !== root.id) continue;
    const matId = node.params.material ?? firstOfKind('leaf');
    const mat = materials.get(matId);
    if (!mat) {
      warnings.push(`Grass "${node.name}" has no leaf material.`);
      continue;
    }
    leafCount += meshGrass(node, builder('leaf', matId), mat, { scale, quality, G, treeSeed });
  }

  if (spinesCapped) warnings.push(`Branch limit reached (${MAX_SPINES}). Reduce counts.`);
  if (leavesCapped) warnings.push(`Leaf limit reached (${MAX_LEAVES}). Reduce counts.`);

  // ---- post: canopy normals, AO, flex normalization
  const result = finalize([...builders.values()], G, nodes);
  result.stats.spines = spineCount + [...spinesByNode.values()].reduce((a, s) => a + (s[0]?.node.type === 'trunk' ? s.length : 0), 0);
  result.stats.leaves = leafCount;
  result.stats.ms = Math.round(performance.now() - t0);
  result.skeleton = new Float32Array(skeleton);
  result.collision = { position: new Float32Array(collision.pos), index: new Uint32Array(collision.idx) };
  result.warnings = warnings;
  return result;
}

function meshCollisionTube(spine, P, out, scale) {
  const radial = 8;
  const n = spine.pts.length;
  const steps = Math.min(12, n - 1);
  const base = out.pos.length / 3;
  const flareH = (P.flareHeight ?? 1) * scale;
  const sink = spine.sink || 0;
  const rows = [];
  for (let k = 0; k <= steps; k++) rows.push(Math.round((k / steps) * (n - 1)));
  for (const i of rows) {
    const p = spine.pts[i], N = spine.N[i], B = spine.B[i];
    const fall = Math.max(0, 1 - Math.max(spine.s[i] - sink, 0) / flareH) ** 2.2;
    const r = spine.rad[i] * (1 + (P.flare ?? 0) * fall * 0.8);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      out.pos.push(
        p.x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * r,
        p.y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * r,
        p.z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * r,
      );
    }
  }
  for (let k = 0; k < steps; k++) {
    for (let j = 0; j < radial; j++) {
      const a = base + k * radial + j;
      const b = base + k * radial + ((j + 1) % radial);
      out.idx.push(a, b, a + radial, b, b + radial, a + radial);
    }
  }
  // top cap
  const top = base + steps * radial;
  for (let j = 1; j < radial - 1; j++) out.idx.push(top, top + j, top + j + 1);
}

/** Swollen head at the top of a stem: resampled top section plus a short overshoot. */
function crownSpine(stem, P, scale) {
  const len = Math.min(P.crownLength * scale, stem.length * 0.9);
  if (len < 0.01) return null;
  const over = len * P.crownTop;
  const total = len + over;
  const t0 = 1 - len / stem.length;
  const base = stem.sample(t0);
  const tip = stem.sample(1);
  const n = 14;
  const crown = new Spine(stem.node, null, 0);
  for (let i = 0; i <= n; i++) {
    const d = (i / n) * total;
    if (d <= len) crown.pts.push(stem.sample(t0 + (d / len) * (1 - t0)).p);
    else crown.pts.push(tip.p.clone().addScaledVector(tip.T, d - len));
  }
  crown.computeFrames(base.N);
  const profile = bakeCurve([[0, 1], [0.45, P.crownBulge], [0.8, P.crownBulge * 0.85], [1, 0.25]]);
  crown.rad = crown.s.map((d) => base.r * profile(crown.length > 0 ? d / crown.length : 0));
  crown.seed = stem.seed ^ 0xc0c0;
  crown.material = P.crownMaterial ?? stem.material;
  return crown;
}

function isNodeActive(node, nodes) {
  let cur = node;
  while (cur) {
    if (cur.enabled === false) return false;
    cur = cur.parent ? nodes.get(cur.parent) : null;
  }
  return true;
}

function emptyResult(t0, warnings) {
  return { groups: [], skeleton: new Float32Array(0), stats: { vertices: 0, triangles: 0, ms: Math.round(performance.now() - t0) }, warnings, bounds: null };
}

// ---------------------------------------------------------------------------
// Tube meshing (trunks, branches, rachises)

function meshTube(spine, node, b, ctx) {
  const P = node.params;
  const { noise3, scale, quality, G, materials } = ctx;
  const isTrunk = node.type === 'trunk';
  const mat = materials.get(spine.material);
  const tileSize = (mat?.params.tileSize ?? 1) * scale;
  const tileAspect = mat?.params.tileAspect ?? 1.5;

  const n = spine.pts.length;
  const baseR = spine.rad[Math.min(1, n - 1)];
  let radial = Math.round((P.radialSegments ?? 6) * quality);
  if (ctx.maxR) radial = Math.round(radial * clamp(0.45 + 0.55 * Math.sqrt(baseR / ctx.maxR), 0.45, 1));
  if (ctx.radialMax) radial = Math.min(radial, ctx.radialMax);
  radial = Math.max(3, radial);

  const rng = new Rng(spine.seed ^ 0xa5a5);
  const uTiles = Math.max(1, Math.round((2 * Math.PI * baseR) / tileSize));
  const u0 = rng.int(8) / 8;
  const v0 = rng.range(0, 8);
  const vScale = 1 / (tileSize * tileAspect);
  const tint = barkTint(rng, G.barkTint);

  const ripple = P.ripple ?? (isTrunk ? 0 : 0.03);
  const rippleScale = (P.rippleScale ?? 3) / scale;
  const lobePhase = rng.range(0, Math.PI * 2);
  const flareH = (P.flareHeight ?? 1) * scale;
  const sink = spine.sink || 0;

  // ring positions
  const ringW = radial + 1;
  const grid = new Array(n * ringW);
  const radialDir = new Array(n * ringW);
  const tmp = new Vector3();
  for (let i = 0; i < n; i++) {
    const p = spine.pts[i], N = spine.N[i], B = spine.B[i];
    const sVis = spine.s[i] - sink;
    for (let j = 0; j < ringW; j++) {
      const a = ((j % radial) / radial) * Math.PI * 2;
      const dir = N.clone().multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      let r = spine.rad[i];
      if (isTrunk && P.flare > 0) {
        const fall = Math.max(0, 1 - Math.max(sVis, 0) / flareH) ** 2.2;
        if (fall > 0) {
          let lobe = 1;
          if (P.flareLobes > 0) {
            const g = (0.5 + 0.5 * Math.cos(P.flareLobes * a + lobePhase)) ** 2.5;
            tmp.copy(dir).multiplyScalar(2.1);
            const irregular = 0.65 + 0.35 * noise3(tmp.x + spine.seed % 97, tmp.y, tmp.z);
            lobe = 1 - P.flareLobeDepth + P.flareLobeDepth * g * 1.8 * irregular;
          }
          r *= 1 + P.flare * fall * lobe;
        }
      }
      if (ripple > 0) {
        tmp.copy(p).addScaledVector(dir, r).multiplyScalar(rippleScale);
        r *= 1 + ripple * noise3(tmp.x, tmp.y, tmp.z);
      }
      grid[i * ringW + j] = p.clone().addScaledVector(dir, r);
      radialDir[i * ringW + j] = dir;
    }
  }

  // crotch occlusion near the attachment
  const crotchLen = spine.parentRadius * 3;

  const base = b.vertexCount;
  const dA = new Vector3(), dS = new Vector3(), nrm = new Vector3(), tan = new Vector3();
  for (let i = 0; i < n; i++) {
    const ip = Math.max(0, i - 1), inx = Math.min(n - 1, i + 1);
    const v = v0 + spine.s[i] * vScale;
    const flex = spine.flexAt(spine.length > 0 ? spine.s[i] / spine.length : 0);
    const occl = crotchLen > 0 ? 0.55 + 0.45 * smoothstep(spine.parentRadius * 0.9, crotchLen, spine.s[i]) : 1;
    for (let j = 0; j < ringW; j++) {
      const jj = j % radial;
      const jPrev = (jj - 1 + radial) % radial, jNext = (jj + 1) % radial;
      dA.subVectors(grid[i * ringW + jNext], grid[i * ringW + jPrev]);
      dS.subVectors(grid[inx * ringW + jj], grid[ip * ringW + jj]);
      nrm.crossVectors(dA, dS);
      if (nrm.lengthSq() < 1e-14) nrm.copy(radialDir[i * ringW + j]);
      nrm.normalize();
      tan.copy(dA).addScaledVector(nrm, -dA.dot(nrm));
      if (tan.lengthSq() < 1e-14) tan.crossVectors(spine.T[i], nrm);
      tan.normalize();
      b.vertex(grid[i * ringW + j], nrm, tan, -1, u0 + (j / radial) * uTiles, v, flex, 0, tint, occl);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = base + i * ringW + j;
      const c = a + ringW;
      b.idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
}

function barkTint(rng, amount) {
  const k = 1 + rng.signed() * amount;
  return [k, k * (1 + rng.signed() * amount * 0.3), k * (1 + rng.signed() * amount * 0.3)];
}

function leafTint(rng, amount) {
  const bright = 1 + rng.signed() * amount;
  const warm = rng.signed() * amount * 0.8;
  return [bright * (1 + warm * 0.6), bright * (1 + warm * 0.15), bright * (1 - warm * 0.7)];
}

// ---------------------------------------------------------------------------
// Leaf cards

function buildLeafTemplates(P, aspect, quality, rng) {
  const ws = Math.max(1, Math.round(P.widthSegments * Math.min(1, quality)));
  const ls = Math.max(1, Math.round(P.lengthSegments * Math.min(1, quality)));
  const width = aspect * P.widthScale;
  const variants = [];
  for (let k = 0; k < 6; k++) {
    const vary = (x) => x * (1 + rng.signed() * P.deformVar);
    const fold = vary(P.fold);
    const curl = vary(P.curl) * 1.3;
    const twist = vary(P.twist) * rng.signed() * 0.9;
    const verts = [];
    for (let iy = 0; iy <= ls; iy++) {
      const y = iy / ls;
      for (let ix = 0; ix <= ws; ix++) {
        const xn = ix / ws - 0.5; // -0.5..0.5
        let x = xn * width;
        let z = Math.abs(xn) * width * fold * 0.6;
        // curl along length (positive -> tip bends below the blade)
        // arc with curvature `curl`; the blade offset z rides along the arc normal
        let yy = y, zz = z;
        if (Math.abs(curl) > 1e-3) {
          const ang = curl * y;
          const rho = 1 / curl;
          yy = (rho + z) * Math.sin(ang);
          zz = -rho * (1 - Math.cos(ang)) + z * Math.cos(ang);
        }
        // twist around the length axis
        const ta = twist * y;
        const xr = x * Math.cos(ta) - zz * Math.sin(ta);
        const zr = x * Math.sin(ta) + zz * Math.cos(ta);
        verts.push({ x: xr, y: yy, z: zr, lx: xn * aspect, ly: y });
      }
    }
    const idx = [];
    const row = ws + 1;
    for (let iy = 0; iy < ls; iy++) {
      for (let ix = 0; ix < ws; ix++) {
        const a = iy * row + ix;
        idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
      }
    }
    // smooth normals + tangents (+x direction)
    const nrm = verts.map(() => new Vector3());
    const e1 = new Vector3(), e2 = new Vector3(), fn = new Vector3();
    for (let t = 0; t < idx.length; t += 3) {
      const A = verts[idx[t]], Bv = verts[idx[t + 1]], C = verts[idx[t + 2]];
      e1.set(Bv.x - A.x, Bv.y - A.y, Bv.z - A.z);
      e2.set(C.x - A.x, C.y - A.y, C.z - A.z);
      fn.crossVectors(e1, e2);
      nrm[idx[t]].add(fn);
      nrm[idx[t + 1]].add(fn);
      nrm[idx[t + 2]].add(fn);
    }
    const tan = verts.map((v, vi) => {
      const ix = vi % row, iy = Math.floor(vi / row);
      const a = verts[iy * row + Math.max(0, ix - 1)], c = verts[iy * row + Math.min(ws, ix + 1)];
      return new Vector3(c.x - a.x, c.y - a.y, c.z - a.z).normalize();
    });
    nrm.forEach((n) => n.normalize());
    variants.push({ verts, idx, nrm, tan });
  }
  return variants;
}

function meshLeaves(node, parentSpines, b, mat, ctx) {
  const P = node.params;
  const { scale, quality, G } = ctx;
  const layout = leafLayout(mat.params);
  const templates = buildLeafTemplates(P, layout.aspect, quality, new Rng(hashInts(ctx.treeSeed, hashString(node.id), 99)));
  const sizeCurve = bakeCurve(P.sizeCurve);
  const refLength = Math.max(1e-6, ...parentSpines.map((s) => s.length));
  let count = 0;
  let capped = false;

  const X = new Vector3(), Dv = new Vector3(), Nv = new Vector3(), pos = new Vector3();
  const wp = new Vector3(), wn = new Vector3(), wt = new Vector3();

  parentSpines.forEach((parent, pi) => {
    const rng = new Rng(hashInts(ctx.treeSeed, hashString(node.id), pi, parent.seed));
    const positions = spawnPositions(P, parent.length, refLength, rng);
    if (P.tipLeaf) positions.push({ t: 1, phi: rng.range(0, Math.PI * 2), tip: true });

    for (const sp of positions) {
      if (count >= ctx.budget) {
        capped = true;
        return;
      }
      const r = rng.fork(count);
      const at = parent.sample(sp.t);
      const R = at.N.clone().multiplyScalar(Math.cos(sp.phi)).addScaledVector(at.B, Math.sin(sp.phi));
      const theta = ((sp.tip ? P.angle * 0.25 : P.angle) + r.signed() * P.angleVar) * DEG;
      Dv.copy(at.T).multiplyScalar(Math.cos(theta)).addScaledVector(R, Math.sin(theta));
      if (P.droop) Dv.addScaledVector(DOWN, P.droop * r.range(0.6, 1.2));
      Dv.normalize();

      // facing: blend from "away from the stem" toward the sky
      const away = R.clone().addScaledVector(Dv, -R.dot(Dv));
      const sky = UP.clone().addScaledVector(Dv, -UP.dot(Dv));
      if (away.lengthSq() < 1e-6) away.copy(at.N);
      away.normalize();
      if (sky.lengthSq() > 1e-6) {
        sky.normalize();
        Nv.copy(away).lerp(sky, P.faceUp);
      } else Nv.copy(away);
      if (Nv.lengthSq() < 1e-6) Nv.copy(away);
      Nv.normalize();
      if (P.roll > 0) Nv.applyAxisAngle(Dv, r.signed() * P.roll * DEG);
      X.crossVectors(Dv, Nv).normalize();
      Nv.crossVectors(X, Dv).normalize();

      const size = Math.max(0.001, P.size * sizeCurve(sp.t) * r.vary(1, P.sizeVar) * scale);
      pos.copy(at.p).addScaledVector(R, sp.tip ? 0 : at.r).addScaledVector(Dv, P.offset * scale);
      if (sp.tip) pos.addScaledVector(at.T, 0);

      const tpl = templates[r.int(templates.length)];
      const cell = layout.cells[r.int(layout.cells.length)];
      const tint = leafTint(r, G.leafTint);
      const flexBase = parent.flexAt(sp.t);
      const flutter = P.flutter;
      const base = b.vertexCount;

      for (let vi = 0; vi < tpl.verts.length; vi++) {
        const v = tpl.verts[vi];
        wp.copy(pos).addScaledVector(X, v.x * size).addScaledVector(Dv, v.y * size).addScaledVector(Nv, v.z * size);
        const tn = tpl.nrm[vi], tt = tpl.tan[vi];
        wn.set(0, 0, 0).addScaledVector(X, tn.x).addScaledVector(Dv, tn.y).addScaledVector(Nv, tn.z).normalize();
        wt.set(0, 0, 0).addScaledVector(X, tt.x).addScaledVector(Dv, tt.y).addScaledVector(Nv, tt.z);
        wt.addScaledVector(wn, -wt.dot(wn)).normalize();
        const [u, vv] = leafUV(cell, layout.aspect, v.lx, v.ly);
        b.vertex(wp, wn, wt, 1, u, vv, flexBase, flutter * v.ly, tint);
      }
      for (const k of tpl.idx) b.idx.push(base + k);
      b.normalBlend = Math.max(b.normalBlend ?? 0, P.normalBlend);
      count++;
    }
  });
  return { count, capped };
}

// ---------------------------------------------------------------------------
// Fronds: ribbon along a spine

function meshFrond(spine, node, b, ctx) {
  const P = node.params;
  const { scale, materials, G } = ctx;
  const mat = materials.get(spine.leafMaterial);
  if (!mat) return;
  const layout = leafLayout(mat.params);
  const widthCurve = bakeCurve(P.widthCurve);
  const rng = new Rng(spine.seed ^ 0x5151);
  const cell = layout.cells[rng.int(layout.cells.length)];
  const ws = Math.max(2, Math.round(P.widthSegments / 1) * 2);
  const n = spine.pts.length;
  const foldA = P.fold * DEG;
  const twistTotal = rng.signed() * P.twist * DEG;
  const tint = leafTint(rng, G.leafTint);

  const grid = [];
  const S = new Vector3(), U = new Vector3();
  for (let i = 0; i < n; i++) {
    const t = spine.length > 0 ? spine.s[i] / spine.length : 0;
    const T = spine.T[i];
    S.crossVectors(T, UP);
    if (S.lengthSq() < 1e-4) S.copy(spine.B[i]);
    S.normalize();
    S.applyAxisAngle(T, twistTotal * t);
    U.crossVectors(S, T).normalize();
    const w = P.width * widthCurve(t) * scale * 0.5;
    for (let k = 0; k <= ws; k++) {
      const x = (k / ws) * 2 - 1;
      const p = spine.pts[i].clone()
        .addScaledVector(S, x * w * Math.cos(foldA))
        .addScaledVector(U, Math.abs(x) * w * Math.sin(foldA) + spine.rad[i] * 0.8);
      grid.push({ p, x, t });
    }
  }
  const row = ws + 1;
  const base = b.vertexCount;
  const dX = new Vector3(), dS = new Vector3(), nrm = new Vector3(), tan = new Vector3();
  for (let i = 0; i < n; i++) {
    const ip = Math.max(0, i - 1), inx = Math.min(n - 1, i + 1);
    const flex = spine.flexAt(grid[i * row].t);
    for (let k = 0; k <= ws; k++) {
      const kp = Math.max(0, k - 1), kn = Math.min(ws, k + 1);
      dX.subVectors(grid[i * row + kn].p, grid[i * row + kp].p);
      dS.subVectors(grid[inx * row + k].p, grid[ip * row + k].p);
      nrm.crossVectors(dX, dS);
      if (nrm.lengthSq() < 1e-14) nrm.copy(UP);
      nrm.normalize();
      tan.copy(dX).addScaledVector(nrm, -dX.dot(nrm));
      if (tan.lengthSq() < 1e-14) tan.set(1, 0, 0);
      tan.normalize();
      const g = grid[i * row + k];
      const [u, v] = leafUV(cell, layout.aspect, g.x * layout.aspect * 0.5, g.t);
      b.vertex(g.p, nrm, tan, 1, u, v, flex, P.flutter * Math.abs(g.x) * (0.4 + 0.6 * g.t), tint);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < ws; k++) {
      const a = base + i * row + k;
      b.idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  b.normalBlend = Math.max(b.normalBlend ?? 0, P.normalBlend);
}

// ---------------------------------------------------------------------------
// Grass blades

function meshGrass(node, b, mat, ctx) {
  const P = node.params;
  const { scale, quality, G } = ctx;
  const layout = leafLayout(mat.params);
  const rng = new Rng(hashInts(ctx.treeSeed, hashString(node.id)));
  const segs = Math.max(1, Math.round(P.lengthSegments * Math.min(1.5, quality)));
  const p = new Vector3(), d = new Vector3(), S = new Vector3(), nrm = new Vector3(), tan = new Vector3();
  const dX = new Vector3(), dS = new Vector3();

  for (let k = 0; k < P.count; k++) {
    const r = rng.fork(k);
    const ang = r.range(0, Math.PI * 2);
    const rad = Math.sqrt(r.next()) * P.spread * scale;
    const basePos = new Vector3(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
    const outward = rad > 1e-4 ? basePos.clone().normalize() : new Vector3(Math.cos(ang), 0, Math.sin(ang));
    const h = r.vary(P.height, P.heightVar) * scale;
    const w = P.width * scale * r.range(0.8, 1.2);
    const lean = (P.lean * (0.3 + 0.7 * (P.spread > 0 ? rad / (P.spread * scale) : 1)) + r.signed() * P.leanVar) * DEG;
    const axis = new Vector3().crossVectors(UP, outward).normalize();
    const twist = r.signed() * P.twist * DEG;
    const cell = layout.cells[r.int(layout.cells.length)];
    const tint = leafTint(r, G.leafTint);

    // spine
    const pts = [];
    p.copy(basePos);
    d.copy(UP).applyAxisAngle(axis, lean);
    const step = h / segs;
    for (let i = 0; i <= segs; i++) {
      pts.push(p.clone());
      const t = i / segs;
      d.copy(UP).applyAxisAngle(axis, lean + P.curvature * t * t * 1.1);
      p.addScaledVector(d, step);
    }
    const side = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const T = new Vector3().subVectors(pts[Math.min(segs, i + 1)], pts[Math.max(0, i - 1)]).normalize();
      S.copy(axis).applyAxisAngle(T, twist * t);
      side.push(S.clone());
    }
    const base = b.vertexCount;
    const verts = [];
    for (let i = 0; i <= segs; i++) {
      for (let x = -1; x <= 1; x += 2) verts.push(pts[i].clone().addScaledVector(side[i], x * w * 0.5));
    }
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const ip = Math.max(0, i - 1), inx = Math.min(segs, i + 1);
      for (let xi = 0; xi < 2; xi++) {
        dX.subVectors(verts[i * 2 + 1], verts[i * 2]);
        dS.subVectors(verts[inx * 2 + xi], verts[ip * 2 + xi]);
        nrm.crossVectors(dX, dS).normalize();
        nrm.lerp(UP, P.normalUp).normalize();
        tan.copy(dX).addScaledVector(nrm, -dX.dot(nrm)).normalize();
        const x = xi === 0 ? -1 : 1;
        const [u, v] = leafUV(cell, layout.aspect, x * layout.aspect * 0.5, t);
        b.vertex(verts[i * 2 + xi], nrm, tan, 1, u, v, 0, P.flutter * t * t, tint);
      }
    }
    for (let i = 0; i < segs; i++) {
      const a = base + i * 2;
      b.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  return P.count;
}

// ---------------------------------------------------------------------------
// Finalize: canopy-normal blending, vertex AO, flex normalization, typed arrays

function finalize(builders, G) {
  // canopy ellipsoid from foliage (fallback: everything)
  const box = { min: new Vector3(Infinity, Infinity, Infinity), max: new Vector3(-Infinity, -Infinity, -Infinity) };
  const all = { min: box.min.clone(), max: box.max.clone() };
  let foliageVerts = 0;
  for (const b of builders) {
    const target = b.kind === 'leaf' ? box : null;
    for (let i = 0; i < b.pos.length; i += 3) {
      const x = b.pos[i], y = b.pos[i + 1], z = b.pos[i + 2];
      all.min.set(Math.min(all.min.x, x), Math.min(all.min.y, y), Math.min(all.min.z, z));
      all.max.set(Math.max(all.max.x, x), Math.max(all.max.y, y), Math.max(all.max.z, z));
      if (target) {
        target.min.set(Math.min(target.min.x, x), Math.min(target.min.y, y), Math.min(target.min.z, z));
        target.max.set(Math.max(target.max.x, x), Math.max(target.max.y, y), Math.max(target.max.z, z));
        foliageVerts++;
      }
    }
  }
  const canopy = foliageVerts > 0 ? box : all;
  const center = new Vector3().addVectors(canopy.min, canopy.max).multiplyScalar(0.5);
  const radii = new Vector3().subVectors(canopy.max, canopy.min).multiplyScalar(0.5).max(new Vector3(0.05, 0.05, 0.05));
  // the canopy "core" sits a little low: light comes from above
  center.y -= radii.y * 0.1;

  let maxFlex = 1e-6;
  for (const b of builders) for (let i = 0; i < b.uv2.length; i += 2) maxFlex = Math.max(maxFlex, b.uv2[i]);

  const groups = [];
  let vertices = 0, triangles = 0;
  const q = new Vector3(), hullN = new Vector3(), n = new Vector3(), t = new Vector3();
  const aoK = G.aoStrength;
  const groundY = Math.max(0, all.min.y);

  for (const b of builders) {
    const count = b.vertexCount;
    if (!count) continue;
    const blend = b.kind === 'leaf' ? b.normalBlend ?? 0 : 0;
    const color = new Float32Array(count * 4);
    const nrm = new Float32Array(b.nrm);
    const tan = new Float32Array(b.tan);
    const uv2 = new Float32Array(b.uv2);

    for (let v = 0; v < count; v++) {
      const px = b.pos[v * 3], py = b.pos[v * 3 + 1], pz = b.pos[v * 3 + 2];
      q.set((px - center.x) / radii.x, (py - center.y) / radii.y, (pz - center.z) / radii.z);
      const d = q.length();

      if (blend > 0) {
        hullN.set(q.x / radii.x, q.y / radii.y, q.z / radii.z);
        if (hullN.lengthSq() > 1e-10) {
          hullN.normalize();
          n.set(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]);
          // keep the card's facing hemisphere so lighting does not invert on the back side
          n.lerp(hullN, blend).normalize();
          nrm[v * 3] = n.x; nrm[v * 3 + 1] = n.y; nrm[v * 3 + 2] = n.z;
          t.set(tan[v * 4], tan[v * 4 + 1], tan[v * 4 + 2]);
          t.addScaledVector(n, -t.dot(n));
          if (t.lengthSq() > 1e-10) {
            t.normalize();
            tan[v * 4] = t.x; tan[v * 4 + 1] = t.y; tan[v * 4 + 2] = t.z;
          }
        }
      }

      // occlusion: deeper inside the canopy and lower down = darker
      const inside = 1 - smoothstep(0.25, 1.05, d);
      const low = 1 - smoothstep(canopy.min.y, canopy.max.y, py);
      let occ = inside * 0.7 + low * 0.25 * (foliageVerts > 0 ? 1 : 0);
      if (b.kind === 'bark') occ = occ * 0.8 + (1 - smoothstep(groundY, groundY + 0.6, py)) * 0.25;
      let ao = 1 - aoK * clamp(occ, 0, 0.9);
      ao *= 1 - aoK * (1 - b.occl[v]);

      color[v * 4] = clamp(b.tint[v * 3] * ao, 0, 1);
      color[v * 4 + 1] = clamp(b.tint[v * 3 + 1] * ao, 0, 1);
      color[v * 4 + 2] = clamp(b.tint[v * 3 + 2] * ao, 0, 1);
      color[v * 4 + 3] = 1;

      uv2[v * 2] = clamp(uv2[v * 2] / maxFlex, 0, 1);
    }

    const index = count > 65535 ? new Uint32Array(b.idx) : new Uint16Array(b.idx);
    groups.push({
      key: b.key,
      kind: b.kind,
      materialId: b.materialId,
      attributes: {
        position: new Float32Array(b.pos),
        normal: nrm,
        tangent: tan,
        uv: new Float32Array(b.uv),
        uv1: uv2,
        color,
      },
      index,
    });
    vertices += count;
    triangles += b.idx.length / 3;
  }

  return {
    groups,
    stats: { vertices, triangles, drawCalls: groups.length },
    bounds: { min: all.min.toArray(), max: all.max.toArray() },
    canopy: { center: center.toArray(), radii: radii.toArray() },
  };
}
