// Deterministic random numbers. Every generator derives its own stream from
// (document seed, node id, index path) so editing one node never reshuffles another.

export function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hashInts(...values) {
  let h = 0x9e3779b9;
  for (const v of values) {
    h ^= (v | 0) + 0x9e3779b9 + (h << 6) + (h >>> 2);
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
  }
  /** uniform in [a, b) */
  range(a, b) {
    return a + (b - a) * this.next();
  }
  /** uniform in [-1, 1) */
  signed() {
    return this.next() * 2 - 1;
  }
  /** value * (1 ± variation) */
  vary(value, variation) {
    return value * (1 + variation * this.signed());
  }
  int(n) {
    return Math.floor(this.next() * n);
  }
  /** stochastic rounding: 2.3 -> 2 (70%) or 3 (30%) */
  round(x) {
    const f = Math.floor(x);
    return f + (this.next() < x - f ? 1 : 0);
  }
  fork(...salt) {
    return new Rng(hashInts(this.seed, ...salt));
  }
}
