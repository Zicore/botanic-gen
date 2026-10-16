// Shared GLSL: integer hashing, periodic (tileable) gradient noise, fbm and voronoi.
// All lattice coordinates are wrapped by an integer period so textures tile seamlessly.

export const GLSL_NOISE = /* glsl */ `
uint hashU(uint x) {
  x ^= x >> 16; x *= 0x7feb352dU;
  x ^= x >> 15; x *= 0x846ca68bU;
  x ^= x >> 16;
  return x;
}
ivec2 wrapCell(ivec2 c, ivec2 period) { return ((c % period) + period) % period; }
float hash12(ivec2 p, uint s) {
  uint h = hashU(uint(p.x) * 1597334677U ^ hashU(uint(p.y) * 3812015801U ^ s));
  return float(h) * (1.0 / 4294967295.0);
}
vec2 hash22(ivec2 p, uint s) { return vec2(hash12(p, s), hash12(p, s ^ 0x9e3779b9U)); }

vec2 gradDir(ivec2 p, uint s) { float a = hash12(p, s) * 6.2831853; return vec2(cos(a), sin(a)); }

// periodic gradient noise, ~[-0.7, 0.7]; x is in lattice units, period in cells
float pnoise(vec2 x, ivec2 period, uint s) {
  vec2 i = floor(x), f = fract(x);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  ivec2 c = ivec2(i);
  float a = dot(gradDir(wrapCell(c, period), s), f);
  float b = dot(gradDir(wrapCell(c + ivec2(1, 0), period), s), f - vec2(1.0, 0.0));
  float d = dot(gradDir(wrapCell(c + ivec2(0, 1), period), s), f - vec2(0.0, 1.0));
  float e = dot(gradDir(wrapCell(c + ivec2(1, 1), period), s), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(d, e, u.x), u.y);
}

// periodic fbm over uv in [0,1]; ~[-1, 1]
float pfbm(vec2 uv, ivec2 period, int octaves, uint s) {
  float sum = 0.0, amp = 0.5, norm = 0.0;
  ivec2 p = period;
  for (int o = 0; o < 8; o++) {
    if (o >= octaves) break;
    sum += amp * pnoise(uv * vec2(p), p, s + uint(o) * 101U);
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm * 1.4;
}

// periodic voronoi with exact border distance (two-pass)
// returns: x = distance to cell border, y = cell random, zw = vector from pixel to cell point
vec4 pvoronoi(vec2 x, ivec2 period, uint s, float jitter) {
  vec2 n = floor(x), f = fract(x);
  vec2 mg = vec2(0.0), mr = vec2(0.0);
  float md = 8.0;
  ivec2 mc = ivec2(0);
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    ivec2 c = wrapCell(ivec2(n) + ivec2(i, j), period);
    vec2 o = 0.5 + (hash22(c, s) - 0.5) * jitter;
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; mc = c; }
  }
  md = 8.0;
  for (int j = -2; j <= 2; j++)
  for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    ivec2 c = wrapCell(ivec2(n) + ivec2(g), period);
    vec2 o = 0.5 + (hash22(c, s) - 0.5) * jitter;
    vec2 r = g + o - f;
    if (dot(mr - r, mr - r) > 0.00001) md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  return vec4(md, hash12(mc, s ^ 0x51ed27U), mr);
}

vec3 srgbToLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 linearToSrgb(vec3 c) { return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }
`;
