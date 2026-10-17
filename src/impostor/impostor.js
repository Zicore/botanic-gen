// Far-LOD impostors: the finished tree rendered from frames × frames directions over the upper
// hemisphere into an albedo and an object-space normal atlas (hemi-octahedral layout). At runtime
// a camera-facing quad blends the four frames nearest to the view direction, and the baked
// normals let the engine light it like the real mesh.
//
// Conventions (shared by the bake, the viewport material and the Godot shader):
//   frame (i, j) is atlas tile column i, row j (row 0 at the image top, uv v = 0 at the top)
//   its view direction d = hemiOctDecode(((i, j) + 0.5) / frames * 2 - 1)
//   its image basis: right = normalize(cross(up0, d)), up = cross(d, right),
//   up0 = (0, 1, 0), or (0, 0, -1) when d is (nearly) vertical
//   the frame shows the bounding sphere (center, radius) orthographically, 2 * radius wide
//   albedo atlas: sRGB colour (AO and tint baked in) + coverage alpha
//   normal atlas: object-space normal * 0.5 + 0.5, alpha = translucency (0 on bark)

import * as THREE from 'three';
import { dataTexture } from '../materials/gpu.js';

export const IMPOSTOR_DEFAULTS = { frames: 8, frameSize: 128 };

export function hemiOctDecode(ex, ey) {
  const x = (ex + ey) * 0.5;
  const z = (ex - ey) * 0.5;
  return new THREE.Vector3(x, 1 - Math.abs(x) - Math.abs(z), z).normalize();
}

export function frameBasis(d) {
  const up0 = Math.abs(d.y) > 0.999 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up0, d).normalize();
  return { up0, right, up: new THREE.Vector3().crossVectors(d, right) };
}

/** Bounding sphere of the mesh around its box center (tighter than the box diagonal). */
export function impostorSphere(result) {
  const c = new THREE.Vector3().addVectors(new THREE.Vector3().fromArray(result.bounds.min), new THREE.Vector3().fromArray(result.bounds.max)).multiplyScalar(0.5);
  let r2 = 0;
  for (const g of result.groups) {
    const p = g.attributes.position;
    for (let i = 0; i < p.length; i += 3) {
      const dx = p[i] - c.x, dy = p[i + 1] - c.y, dz = p[i + 2] - c.z;
      r2 = Math.max(r2, dx * dx + dy * dy + dz * dz);
    }
  }
  return { center: c, radius: Math.sqrt(r2) * 1.01 };
}

// ---------------------------------------------------------------------------
// Bake

const BAKE_VERT = /* glsl */ `
attribute vec4 acolor;
varying vec2 vUv;
varying vec4 vColor;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vColor = acolor;
  vNormal = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const BAKE_FRAG = /* glsl */ `
uniform sampler2D map;
uniform sampler2D transMap;
uniform bool hasMap;
uniform bool hasTrans;
uniform bool isLeaf;
uniform float alphaCutoff;
uniform float depthDarken;
uniform int bakePass; // 0 albedo, 1 normal
varying vec2 vUv;
varying vec4 vColor;
varying vec3 vNormal;

vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec4 t = hasMap ? texture2D(map, vUv) : vec4(0.35, 0.3, 0.25, 1.0);
  if (isLeaf) {
    // same mip-aware alpha as the foliage shaders, so the silhouette matches the mesh LODs
    vec2 ts = vec2(textureSize(map, 0));
    vec2 dx = dFdx(vUv * ts), dy = dFdy(vUv * ts);
    float lod = max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));
    if (t.a * (1.0 + lod * 0.25) < alphaCutoff) discard;
  }
  if (bakePass == 0) {
    // the impostor can't receive its own shadows, so darken what lies deep in the crown as seen
    // from this view: inner leaves visible from outside sit in shadow on the real mesh too.
    // Ortho depth: sphere front 0.25, center 0.5, back 0.75.
    float inner = smoothstep(0.3, 0.65, gl_FragCoord.z);
    gl_FragColor = vec4(toSrgb(clamp(t.rgb * vColor.rgb * (1.0 - depthDarken * inner), 0.0, 1.0)), 1.0);
  } else {
    // leaves keep their canopy-blended normal on both sides (like keep_back_normals)
    vec3 n = normalize(vNormal);
    if (!isLeaf && !gl_FrontFacing) n = -n;
    float tr = isLeaf && hasTrans ? texture2D(transMap, vUv).r * vColor.r : 0.0;
    gl_FragColor = vec4(n * 0.5 + 0.5, tr);
  }
}`;

/**
 * Renders the impostor atlases. `result` is a generator result (normally LOD0), `textures` the
 * engine texture cache. Returns raw RGBA atlases plus the sphere the frames were framed on.
 */
export function bakeImpostor(renderer, result, textures, { frames = IMPOSTOR_DEFAULTS.frames, frameSize = IMPOSTOR_DEFAULTS.frameSize } = {}) {
  const t0 = performance.now();
  const N = frames, res = frameSize, ss = 2, rtSize = res * ss, size = N * res;
  const { center, radius: R } = impostorSphere(result);

  const scene = new THREE.Scene();
  const meshes = [];
  for (const g of result.groups) {
    const A = g.attributes;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(A.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(A.normal, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(A.uv, 2));
    geo.setAttribute('acolor', new THREE.BufferAttribute(A.color, 4));
    geo.setIndex(new THREE.BufferAttribute(g.index, 1));
    const t = textures.get(g.materialId);
    const isLeaf = g.kind === 'leaf';
    const mat = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERT,
      fragmentShader: BAKE_FRAG,
      side: isLeaf ? THREE.DoubleSide : THREE.FrontSide,
      uniforms: {
        map: { value: t?.maps.albedo ?? null },
        transMap: { value: t?.maps.translucency ?? null },
        hasMap: { value: !!t?.maps.albedo },
        hasTrans: { value: !!t?.maps.translucency },
        isLeaf: { value: isLeaf },
        alphaCutoff: { value: t?.params.alphaCutoff ?? 0.45 },
        bakePass: { value: 0 },
        depthDarken: { value: 0.45 },
      },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    meshes.push(mesh);
  }

  const rt = new THREE.WebGLRenderTarget(rtSize, rtSize, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true });
  const cam = new THREE.OrthographicCamera(-R, R, R, -R, R * 0.01, R * 4);
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevShadows = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x000000, 0);

  const albedo = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const bufA = new Uint8Array(rtSize * rtSize * 4);
  const bufN = new Uint8Array(rtSize * rtSize * 4);
  const renderPass = (pass, buf) => {
    for (const m of meshes) m.material.uniforms.bakePass.value = pass;
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, rtSize, rtSize, buf);
  };

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const d = hemiOctDecode(((i + 0.5) / N) * 2 - 1, ((j + 0.5) / N) * 2 - 1);
      const { up0 } = frameBasis(d);
      cam.position.copy(center).addScaledVector(d, R * 2);
      cam.up.copy(up0);
      cam.lookAt(center);
      cam.updateMatrixWorld();
      renderPass(0, bufA);
      renderPass(1, bufN);
      // 2×2 supersampled, coverage-weighted downsample into tile (i, j); GL rows run bottom-up
      for (let y = 0; y < res; y++) {
        for (let x = 0; x < res; x++) {
          let cov = 0, r = 0, g = 0, b = 0, nx = 0, ny = 0, nz = 0, tr = 0;
          for (let sy = 0; sy < ss; sy++) {
            const row = rtSize - 1 - (y * ss + sy);
            for (let sx = 0; sx < ss; sx++) {
              const p = (row * rtSize + x * ss + sx) * 4;
              const a = bufA[p + 3] / 255;
              if (a <= 0) continue;
              cov += a;
              r += bufA[p] * a; g += bufA[p + 1] * a; b += bufA[p + 2] * a;
              nx += bufN[p] * a; ny += bufN[p + 1] * a; nz += bufN[p + 2] * a; tr += bufN[p + 3] * a;
            }
          }
          const o = (((j * res + y) * size) + i * res + x) * 4;
          if (cov > 0) {
            albedo[o] = r / cov; albedo[o + 1] = g / cov; albedo[o + 2] = b / cov;
            normal[o] = nx / cov; normal[o + 1] = ny / cov; normal[o + 2] = nz / cov; normal[o + 3] = tr / cov;
          }
          albedo[o + 3] = Math.round((cov / (ss * ss)) * 255);
        }
      }
    }
  }

  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.shadowMap.autoUpdate = prevShadows;
  rt.dispose();
  for (const m of meshes) {
    m.geometry.dispose();
    m.material.dispose();
  }

  dilate(albedo, normal, size, res);
  return { frames: N, frameSize: res, size, center: center.toArray(), radius: R, albedo, normal, ms: Math.round(performance.now() - t0) };
}

/**
 * Fills uncovered pixels with the colour/normal of the nearest covered pixel of the same tile
 * (multi-source BFS), so bilinear filtering and mipmaps never pull in black.
 */
function dilate(albedo, normal, size, res) {
  const n = size * size;
  const src = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  for (let p = 0; p < n; p++) {
    if (albedo[p * 4 + 3] > 0) {
      src[p] = p;
      queue[tail++] = p;
    }
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % size, y = (p / size) | 0;
    const tx = (x / res) | 0, ty = (y / res) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      if (((nx / res) | 0) !== tx || ((ny / res) | 0) !== ty) continue;
      const q = ny * size + nx;
      if (src[q] !== -1) continue;
      src[q] = src[p];
      queue[tail++] = q;
    }
  }
  for (let p = 0; p < n; p++) {
    const s = src[p];
    if (s === -1 || s === p) continue;
    for (let c = 0; c < 3; c++) albedo[p * 4 + c] = albedo[s * 4 + c];
    for (let c = 0; c < 4; c++) normal[p * 4 + c] = normal[s * 4 + c];
  }
  for (let p = 0; p < n; p++) {
    if (src[p] === -1) {
      normal[p * 4] = normal[p * 4 + 2] = 128;
      normal[p * 4 + 1] = 255;
    }
  }
}

// ---------------------------------------------------------------------------
// Viewport material (mirrors the Godot shader in export/godotShaders.js)

const IMPOSTOR_COMMON = /* glsl */ `
uniform float uImpFrames;
uniform vec3 uImpCenter;
uniform float uImpRadius;
varying vec4 vImpA;
varying vec4 vImpB;
varying vec4 vImpC;
varying vec4 vImpD;
varying vec4 vImpW;
`;

const IMPOSTOR_VERTEX = /* glsl */ `
vec2 impEncode(vec3 v) {
  v /= abs(v.x) + abs(v.y) + abs(v.z);
  return vec2(v.x + v.z, v.x - v.z);
}
vec3 impDecode(vec2 e) {
  vec3 v = vec3((e.x + e.y) * 0.5, 0.0, (e.x - e.y) * 0.5);
  v.y = 1.0 - abs(v.x) - abs(v.z);
  return normalize(v);
}
void impBasis(vec3 d, out vec3 r, out vec3 u) {
  vec3 up0 = abs(d.y) > 0.999 ? vec3(0.0, 0.0, -1.0) : vec3(0.0, 1.0, 0.0);
  r = normalize(cross(up0, d));
  u = cross(d, r);
}
// atlas uv (xy) and tile-local uv (zw) where the view ray through this vertex meets the frame plane
vec4 impFrameUv(vec2 cell, vec3 o, vec3 dir) {
  vec3 D = impDecode((cell + 0.5) / uImpFrames * 2.0 - 1.0);
  vec3 r, u;
  impBasis(D, r, u);
  vec3 L = o + dir * (dot(uImpCenter - o, D) / dot(dir, D)) - uImpCenter;
  vec2 local = vec2(dot(L, r), -dot(L, u)) / (2.0 * uImpRadius) + 0.5;
  return vec4((cell + local) / uImpFrames, local);
}
vec3 impostorVertex(vec2 q, mat4 model, mat4 view, mat4 proj) {
  mat4 invM = inverse(model);
  mat4 invV = inverse(view);
  bool ortho = proj[3][3] == 1.0;
  vec3 camO = (invM * vec4(invV[3].xyz, 1.0)).xyz;
  vec3 V = ortho ? normalize((invM * vec4(invV[2].xyz, 0.0)).xyz) : normalize(camO - uImpCenter);
  vec3 r, u;
  impBasis(V, r, u);
  vec3 P = uImpCenter + (r * q.x + u * q.y) * uImpRadius;
  vec3 o = ortho ? P + V * uImpRadius * 4.0 : camO;
  vec3 dir = ortho ? -V : P - camO;
  vec3 Vh = vec3(V.x, max(V.y, 0.0), V.z);
  Vh = dot(Vh, Vh) < 1e-6 ? vec3(0.0, 0.0, 1.0) : normalize(Vh);
  vec2 g = (impEncode(Vh) * 0.5 + 0.5) * uImpFrames - 0.5;
  vec2 c0 = clamp(floor(g), vec2(0.0), vec2(uImpFrames - 1.0));
  vec2 f = clamp(g - c0, 0.0, 1.0);
  vec2 c1 = min(c0 + 1.0, vec2(uImpFrames - 1.0));
  vImpA = impFrameUv(c0, o, dir);
  vImpB = impFrameUv(vec2(c1.x, c0.y), o, dir);
  vImpC = impFrameUv(vec2(c0.x, c1.y), o, dir);
  vImpD = impFrameUv(c1, o, dir);
  vImpW = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
  return P;
}
`;

const IMPOSTOR_FRAGMENT = /* glsl */ `
uniform sampler2D uImpAlbedo;
uniform sampler2D uImpNormal;
uniform float uImpAlphaBoost;
vec3 impNormal = vec3(0.0, 1.0, 0.0);
float impTrans = 0.0;
void impAccum(vec4 f, float w, inout vec4 col, inout vec4 nrm) {
  if (w <= 0.0 || any(lessThan(f.zw, vec2(0.0))) || any(greaterThan(f.zw, vec2(1.0)))) return;
  vec4 a = texture2D(uImpAlbedo, f.xy);
  float aw = a.a * w;
  col += vec4(a.rgb * aw, aw);
  nrm += texture2D(uImpNormal, f.xy) * aw;
}
vec4 impSample() {
  vec4 col = vec4(0.0), nrm = vec4(0.0);
  impAccum(vImpA, vImpW.x, col, nrm);
  impAccum(vImpB, vImpW.y, col, nrm);
  impAccum(vImpC, vImpW.z, col, nrm);
  impAccum(vImpD, vImpW.w, col, nrm);
  float cov = max(col.a, 1e-4);
  impNormal = normalize(nrm.rgb / cov * 2.0 - 1.0);
  impTrans = nrm.a / cov;
  vec2 ts = vec2(textureSize(uImpAlbedo, 0));
  vec2 dx = dFdx(vImpA.xy * ts), dy = dFdy(vImpA.xy * ts);
  float lod = max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));
  return vec4(col.rgb / cov, col.a * (1.0 + lod * uImpAlphaBoost));
}
`;

/** Viewport mesh for a bake result: lit like the leaf material, casts alpha-tested shadows. */
export function createImpostorMesh(bake, { alphaCutoff = 0.4, subsurface = '#a8c43c' } = {}) {
  const albedo = dataTexture(bake.albedo, bake.size, { srgb: true });
  const normal = dataTexture(bake.normal, bake.size);
  const uniforms = {
    uImpFrames: { value: bake.frames },
    uImpCenter: { value: new THREE.Vector3().fromArray(bake.center) },
    uImpRadius: { value: bake.radius },
    uImpAlbedo: { value: albedo },
    uImpNormal: { value: normal },
    uImpAlphaBoost: { value: 0.25 },
    uSubsurface: { value: new THREE.Color(subsurface) },
  };
  const patchVertex = (shader) =>
    shader.vertexShader
      .replace('#include <common>', `#include <common>\n${IMPOSTOR_COMMON}\n${IMPOSTOR_VERTEX}`)
      .replace('#include <begin_vertex>', 'vec3 transformed = impostorVertex(position.xy, modelMatrix, viewMatrix, projectionMatrix);');

  // envMapIntensity matches the leaf material, so the sky tint is the same as on the mesh LODs
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, side: THREE.DoubleSide, alphaTest: alphaCutoff, alphaToCoverage: true, envMapIntensity: 0.7 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = patchVertex(shader);
    const lights = THREE.ShaderChunk.lights_fragment_begin.replaceAll(
      'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
      `RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
      {
        float scatter = pow(saturate(dot(geometryViewDir, -directLight.direction)), 3.0) * 0.75
                      + saturate(dot(-geometryNormal, directLight.direction)) * 0.35;
        reflectedLight.directDiffuse += directLight.color * uSubsurface * diffuseColor.rgb * impTrans * 2.2 * scatter;
      }`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${IMPOSTOR_COMMON}\nuniform vec3 uSubsurface;\n${IMPOSTOR_FRAGMENT}`)
      .replace('#include <map_fragment>', 'vec4 impTexel = impSample();\ndiffuseColor *= impTexel;')
      .replace(
        '#include <normal_fragment_begin>',
        `float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
        vec3 normal = normalize(mat3(viewMatrix) * impNormal);
        vec3 nonPerturbedNormal = normal;`,
      )
      .replace('#include <lights_fragment_begin>', lights);
  };
  mat.customProgramCacheKey = () => 'botanica-impostor';

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: alphaCutoff, side: THREE.DoubleSide });
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = patchVertex(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${IMPOSTOR_COMMON}\n${IMPOSTOR_FRAGMENT}`)
      .replace('#include <map_fragment>', 'diffuseColor.a = impSample().a;');
  };
  depth.customProgramCacheKey = () => 'botanica-impostor-depth';

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.name = 'Impostor';
  mesh.frustumCulled = false; // vertices are placed in the shader
  mesh.castShadow = true;
  // no self-shadowing: the shadow pass turns the quad toward the light, and the visible quad
  // would be cut by that plane along a line through the tree center (same as the Godot shader)
  mesh.receiveShadow = false;
  mesh.customDepthMaterial = depth;
  mesh.userData.impostor = true;
  mesh.userData.dispose = () => {
    albedo.dispose();
    normal.dispose();
    mat.dispose();
    depth.dispose();
  };
  return mesh;
}
