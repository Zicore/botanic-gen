// LOD variants are produced by re-running the generator on a transformed document:
// fewer segments, fewer but larger leaf cards (area-compensated), same seed and structure.

const LEVELS = [
  { quality: 1, leafCount: 1, leafSize: 1 },
  { quality: 0.55, leafCount: 0.45, leafSize: 1.42 },
  { quality: 0.3, leafCount: 0.18, leafSize: 2.1, hideTwigs: true },
];

// Thin terminal wood (no branch children, <= 3 sides) is already at the segment floor and
// can't get any cheaper; at the far LOD it's hidden under the foliage anyway, so drop it.
function isTwigLevel(n, nodes) {
  if (n.type !== 'branches' || (n.params.radialSegments ?? 9) > 3) return false;
  return !nodes.some((c) => c.parent === n.id && c.enabled !== false && (c.type === 'branches' || c.type === 'fronds'));
}

export const LOD_COUNT = LEVELS.length;

export function lodDocument(gdoc, level) {
  const L = LEVELS[level];
  if (level === 0) return gdoc;
  return {
    ...gdoc,
    nodes: gdoc.nodes.map((n) => {
      const p = { ...n.params };
      if (n.type === 'tree') p.quality = Math.max(0.2, p.quality * L.quality);
      if (n.type === 'leaves') {
        p.count = Math.max(1, p.count * L.leafCount);
        p.size = p.size * L.leafSize;
        p.lengthSegments = Math.max(1, Math.round(p.lengthSegments * 0.5));
        p.widthSegments = 1;
      }
      if (n.type === 'grass') p.count = Math.max(1, Math.round(p.count * L.leafCount * 1.5));
      if (n.type === 'fronds') p.widthSegments = 1;
      const hideWood = L.hideTwigs && isTwigLevel(n, gdoc.nodes);
      return { ...n, params: p, ...(hideWood ? { hideWood } : {}) };
    }),
  };
}

/** Visibility ranges in meters, scaled by tree size. */
export function lodRanges(height) {
  const h = Math.max(1, height);
  const e0 = Math.max(18, h * 2.2);
  const e1 = Math.max(45, h * 5.5);
  const e2 = Math.max(110, h * 14);
  return [
    { begin: 0, end: e0 },
    { begin: e0, end: e1 },
    { begin: e1, end: e2 },
  ];
}
