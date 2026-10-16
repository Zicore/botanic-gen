// Procedural leaf atlases: broadleaf, twig clusters, needle sprays, palm fronds, grass blades.
//
// Stage 1 (Canvas 2D) draws vector layers:
//   L1: R = blade mask, G = veins, B = blurred mask (edge distance), A = woody parts
//   L2: R = occlusion from overlapping leaves, G = per-leaf tint
// Stage 2 (GPU) composites albedo+alpha (sRGB), normal (+Y up), ORM and translucency.

import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { GLSL_NOISE } from './glsl.js';
import { createBakeProgram, dataTexture, hexToLinear } from './gpu.js';
import { leafLayout, leafAspect } from './layout.js';

const KINDS = { broadleaf: 0, needles: 1, frond: 2, blade: 3, twig: 4 };

// ---------------------------------------------------------------------------
// Stage 1: vector layers

function makeCanvas(size, fill = '#000') {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  return { c, ctx };
}

/** Maps leaf space (x in [-a/2, a/2], y in [0, 1], y up) into a cell, in canvas pixels. */
function cellMapper(cell, aspect, size) {
  return {
    P: (x, y) => [(cell.u0 + (x / aspect + 0.5) * (cell.u1 - cell.u0)) * size, (cell.v1 - y * (cell.v1 - cell.v0)) * size],
    unit: (cell.v1 - cell.v0) * size, // pixels per leaf-space unit
  };
}

/** Child mapper: translate to (ox, oy), rotate by ang (counter-clockwise), scale by sc. */
function subMapper(map, ox, oy, ang, sc) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return { P: (x, y) => map.P(ox + (x * c - y * s) * sc, oy + (x * s + y * c) * sc), unit: map.unit * sc };
}

const beta = (s, p, q) => {
  const m = p / (p + q);
  const peak = m ** p * (1 - m) ** q;
  return (s ** p * (1 - s) ** q) / peak;
};

const SHAPES = {
  elliptic: (s, q) => beta(s, 0.55, 0.55 * q),
  ovate: (s, q) => beta(s, 0.42, 0.8 * q),
  obovate: (s, q) => beta(s, 0.9, 0.42 * q),
  lanceolate: (s, q) => beta(s, 0.42, 1.05 * q),
  cordate: (s, q) => beta(s, 0.2, 0.85 * q),
  deltoid: (s, q) => (s < 0.24 ? (s / 0.24) ** 0.42 : ((1 - s) / 0.76) ** (0.95 * q)),
};

function taperedStroke(ctx, pts, w0, w1) {
  // filled polygon along a polyline (canvas pixels), width interpolated from w0 to w1
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const w = (w0 + (w1 - w0) * (i / (pts.length - 1))) / 2;
    left.push([pts[i][0] - dy * w, pts[i][1] + dx * w]);
    right.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
  }
  ctx.beginPath();
  ctx.moveTo(...left[0]);
  for (const q of left) ctx.lineTo(...q);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(...right[i]);
  ctx.closePath();
  ctx.fill();
}

function woodStroke(layers, pts, w0, w1) {
  layers.wood.ctx.fillStyle = '#fff';
  taperedStroke(layers.wood.ctx, pts, w0, w1);
}

/** Register a new opaque shape on top of everything drawn so far. */
function stackShape(layers, path, map, tintValue, shadow = 1) {
  const o = layers.occl.ctx;
  o.save();
  o.shadowColor = `rgba(0,0,0,${0.75 * shadow})`;
  o.shadowBlur = Math.max(2, 0.06 * map.unit);
  o.shadowOffsetX = 0.012 * map.unit;
  o.shadowOffsetY = 0.02 * map.unit;
  o.fillStyle = '#fff';
  o.fill(path);
  o.restore();
  layers.mask.ctx.fillStyle = '#fff';
  layers.mask.ctx.fill(path);
  const g = Math.round(clamp255(tintValue * 255));
  layers.tint.ctx.fillStyle = `rgb(${g},${g},${g})`;
  layers.tint.ctx.fill(path);
  for (const l of [layers.veins, layers.wood]) {
    l.ctx.save();
    l.ctx.fillStyle = '#000';
    l.ctx.fill(path);
    l.ctx.restore();
  }
}

const clamp255 = (x) => Math.min(255, Math.max(0, x));

/** One leaf blade with petiole and veins. */
function drawBroadleaf(layers, map, p, aspect, rng) {
  const pet = p.petiole;
  const bladeLen = 1 - pet - 0.01;
  const q = 0.55 + 0.9 * p.tip;
  const shape = SHAPES[p.shape] || SHAPES.ovate;
  const lobeBulge = p.lobes > 0 ? 1 + p.lobeDepth * 0.25 : 1;
  const hwMax = ((aspect / 2) * 0.96) / lobeBulge;
  const widthK = Math.min(1, (p.width * lobeBulge) / Math.max(aspect - 0.02, 1e-3));
  const bend = rng.signed() * 0.05;
  const asym = rng.signed() * 0.06;
  const lobePhase = rng.range(-0.08, 0.08);
  const lobeJitter = Array.from({ length: 12 }, () => 1 + rng.signed() * 0.25);
  const toothPhase = rng.next();
  const N = 200;

  const yAt = (s) => pet + s * bladeLen;
  const cx = (s) => bend * s * s;
  const hw = (s, side) => {
    let f = shape(Math.min(Math.max(s, 0), 1), q);
    if (p.lobes > 0) {
      const k = p.lobes * s + lobePhase;
      const lobe = Math.abs(Math.sin(Math.PI * k)) ** 0.6;
      const taper = Math.sin(Math.PI * Math.min(1, s * 1.1)) ** 0.5;
      const depth = p.lobeDepth * lobeJitter[Math.max(0, Math.floor(k)) % 12];
      f *= 1 - Math.min(0.95, depth * taper * (1 - lobe) * 1.15);
    }
    if (p.serration > 0) {
      const saw = (s * p.teeth + toothPhase + (side > 0 ? 0 : 0.37)) % 1;
      f *= 1 - p.serration * 0.07 * saw * Math.min(1, s * 6);
    }
    return Math.max(0, f) * hwMax * widthK * (1 + side * asym);
  };

  const outline = new Path2D();
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const P = map.P(cx(s) + hw(s, 1), yAt(s));
    if (i === 0) outline.moveTo(...P);
    else outline.lineTo(...P);
  }
  for (let i = N; i >= 0; i--) {
    const s = i / N;
    outline.lineTo(...map.P(cx(s) - hw(s, -1), yAt(s)));
  }
  outline.closePath();
  stackShape(layers, outline, map, 0.15 + rng.next() * 0.7);

  // petiole
  const w = layers.wood.ctx;
  w.strokeStyle = '#fff';
  w.lineWidth = Math.max(1, 0.016 * map.unit);
  w.beginPath();
  w.moveTo(...map.P(0, 0.005));
  w.lineTo(...map.P(cx(0), pet + 0.02));
  w.stroke();

  // veins, clipped to the blade
  const v = layers.veins.ctx;
  v.save();
  v.clip(outline);
  v.strokeStyle = '#fff';
  const polyline = (pts) => {
    v.beginPath();
    pts.forEach((pt, k) => (k === 0 ? v.moveTo(...map.P(...pt)) : v.lineTo(...map.P(...pt))));
    v.stroke();
  };
  const midW = 0.014 * map.unit;
  for (let k = 0; k < 4; k++) {
    const s0 = k / 4, s1 = (k + 1) / 4;
    v.globalAlpha = 0.95 * p.veinStrength + 0.05;
    v.lineWidth = Math.max(1, midW * (1 - s0 * 0.75));
    polyline(Array.from({ length: 13 }, (_, i) => {
      const s = s0 + ((s1 - s0) * i) / 12;
      return [cx(s), yAt(s)];
    }));
  }
  const cot = 1 / Math.tan((p.veinAngle * Math.PI) / 180);
  const pairs = p.lobes > 0 ? p.lobes : p.veins;
  for (let k = 0; k < pairs; k++) {
    for (const side of [1, -1]) {
      let sEnd, sStart;
      if (p.lobes > 0) {
        sEnd = Math.min(0.97, (k + 0.5) / p.lobes + lobePhase);
        sStart = Math.max(0.02, sEnd - (hw(sEnd, side) * cot * 0.9) / bladeLen);
      } else {
        sStart = 0.04 + (0.86 * (k + 0.5 + (side < 0 ? 0.25 : 0) + rng.signed() * 0.12)) / pairs;
        sEnd = Math.min(0.985, sStart + (hw(sStart, side) * cot * 1.15) / bladeLen);
      }
      const x0 = cx(sStart), y0 = yAt(sStart);
      const x2 = cx(sEnd) + side * hw(sEnd, side) * 0.94, y2 = yAt(sEnd);
      const x1 = x0 + side * hw(sStart, side) * 0.55, y1 = y0 + (y2 - y0) * 0.3;
      const base = 0.009 * map.unit * (1 - sStart * 0.5);
      v.globalAlpha = 0.85 * p.veinStrength;
      for (let part = 0; part < 3; part++) {
        const ta = part / 3, tb = (part + 1) / 3;
        v.lineWidth = Math.max(0.8, base * (1 - ta * 0.7));
        polyline(Array.from({ length: 9 }, (_, i) => {
          const t = ta + ((tb - ta) * i) / 8;
          return [(1 - t) ** 2 * x0 + 2 * (1 - t) * t * x1 + t * t * x2, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * y1 + t * t * y2];
        }));
      }
    }
  }
  v.restore();
  v.globalAlpha = 1;
}

/** A twig carrying several leaves: the cluster cards real-time trees are built from. */
function drawTwig(layers, map, p, aspect, rng) {
  const leafAsp = leafAspect({ ...p, kind: 'broadleaf' });
  const spread = (p.twigSpread * Math.PI) / 180;
  const L = p.leafScale;
  const top = Math.max(0.2, 0.97 - L * 0.95);
  const curve = p.twigCurve * 0.12;
  const stemAt = (t) => [curve * Math.sin(t * Math.PI * 0.5) * (1 - t * 0.3), 0.01 + t * top];
  // stem direction as a counter-clockwise angle from +y
  const stemDir = (t) => {
    const a = stemAt(Math.max(0, t - 0.01)), b = stemAt(Math.min(1, t + 0.01));
    return -Math.atan2(b[0] - a[0], b[1] - a[1]);
  };
  woodStroke(layers, Array.from({ length: 21 }, (_, i) => map.P(...stemAt(i / 20))), (0.01 + 0.02 * p.twigWidth) * map.unit, 0.004 * map.unit);

  const leaves = [];
  const n = Math.max(1, p.twigLeaves);
  for (let i = 0; i < n - 1; i++) {
    const t = 0.1 + 0.9 * ((i + 0.5) / (n - 1)) ** 0.85;
    const side = i % 2 === 0 ? 1 : -1;
    const size = L * (0.62 + 0.38 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.12))) * (0.9 + rng.next() * 0.2);
    const [x, y] = stemAt(t);
    leaves.push({ x, y, size, ang: stemDir(t) + side * (spread + rng.signed() * 0.18), order: t + rng.signed() * 0.15 });
  }
  for (let k = 0; k < p.sideTwigs; k++) {
    const t = 0.2 + (0.5 * (k + 0.5)) / p.sideTwigs;
    const side = k % 2 === 0 ? -1 : 1;
    const [ox, oy] = stemAt(t);
    const a = stemDir(t) + side * (0.7 + rng.signed() * 0.15);
    const len = top * (1 - t) * 0.6;
    const ex = ox - Math.sin(a) * len, ey = oy + Math.cos(a) * len;
    woodStroke(layers, [map.P(ox, oy), map.P((ox + ex) / 2, (oy + ey) / 2), map.P(ex, ey)], 0.012 * map.unit, 0.004 * map.unit);
    for (let j = 0; j < 3; j++) {
      const f = 0.4 + j * 0.3;
      const ang = j === 2 ? a : a + (j % 2 ? 1 : -1) * spread * 0.9;
      leaves.push({ x: ox + (ex - ox) * f, y: oy + (ey - oy) * f, size: L * 0.6, ang, order: rng.next() });
    }
  }
  const [tx, ty] = stemAt(1);
  leaves.push({ x: tx, y: ty, size: L * 0.95, ang: stemDir(1) + rng.signed() * 0.1, order: 2 });

  leaves.sort((a, b) => a.order - b.order);
  for (const lf of leaves) drawBroadleaf(layers, subMapper(map, lf.x, lf.y, lf.ang, lf.size), p, leafAsp, rng);
}

function drawNeedleShoot(layers, map, p, rng, origin, dir, length, scale, depth) {
  const bend = rng.signed() * 0.08;
  const nx = -dir[1], ny = dir[0];
  const twig = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const off = bend * t * t * length;
    twig.push([origin[0] + dir[0] * length * t + nx * off, origin[1] + dir[1] * length * t + ny * off]);
  }
  const toPx = (q) => map.P(q[0], q[1]);
  woodStroke(layers, twig.map(toPx), (0.012 + 0.018 * p.twigWidth) * map.unit * scale, 0.004 * map.unit * scale);

  const count = Math.round(p.needleDensity * 170 * length * scale + 8);
  const ang = (p.needleAngle * Math.PI) / 180;
  for (let i = 0; i < count; i++) {
    const t = Math.min(1, (i + rng.next() * 0.8) / count);
    const k = Math.min(15, Math.floor(t * 16));
    const f = t * 16 - k;
    const base = [twig[k][0] + (twig[k + 1][0] - twig[k][0]) * f, twig[k][1] + (twig[k + 1][1] - twig[k][1]) * f];
    const front = rng.next() < 0.3;
    const side = i % 2 === 0 ? 1 : -1;
    const a = front ? rng.signed() * 0.35 : side * (ang + rng.signed() * 0.14);
    const ca = Math.cos(a), sa = Math.sin(a);
    const d = [dir[0] * ca - dir[1] * sa, dir[0] * sa + dir[1] * ca];
    let L = p.needleLength * scale * (0.85 + 0.3 * rng.next()) * (1 - 0.45 * t * t) * (0.55 + 0.45 * Math.min(1, t * 6));
    if (front) L *= 0.45;
    const curve = p.needleCurve * L * 0.25 * side;
    const pts = [];
    for (let j = 0; j <= 6; j++) {
      const s = j / 6;
      pts.push(toPx([base[0] + d[0] * L * s - d[1] * curve * s * s, base[1] + d[1] * L * s + d[0] * curve * s * s]));
    }
    const w = (0.008 + 0.016 * p.needleWidth) * map.unit * scale;
    layers.mask.ctx.fillStyle = '#fff';
    taperedStroke(layers.mask.ctx, pts, w, w * 0.15);
    layers.veins.ctx.fillStyle = 'rgba(255,255,255,0.8)';
    taperedStroke(layers.veins.ctx, pts, w * 0.4, w * 0.05);
    const g = Math.round(60 + rng.next() * 140);
    layers.tint.ctx.fillStyle = `rgb(${g},${g},${g})`;
    taperedStroke(layers.tint.ctx, pts, w, w * 0.15);
  }

  if (depth === 0 && p.sideShoots > 0) {
    for (let k = 0; k < p.sideShoots; k++) {
      const t = 0.15 + (0.6 * (k + 0.5)) / p.sideShoots + rng.signed() * 0.04;
      const idx = Math.min(16, Math.round(t * 16));
      const side = k % 2 === 0 ? 1 : -1;
      const a = side * (0.6 + rng.signed() * 0.12);
      const d = [dir[0] * Math.cos(a) - dir[1] * Math.sin(a), dir[0] * Math.sin(a) + dir[1] * Math.cos(a)];
      drawNeedleShoot(layers, map, p, rng, twig[idx], d, length * (1 - t) * 0.65, scale * 0.75, 1);
    }
  }
}

function drawNeedles(layers, map, p, aspect, rng) {
  drawNeedleShoot(layers, map, p, rng, [0, 0.01], [0, 1], 0.97, 1, 0);
}

function drawFrond(layers, map, p, aspect, rng) {
  const toPx = (q) => map.P(q[0], q[1]);
  const rachis = [];
  const bend = rng.signed() * 0.02;
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    rachis.push([bend * t * t, 0.005 + t * 0.985]);
  }
  woodStroke(layers, rachis.map(toPx), 0.022 * map.unit, 0.004 * map.unit);

  const n = p.leaflets;
  const ang = (p.leafletAngle * Math.PI) / 180;
  const half = (aspect / 2) * 0.97;
  for (let i = 0; i < n; i++) {
    const s = 0.05 + (0.93 * i) / (n - 1);
    const profile = Math.sin(Math.PI * Math.min(1, s ** 0.85)) ** 0.55 * 0.92 + 0.08;
    for (const side of [1, -1]) {
      if (rng.next() < p.gaps * 0.25) continue;
      const sJ = Math.min(0.995, s + rng.signed() * 0.004 + (side < 0 ? 0.006 : 0));
      const base = [bend * sJ * sJ, 0.005 + sJ * 0.985];
      const a = ang + rng.signed() * 0.05;
      let L = (half / Math.sin(a)) * profile;
      if (rng.next() < p.gaps * 0.3) L *= rng.range(0.45, 0.85);
      const droop = p.leafletDroop * L * 0.35;
      const w = Math.max(0.004, (0.985 / n) * 2.2 * p.leafletWidth);
      const center = [];
      for (let j = 0; j <= 10; j++) {
        const t = j / 10;
        center.push([base[0] + side * Math.sin(a) * L * t, base[1] + Math.cos(a) * L * t - droop * t * t]);
      }
      const widthAt = (t) => w * Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.05)) ** 0.6 * (1 - t * 0.35);
      const outline = new Path2D();
      center.forEach((c, j) => {
        const P = toPx([c[0], c[1] + widthAt(j / 10) * 0.5]);
        if (j === 0) outline.moveTo(...P);
        else outline.lineTo(...P);
      });
      for (let j = 10; j >= 0; j--) outline.lineTo(...toPx([center[j][0], center[j][1] - widthAt(j / 10) * 0.5]));
      outline.closePath();
      stackShape(layers, outline, map, 0.3 + rng.next() * 0.4, 0.5);
      const v = layers.veins.ctx;
      v.globalAlpha = 0.7;
      v.strokeStyle = '#fff';
      v.lineWidth = Math.max(0.8, w * 0.12 * map.unit);
      v.beginPath();
      center.forEach((q, k) => (k === 0 ? v.moveTo(...toPx(q)) : v.lineTo(...toPx(q))));
      v.stroke();
      v.globalAlpha = 1;
    }
  }
}

function drawBlades(layers, map, p, aspect, rng) {
  const toPx = (q) => map.P(q[0], q[1]);
  const n = Math.max(1, p.blades);
  for (let b = 0; b < n; b++) {
    const single = n === 1;
    const half = single ? (aspect / 2) * 0.96 : aspect * (0.07 + 0.03 * rng.next());
    const x0 = single ? 0 : rng.signed() * aspect * 0.25;
    const height = single ? 0.985 : rng.range(0.55, 0.98);
    const lean = single ? 0 : rng.signed() * aspect * 0.35;
    const center = [];
    for (let j = 0; j <= 20; j++) {
      const t = j / 20;
      center.push([x0 + lean * t * t, 0.005 + t * height]);
    }
    const hw = (t) => half * (1 - p.bladeTaper * t ** 2.2) * Math.min(1, ((1 - t) / 0.14) ** 0.75);
    const outline = new Path2D();
    center.forEach((c, j) => {
      const P = toPx([c[0] + hw(j / 20), c[1]]);
      if (j === 0) outline.moveTo(...P);
      else outline.lineTo(...P);
    });
    for (let j = 20; j >= 0; j--) outline.lineTo(...toPx([center[j][0] - hw(j / 20), center[j][1]]));
    outline.closePath();
    stackShape(layers, outline, map, 0.3 + rng.next() * 0.4, 0.4);
    const v = layers.veins.ctx;
    v.globalAlpha = 0.6;
    v.strokeStyle = '#fff';
    v.lineWidth = Math.max(0.8, half * 0.18 * map.unit);
    v.beginPath();
    center.forEach((q, k) => (k === 0 ? v.moveTo(...toPx(q)) : v.lineTo(...toPx(q))));
    v.stroke();
    v.globalAlpha = 1;
  }
}

const DRAW = { broadleaf: drawBroadleaf, twig: drawTwig, needles: drawNeedles, frond: drawFrond, blade: drawBlades };

/** Separable box blur (3 passes ≈ gaussian) on a single 8-bit channel. */
function blurChannel(src, size, radius) {
  const a = new Float32Array(src);
  const b = new Float32Array(size * size);
  const r = Math.max(1, Math.round(radius));
  const norm = 1 / (2 * r + 1);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < size; y++) {
      const row = y * size;
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += a[row + Math.min(size - 1, Math.max(0, x))];
      for (let x = 0; x < size; x++) {
        b[row + x] = acc * norm;
        acc += a[row + Math.min(size - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < size; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[Math.min(size - 1, Math.max(0, y)) * size + x];
      for (let y = 0; y < size; y++) {
        a[y * size + x] = acc * norm;
        acc += b[Math.min(size - 1, y + r + 1) * size + x] - b[Math.max(0, y - r) * size + x];
      }
    }
  }
  return a;
}

function drawLayers(p, size) {
  const layout = leafLayout(p);
  const layers = {
    mask: makeCanvas(size),
    veins: makeCanvas(size),
    wood: makeCanvas(size),
    occl: makeCanvas(size, '#fff'),
    tint: makeCanvas(size, '#808080'),
  };
  const draw = DRAW[p.kind] || drawBroadleaf;
  layout.cells.forEach((cell, k) => {
    const map = cellMapper(cell, layout.aspect, size);
    const rng = new Rng((p.seed * 1013 + k * 7919 + 1) >>> 0);
    const variant = { ...p };
    if (p.kind === 'broadleaf' || p.kind === 'twig') variant.width = p.width * (1 + rng.signed() * 0.05);
    // keep each variant inside its own cell
    const x0 = cell.u0 * size - 1, y0 = cell.v0 * size - 1;
    const w = (cell.u1 - cell.u0) * size + 2, h = (cell.v1 - cell.v0) * size + 2;
    for (const l of Object.values(layers)) {
      l.ctx.save();
      l.ctx.beginPath();
      l.ctx.rect(x0, y0, w, h);
      l.ctx.clip();
    }
    draw(layers, map, variant, layout.aspect, rng);
    for (const l of Object.values(layers)) l.ctx.restore();
  });

  const get = (l) => l.ctx.getImageData(0, 0, size, size).data;
  const m = get(layers.mask), v = get(layers.veins), w = get(layers.wood), o = get(layers.occl), t = get(layers.tint);
  const n = size * size;
  const maskCh = new Uint8Array(n);
  for (let i = 0; i < n; i++) maskCh[i] = m[i * 4];
  const blurred = blurChannel(maskCh, size, size / 160);
  const l1 = new Uint8Array(n * 4);
  const l2 = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    l1[i * 4] = m[i * 4];
    l1[i * 4 + 1] = v[i * 4];
    l1[i * 4 + 2] = Math.min(255, blurred[i]);
    l1[i * 4 + 3] = w[i * 4];
    l2[i * 4] = o[i * 4];
    l2[i * 4 + 1] = t[i * 4];
    l2[i * 4 + 3] = 255;
  }
  return { l1, l2, layout };
}

// ---------------------------------------------------------------------------
// Stage 2: GPU composite

const COMMON = /* glsl */ `
${GLSL_NOISE}
uniform sampler2D uLayers;
uniform sampler2D uLayers2;
uniform int uKind;
uniform uint uSeed;
uniform float uDryness;
`;

// heavy procedural work, once per pixel -> half-float target
const DATA_FRAG = /* glsl */ `
${COMMON}
float tertiary(vec2 uv) {
  float freq = uKind == 4 ? 110.0 : 48.0;
  vec4 v = pvoronoi(uv * freq, ivec2(int(freq)), uSeed + 3U, 0.9);
  return 1.0 - smoothstep(0.0, 0.07, v.x);
}

vec4 bake(vec2 uv) {
  vec4 L = textureLod(uLayers, uv, 0.0);
  vec4 L2 = textureLod(uLayers2, uv, 0.0);
  float dome = sqrt(L.b);
  float stack = (L2.r - 1.0) * 0.25; // lower leaves sit below the ones covering them
  float tert = tertiary(uv) * L.r;
  float h;
  if (uKind == 1 || uKind == 3) h = dome * 0.35 + L.g * 0.45 + L.a * 0.6 + stack;
  else {
    float pucker = pnoise(uv * 64.0, ivec2(64), uSeed + 9U) * 0.05;
    h = dome * 0.45 - L.g * 0.35 - tert * 0.05 + pucker * L.r + L.a * 0.5 * (1.0 - L.r) + stack;
  }
  float edge = 1.0 - smoothstep(0.12, 0.55, L.b);
  float dn = pfbm(uv, ivec2(5), 5, uSeed + 23U) * 0.5 + 0.5;
  vec4 sp = pvoronoi(uv * 22.0, ivec2(22), uSeed + 29U, 1.0);
  float spot = (1.0 - smoothstep(0.0, 0.05 + 0.1 * sp.y, length(sp.zw))) * step(1.0 - uDryness * 0.35, sp.y);
  float dry = clamp(smoothstep(1.0 - uDryness, 1.25 - uDryness, edge * 0.75 + dn * 0.55) + spot, 0.0, 1.0) * step(0.001, uDryness);
  return vec4(h, tert, dry, dn);
}
`;

const SHADE_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D uData;
uniform int uOutput; // 0 albedo, 1 normal, 2 orm, 3 translucency
uniform vec4 uCells[4];
uniform int uCellCount;
uniform vec3 uBase, uTip, uVein;
uniform float uVariation, uRoughness, uNormalStrength, uTranslucency;

float leafY(vec2 uv, out float cellRnd) {
  for (int i = 0; i < 4; i++) {
    if (i >= uCellCount) break;
    vec4 c = uCells[i];
    if (uv.x >= c.x && uv.x <= c.z && uv.y >= c.y && uv.y <= c.w) {
      cellRnd = hash12(ivec2(i, 7), uSeed);
      return (c.w - uv.y) / (c.w - c.y);
    }
  }
  cellRnd = 0.5;
  return 0.5;
}

vec4 bake(vec2 uv) {
  vec4 L = textureLod(uLayers, uv, 0.0);
  vec4 L2 = textureLod(uLayers2, uv, 0.0);
  vec4 D = textureLod(uData, uv, 0.0);
  float mask = L.r, vein = L.g, wood = L.a;
  float occl = L2.r, tint = L2.g;
  float tert = D.g, dry = D.b, dn = D.a;
  float alpha = max(mask, wood);

  if (uOutput == 1) {
    float e = 1.0 / uResolution.x;
    float hx = textureLod(uData, uv + vec2(e, 0.0), 0.0).r - textureLod(uData, uv - vec2(e, 0.0), 0.0).r;
    float hy = textureLod(uData, uv + vec2(0.0, e), 0.0).r - textureLod(uData, uv - vec2(0.0, e), 0.0).r;
    float k = uNormalStrength * (uKind == 4 ? 0.0025 : 0.004) / (2.0 * e);
    vec3 n = normalize(vec3(-hx * k, hy * k, 1.0));
    return vec4(n * 0.5 + 0.5, 1.0);
  }

  float cellRnd;
  float ly = leafY(uv, cellRnd);
  float edge = 1.0 - smoothstep(0.12, 0.55, L.b);
  float mott = pfbm(uv, ivec2(6), 3, uSeed + 21U);
  float shade = mix(0.5, 1.0, occl);

  if (uOutput == 2) {
    float ao = (1.0 - 0.22 * vein * mask - 0.08 * tert) * shade;
    float r = uRoughness + 0.12 * dry - 0.06 * vein + 0.05 * mott;
    if (wood > 0.5 && mask < 0.5) r = max(r, 0.7);
    return vec4(ao, clamp(r, 0.05, 1.0), 0.0, 1.0);
  }

  if (uOutput == 3) {
    float t = uTranslucency * mask * (1.0 - 0.55 * vein) * (1.0 - 0.75 * dry) * mix(1.0, 0.75, sqrt(L.b)) * sqrt(occl);
    if (uKind == 1) t *= 0.8;
    return vec4(vec3(clamp(t, 0.0, 1.0)), 1.0);
  }

  // in clusters the gradient follows per-leaf tint instead of the card axis
  vec3 col = mix(uBase, uTip, smoothstep(0.05, 1.0, uKind == 4 ? 0.35 + 0.3 * tint : ly));
  vec3 yellow = col * vec3(1.35, 1.15, 0.55);
  col = mix(col, yellow, clamp(cellRnd * 0.6 + (tint - 0.5), 0.0, 1.0) * uVariation * 0.5);
  col *= 1.0 + (tint - 0.5) * uVariation * 0.35;
  col *= 1.0 + mott * uVariation * 0.25;
  col = mix(col, uVein, vein * 0.75 * mask);
  col = mix(col, uVein, tert * 0.12);
  col = mix(col, col * vec3(1.18, 1.12, 0.8), edge * 0.35 * mask);
  vec3 dryCol = mix(vec3(0.20, 0.10, 0.03), vec3(0.42, 0.30, 0.08), dn);
  col = mix(col, dryCol, dry * 0.85);
  vec3 woodCol = uKind == 1 ? uVein : uVein * 0.7;
  col = mix(woodCol, col, uKind == 1 ? mask : max(mask, 1.0 - wood));
  col *= shade;
  return vec4(linearToSrgb(col), alpha);
}
`;

let dataProgram = null;
let shadeProgram = null;

export function bakeLeaf(p) {
  if (!dataProgram) dataProgram = createBakeProgram(DATA_FRAG, { uLayers: { value: null }, uLayers2: { value: null } });
  if (!shadeProgram) shadeProgram = createBakeProgram(SHADE_FRAG, { uLayers: { value: null }, uLayers2: { value: null }, uData: { value: null }, uCells: { value: [] } });
  const size = Number(p.resolution) || 1024;
  const { l1, l2, layout } = drawLayers(p, size);
  const t1 = dataTexture(l1, size, { mipmaps: false });
  const t2 = dataTexture(l2, size, { mipmaps: false });

  const cells = [0, 1, 2, 3].map((i) => {
    const c = layout.cells[i] || layout.cells[0];
    return new THREE.Vector4(c.u0, c.v0, c.u1, c.v1);
  });
  const common = {
    uLayers: t1,
    uLayers2: t2,
    uKind: KINDS[p.kind] ?? 0,
    uSeed: (p.seed * 4099 + 7) >>> 0,
    uCells: cells,
    uCellCount: layout.cells.length,
    uBase: hexToLinear(p.colorBase),
    uTip: hexToLinear(p.colorTip),
    uVein: hexToLinear(p.colorVein),
    uVariation: p.colorVariation,
    uDryness: p.dryness,
    uRoughness: p.roughness,
    uNormalStrength: p.normalStrength,
    uTranslucency: p.translucency,
  };
  common.uData = dataProgram.data({ uLayers: t1, uLayers2: t2, uKind: common.uKind, uSeed: common.uSeed, uDryness: p.dryness }, size);
  const out = {
    size,
    layout,
    albedo: shadeProgram.pixels({ ...common, uOutput: 0 }, size),
    normal: shadeProgram.pixels({ ...common, uOutput: 1 }, size),
    orm: shadeProgram.pixels({ ...common, uOutput: 2 }, size),
    translucency: shadeProgram.pixels({ ...common, uOutput: 3 }, size),
  };
  t1.dispose();
  t2.dispose();
  return out;
}
