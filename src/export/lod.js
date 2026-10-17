// LOD variants are produced by re-running the generator with a `lod` block: the skeleton and the
// leaf layout are grown exactly as for LOD0, then tubes get fewer rings/sides and leaves keep an
// evenly spread subset of the LOD0 cards, enlarged around their middle (area-compensated).
// Nothing moves between levels, so the switch only changes detail, not shape.

const LEVELS = [
  { mesh: 1, keep: 1, grow: 1 },
  { mesh: 0.55, keep: 0.45, grow: 1.4 },
  { mesh: 0.3, keep: 0.3, grow: 1.7, hideTwigs: true },
];

export const LOD_COUNT = LEVELS.length;
/** Level index of the billboard impostor that follows the mesh LODs. */
export const IMPOSTOR_LEVEL = LOD_COUNT;

// Thin terminal wood (no branch children, <= 3 sides) is already at the segment floor and
// can't get any cheaper; at the far LOD it's hidden under the foliage anyway, so drop it.
function isTwigLevel(n, nodes) {
  if (n.type !== 'branches' || (n.params.radialSegments ?? 9) > 3) return false;
  return !nodes.some((c) => c.parent === n.id && c.enabled !== false && (c.type === 'branches' || c.type === 'fronds'));
}

export function lodDocument(gdoc, level) {
  if (level === 0) return gdoc;
  const L = LEVELS[level];
  return {
    ...gdoc,
    lod: { mesh: L.mesh, keep: L.keep, grow: L.grow },
    nodes: gdoc.nodes.map((n) => {
      const p = { ...n.params };
      // grass blades are seeded per index, so a lower count is already a subset
      if (n.type === 'grass') p.count = Math.max(1, Math.round(p.count * L.keep * 1.5));
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
    { begin: e2, end: Infinity }, // impostor
  ];
}
