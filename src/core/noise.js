// Seeded 3D gradient noise (Perlin "improved") used for branch gnarl and surface ripples.

import { mulberry32 } from './rng.js';

const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

export function createNoise3(seed = 0) {
  const rand = mulberry32(seed ^ 0x5bd1e995);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const dot = (gi, x, y, z) => {
    const g = GRAD3[gi % 12];
    return g[0] * x + g[1] * y + g[2] * z;
  };

  /** returns roughly [-1, 1] */
  return function noise3(x, y, z) {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    x -= X; y -= Y; z -= Z;
    const xi = X & 255, yi = Y & 255, zi = Z & 255;
    const u = fade(x), v = fade(y), w = fade(z);
    const A = perm[xi] + yi, AA = perm[A] + zi, AB = perm[A + 1] + zi;
    const B = perm[xi + 1] + yi, BA = perm[B] + zi, BB = perm[B + 1] + zi;
    return lerp(
      lerp(
        lerp(dot(perm[AA], x, y, z), dot(perm[BA], x - 1, y, z), u),
        lerp(dot(perm[AB], x, y - 1, z), dot(perm[BB], x - 1, y - 1, z), u),
        v,
      ),
      lerp(
        lerp(dot(perm[AA + 1], x, y, z - 1), dot(perm[BA + 1], x - 1, y, z - 1), u),
        lerp(dot(perm[AB + 1], x, y - 1, z - 1), dot(perm[BB + 1], x - 1, y - 1, z - 1), u),
        v,
      ),
      w,
    );
  };
}

/** Vector-valued noise: three decorrelated channels. */
export function createNoiseVec3(seed = 0) {
  const n = createNoise3(seed);
  return (x, y, z, out) => {
    out.x = n(x, y, z);
    out.y = n(x + 31.416, y + 47.853, z + 12.793);
    out.z = n(x + 93.989, y + 67.345, z + 54.321);
    return out;
  };
}
