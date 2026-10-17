// Shared leaf-atlas layout. Used by the texture generator (to draw) and by the mesh
// generator (to build UVs), so both always agree.
//
// Leaf space: x in [-aspect/2, aspect/2], y in [0, 1]; y = 0 is the attachment point.
// UVs follow the glTF convention (v = 0 at the top of the image, textures use flipY = false).

const MARGIN = 0.015;

export function leafAspect(p) {
  switch (p.kind) {
    case 'needles': {
      const reach = p.needleLength * Math.sin((p.needleAngle * Math.PI) / 180);
      const shoots = p.sideShoots > 0 ? 0.16 : 0;
      return Math.min(1, 2 * (reach + shoots) + 0.04);
    }
    case 'frond':
      return 0.5;
    case 'twig': {
      const reach = p.leafScale * Math.sin((p.twigSpread * Math.PI) / 180) * 1.05 + p.leafScale * p.width * 0.35;
      return Math.min(1, Math.max(0.35, 2 * reach + 0.06));
    }
    case 'clump':
      return p.clumpWidth;
    case 'blade':
      return p.blades > 1 ? Math.min(1, 0.12 + p.blades * 0.06) : 0.09;
    default: {
      const lobeBulge = p.lobes > 0 ? 1 + p.lobeDepth * 0.25 : 1;
      const shapeBulge = p.shape === 'cordate' || p.shape === 'deltoid' ? 1.08 : 1;
      return Math.min(1.3, p.width * lobeBulge * shapeBulge + 0.02);
    }
  }
}

export function leafLayout(p) {
  const aspect = leafAspect(p);
  const count = Math.max(1, Math.min(4, Math.round(p.variants || 1)));

  let best = null;
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const cw = 1 / cols, ch = 1 / rows;
    const s = Math.min((cw - MARGIN * 2) / aspect, ch - MARGIN * 2);
    if (!best || s > best.s) best = { cols, rows, cw, ch, s };
  }

  const { cols, cw, ch, s } = best;
  const cells = [];
  for (let k = 0; k < count; k++) {
    const cx = (k % cols) * cw + cw / 2;
    const cy = Math.floor(k / cols) * ch + ch / 2;
    const w = aspect * s, h = s;
    cells.push({ u0: cx - w / 2, u1: cx + w / 2, v0: cy - h / 2, v1: cy + h / 2 });
  }
  return { aspect, cells };
}

/** leaf-space (x, y) -> uv inside a cell */
export function leafUV(cell, aspect, x, y) {
  return [cell.u0 + (x / aspect + 0.5) * (cell.u1 - cell.u0), cell.v1 - y * (cell.v1 - cell.v0)];
}
