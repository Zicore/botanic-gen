// Procedural, seamlessly tiling bark: albedo (sRGB), normal (OpenGL / +Y up), ORM.

import * as THREE from 'three';
import { GLSL_NOISE } from './glsl.js';
import { createBakeProgram, hexToLinear } from './gpu.js';

const STYLES = { furrowed: 0, plated: 1, smooth: 2, birch: 3, fibrous: 4 };


const DATA_FRAG = /* glsl */ `
${GLSL_NOISE}
uniform uint uSeed;
uniform ivec2 uPeriod;
uniform float uDepth, uCrackWidth, uWarp, uDetail, uRings, uAspect;

struct Bark { float h; float crack; float cell; float patchy; };

// period with square cells in world space (the tile is uAspect times taller than wide)
ivec2 isoPeriod(int k) { return ivec2(k, max(1, int(float(k) * uAspect + 0.5))); }

#if STYLE == 0
// Oak / ash: long braided vertical ridges, deep fissures, ridges broken into blocks.
// Fissures are the zero-isolines of a vertically stretched noise field: long meandering lines
// that approach and part again, which reads as the braided network of real oak bark.
Bark bark_braided(vec2 uv, ivec2 P) {
  float wx = pfbm(uv, ivec2(max(2, P.x / 2), max(2, P.y * 2)), 3, uSeed + 11U);
  vec2 p = uv + vec2(wx * uWarp * 0.9 / float(P.x), 0.0);
  float w = mix(0.025, 0.13, uCrackWidth);
  float n1 = pfbm(p, P, 4, uSeed);
  float n2 = pfbm(p + vec2(0.37, 0.11), ivec2(max(1, P.x / 2), max(1, P.y / 2)), 4, uSeed + 7U);
  float f1 = 1.0 - smoothstep(w * 0.55, w, abs(n1));
  float f2 = 1.0 - smoothstep(w * 0.45, w * 0.8, abs(n2));
  float fissure = max(f1, f2 * 0.85);
  // rounded ridge shoulders: height grows with distance from the nearest fissure line
  float shoulder = smoothstep(w, w * 3.2, min(abs(n1), abs(n2) * 1.4));
  // short horizontal breaks: zero-isolines of a horizontally stretched field, only on some ridges
  float m = pfbm(p, ivec2(max(1, P.x / 3), P.y * 7), 3, uSeed + 5U);
  float seg = smoothstep(0.0, 0.25, pnoise(p * vec2(float(P.x), float(P.y * 3)), ivec2(P.x, P.y * 3), uSeed + 9U));
  float hb = (1.0 - smoothstep(0.02, 0.06, abs(m))) * seg;
  // crumbly, isotropic surface detail
  float crumb = pfbm(uv, isoPeriod(P.x * 3), 4, uSeed + 77U);
  float flake = pfbm(uv, isoPeriod(P.x * 9), 3, uSeed + 78U);
  float top = 0.56 + 0.22 * shoulder + 0.1 * m + crumb * 0.18 * uDetail + flake * 0.09 * uDetail;
  top *= 1.0 - 0.5 * hb * uDepth;
  float floorH = (1.0 - uDepth) * 0.5 + 0.06 * crumb;
  float h = mix(top, floorH, fissure);
  float lichen = smoothstep(0.3, 0.6, pfbm(uv, isoPeriod(5), 5, uSeed + 81U)) * smoothstep(0.4, 0.8, flake * 0.5 + 0.5);
  return Bark(clamp(h, 0.0, 1.0), max(fissure, hb * 0.6), 0.5 + 0.5 * m, lichen * (1.0 - fissure));
}
#endif

#if STYLE == 1 || STYLE == 3
Bark bark_furrowed(vec2 uv, ivec2 P, float flaky) {
  vec2 w = vec2(pfbm(uv, ivec2(3, 2), 4, uSeed + 11U), pfbm(uv, ivec2(3, 2), 4, uSeed + 37U));
  vec2 x = uv * vec2(P) + uWarp * 0.9 * w;
  vec4 v = pvoronoi(x, P, uSeed, 1.0);
  vec4 v2 = pvoronoi(x * 2.0 + w * 0.7, P * 2, uSeed + 5U, 1.0);
  float cw = mix(0.04, 0.4, uCrackWidth);
  // big furrows plus a medium crack network that splits the ridges
  float e = min(v.x, v2.x * 0.55 + 0.12 * (1.0 - uDepth));
  float ridge = smoothstep(0.0, cw, e);
  // ridges are rounded: they rise toward the middle of each plate
  float dome = smoothstep(0.0, cw * 3.5, v.x);
  float fib = pfbm(uv, ivec2(P.x * 10, max(1, P.y)), 4, uSeed + 3U);
  float crumb = pfbm(uv, P * 12, 3, uSeed + 77U);
  float tilt = flaky * dot(v.zw, normalize(hash22(ivec2(v.y * 997.0), uSeed) - 0.5)) * 0.6;
  float top = 0.5 + 0.28 * dome + 0.1 * v.y + 0.1 * fib * uDetail + 0.07 * crumb * uDetail + tilt;
  float h = mix(1.0 - uDepth, top, ridge);
  return Bark(clamp(h, 0.0, 1.0), 1.0 - ridge, v.y, 0.0);
}

#endif

#if STYLE == 2 || STYLE == 3
Bark bark_smooth(vec2 uv, ivec2 P) {
  float h = 0.62 + 0.10 * pfbm(uv, ivec2(3, 4), 4, uSeed + 1U) + uDetail * 0.05 * pfbm(uv, P * 6, 3, uSeed + 2U);
  // horizontal lenticels
  vec4 l = pvoronoi(uv * vec2(P * ivec2(3, 9)), P * ivec2(3, 9), uSeed + 9U, 0.8);
  float len = (1.0 - smoothstep(0.08, 0.3, l.x * (1.0 + l.y))) * step(0.55, l.y);
  h -= len * 0.18 * uRings;
  // faint wrinkles
  h += 0.04 * uDepth * pnoise(uv * vec2(P.x * 2, P.y * 12), ivec2(P.x * 2, P.y * 12), uSeed + 4U);
  return Bark(clamp(h, 0.0, 1.0), len * uRings * 0.6, 0.5 + 0.5 * pfbm(uv, ivec2(2, 2), 2, uSeed + 8U), 0.0);
}

#endif

#if STYLE == 3
Bark bark_birch(vec2 uv, ivec2 P) {
  Bark s = bark_smooth(uv, P);
  // long horizontal dark dashes
  ivec2 LP = ivec2(max(1, P.x), max(2, P.y * 7));
  vec4 l = pvoronoi(uv * vec2(LP), LP, uSeed + 21U, 0.9);
  float dash = (1.0 - smoothstep(0.04, 0.16, abs(l.w) * 1.6 + (1.0 - abs(l.z)) * 0.05)) * step(0.35, l.y);
  // black fissured patches
  float pf = pfbm(uv, ivec2(2, 3), 5, uSeed + 31U) * 0.5 + 0.5;
  float patchMask = smoothstep(0.62 - uDepth * 0.12, 0.7 - uDepth * 0.12, pf);
  Bark f = bark_furrowed(uv, P * ivec2(2, 1), 0.0);
  float h = mix(s.h, f.h * 0.55, patchMask);
  h -= dash * 0.12 * uRings;
  // peeling paper strips
  float peel = smoothstep(0.55, 0.85, pnoise(uv * vec2(4.0, 22.0), ivec2(4, 22), uSeed + 41U) + 0.4);
  h += peel * 0.05;
  float crack = max(patchMask * (0.6 + 0.4 * f.crack), dash * uRings);
  return Bark(clamp(h, 0.0, 1.0), crack, s.cell, patchMask);
}

#endif

#if STYLE == 4
Bark bark_fibrous(vec2 uv, ivec2 P) {
  // palm-style: leaf-scar rings over vertical fibres, a few vertical splits
  float fib = pfbm(uv, ivec2(P.x * 9, max(1, P.y / 2)), 4, uSeed + 61U);
  int rings = max(1, P.y * 2);
  float warp = 0.1 * pfbm(uv, ivec2(3, 1), 3, uSeed + 63U);
  float band = fract(uv.y * float(rings) + warp);
  float ridge = smoothstep(0.0, 0.1, band) * (1.0 - smoothstep(0.3, 1.0, band));
  float scar = 1.0 - smoothstep(0.0, 0.06, abs(band - 0.03));
  float split = smoothstep(0.78, 0.95, abs(pnoise(uv * vec2(float(P.x * 3), 2.0), ivec2(P.x * 3, 2), uSeed + 67U)) * 1.6);
  float h = 0.42 + 0.34 * ridge * uRings + 0.2 * fib * uDetail - scar * 0.25 * uRings - split * uDepth * 0.35;
  return Bark(clamp(h, 0.0, 1.0), clamp(split * 0.8 + scar * 0.5 * uRings, 0.0, 1.0), 0.5 + 0.5 * fib, 0.0);
}
#endif

vec4 bake(vec2 uv) {
#if STYLE == 1
  Bark b = bark_furrowed(uv, uPeriod, 1.0);
#elif STYLE == 2
  Bark b = bark_smooth(uv, uPeriod);
#elif STYLE == 3
  Bark b = bark_birch(uv, uPeriod);
#elif STYLE == 4
  Bark b = bark_fibrous(uv, uPeriod);
#else
  Bark b = bark_braided(uv, uPeriod);
#endif
  return vec4(b.h, b.crack, b.cell, b.patchy);
}
`;

const SHADE_FRAG = /* glsl */ `
${GLSL_NOISE}
uniform sampler2D uData;
uniform int uStyle;
uniform int uOutput; // 0 albedo, 1 normal, 2 orm
uniform uint uSeed;
uniform ivec2 uPeriod;
uniform float uMoss;
uniform vec3 uTop, uCrack, uVar, uMossCol;
uniform float uRoughness, uNormalStrength, uAspect;

struct Bark { float h; float crack; float cell; float patchy; };

vec4 bake(vec2 uv) {
  vec4 d = texture(uData, uv);
  Bark b = Bark(d.r, d.g, d.b, d.a);
  if (uOutput == 1) {
    float e = 1.0 / uResolution.x;
    float hx = texture(uData, uv + vec2(e, 0.0)).r - texture(uData, uv - vec2(e, 0.0)).r;
    float hy = texture(uData, uv + vec2(0.0, e)).r - texture(uData, uv - vec2(0.0, e)).r;
    float k = uNormalStrength * 0.02 / (2.0 * e);
    // +Y is image-up = decreasing v
    vec3 n = normalize(vec3(-hx * k, hy * k / uAspect, 1.0));
    return vec4(n * 0.5 + 0.5, 1.0);
  }

  float low = pfbm(uv, ivec2(2, 3), 4, uSeed + 91U) * 0.5 + 0.5;
  float fine = pfbm(uv, uPeriod * 6, 3, uSeed + 93U) * 0.5 + 0.5;
  float mossMask = 0.0;
  if (uMoss > 0.0) {
    float m = pfbm(uv, ivec2(2, 2), 5, uSeed + 95U) * 0.5 + 0.5 + (1.0 - b.h) * 0.35;
    mossMask = smoothstep(1.05 - uMoss * 0.75, 1.2 - uMoss * 0.75, m) * (0.6 + 0.4 * fine);
  }

  if (uOutput == 2) {
    float ao = mix(0.35, 1.0, smoothstep(0.0, 0.75, b.h));
    float r = uRoughness + 0.06 * b.crack + 0.05 * mossMask - 0.04 * fine;
    if (uStyle == 3) r -= 0.18 * (1.0 - b.patchy);
    if (uStyle == 0) r += 0.05 * b.patchy;
    return vec4(ao, clamp(r, 0.04, 1.0), 0.0, 1.0);
  }

  vec3 col = mix(uCrack, uTop, smoothstep(0.12, 0.85, b.h));
  col = mix(col, uVar, clamp(b.cell * 0.55 + low * 0.45, 0.0, 1.0) * 0.45 * (1.0 - b.crack));
  // weathered, lighter ridge tops
  col = mix(col, uVar * 1.15, smoothstep(0.72, 1.0, b.h) * (0.35 + 0.4 * low) * (1.0 - b.crack));
  col *= 0.88 + 0.24 * fine;
  if (uStyle == 3) col = mix(col, uCrack * 1.4, b.patchy * 0.85);
  // pale crustose lichen on ridge tops
  if (uStyle == 0) col = mix(col, uVar * vec3(1.2, 1.25, 1.15), b.patchy * 0.35);
  col = mix(col, uMossCol * (0.75 + 0.5 * fine), mossMask * 0.9);
  col *= mix(0.6, 1.0, smoothstep(0.0, 0.55, b.h));
  if (uStyle == 0) col *= mix(0.72, 1.05, smoothstep(0.45, 0.85, b.h));
  return vec4(linearToSrgb(col), 1.0);
}
`;

const dataPrograms = new Map();
let shadeProgram = null;

export function bakeBark(p) {
  const style = STYLES[p.style] ?? 0;
  if (!dataPrograms.has(style)) dataPrograms.set(style, createBakeProgram(DATA_FRAG, {}, { STYLE: style }));
  if (!shadeProgram) shadeProgram = createBakeProgram(SHADE_FRAG, { uData: { value: null } });
  const size = Number(p.resolution) || 1024;
  const px = Math.max(1, Math.round(p.scale));
  const py = Math.max(1, Math.round((p.scale * p.tileAspect) / p.stretch));
  const seed = (p.seed * 7919 + 13) >>> 0;
  const period = new THREE.Vector2(px, py);
  const data = dataPrograms.get(style).data({
    uSeed: seed, uPeriod: period, uDepth: p.depth, uCrackWidth: p.crackWidth, uWarp: p.warp, uDetail: p.detail, uRings: p.rings,
    uAspect: p.tileAspect,
  }, size);
  const common = {
    uData: data,
    uStyle: style,
    uSeed: seed,
    uPeriod: period,
    uMoss: p.moss,
    uTop: hexToLinear(p.colorTop),
    uCrack: hexToLinear(p.colorCrack),
    uVar: hexToLinear(p.colorVar),
    uMossCol: hexToLinear(p.colorMoss),
    uRoughness: p.roughness,
    uNormalStrength: p.normalStrength,
    uAspect: p.tileAspect,
  };
  return {
    size,
    albedo: shadeProgram.pixels({ ...common, uOutput: 0 }, size),
    normal: shadeProgram.pixels({ ...common, uOutput: 1 }, size),
    orm: shadeProgram.pixels({ ...common, uOutput: 2 }, size),
  };
}
