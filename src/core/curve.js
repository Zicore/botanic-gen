// Parameter curves: monotone cubic (Fritsch–Carlson) through control points.
// Points are [x, y] with x in [0, 1] (position along parent or own length) and y in [0, 1].
// A curve multiplies its parameter's scalar value, like SpeedTree's curve-driven properties.

export function evalCurve(points, x) {
  if (!points || points.length === 0) return 1;
  if (points.length === 1) return points[0][1];
  const n = points.length;
  if (x <= points[0][0]) return points[0][1];
  if (x >= points[n - 1][0]) return points[n - 1][1];

  let i = 0;
  while (i < n - 2 && x > points[i + 1][0]) i++;
  const [x0, y0] = points[i];
  const [x1, y1] = points[i + 1];
  const h = x1 - x0;
  if (h <= 1e-9) return y1;
  const t = (x - x0) / h;
  const m0 = tangentAt(points, i) * h;
  const m1 = tangentAt(points, i + 1) * h;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1;
}

function secant(points, i) {
  const dx = points[i + 1][0] - points[i][0];
  return dx <= 1e-9 ? 0 : (points[i + 1][1] - points[i][1]) / dx;
}

function tangentAt(points, i) {
  const n = points.length;
  if (i === 0) return secant(points, 0);
  if (i === n - 1) return secant(points, n - 2);
  const d0 = secant(points, i - 1);
  const d1 = secant(points, i);
  if (d0 * d1 <= 0) return 0;
  // harmonic mean keeps the interpolant monotone between points
  return (2 * d0 * d1) / (d0 + d1);
}

/** Pre-sample a curve into a lookup table for hot loops. */
export function bakeCurve(points, samples = 64) {
  const lut = new Float32Array(samples + 1);
  for (let i = 0; i <= samples; i++) lut[i] = evalCurve(points, i / samples);
  return (x) => {
    const f = Math.min(Math.max(x, 0), 1) * samples;
    const i = Math.min(Math.floor(f), samples - 1);
    const t = f - i;
    return lut[i] * (1 - t) + lut[i + 1] * t;
  };
}

export const CURVES = {
  flat: [[0, 1], [1, 1]],
  linearDown: [[0, 1], [1, 0]],
  linearUp: [[0, 0], [1, 1]],
  taper: [[0, 1], [0.6, 0.55], [1, 0.08]],
  bell: [[0, 0.3], [0.45, 1], [1, 0.25]],
  cone: [[0, 1], [0.7, 0.45], [1, 0.1]],
  easeIn: [[0, 0], [0.5, 0.2], [1, 1]],
};
