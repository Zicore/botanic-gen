// Node and material schemas. The inspector UI, defaults, and validation all derive from here.
//
// Param kinds:
//   float | int | angle (degrees) | bool | enum | curve | material | color
// A curve param names the scalar it modulates via `curveFor`; the inspector renders it inline.

import { CURVES } from '../core/curve.js';

const f = (key, label, def, min, max, step = 0.01, extra = {}) => ({ key, label, kind: 'float', default: def, min, max, step, ...extra });
const i = (key, label, def, min, max, extra = {}) => ({ key, label, kind: 'int', default: def, min, max, step: 1, ...extra });
const a = (key, label, def, min = 0, max = 180, extra = {}) => ({ key, label, kind: 'angle', default: def, min, max, step: 0.5, ...extra });
const b = (key, label, def, extra = {}) => ({ key, label, kind: 'bool', default: def, ...extra });
const e = (key, label, def, options, extra = {}) => ({ key, label, kind: 'enum', default: def, options, ...extra });
const c = (key, label, curveFor, def, axis, extra = {}) => ({ key, label, kind: 'curve', curveFor, default: def, axis, ...extra });
const m = (key, label, materialKind, extra = {}) => ({ key, label, kind: 'material', materialKind, default: null, ...extra });
const col = (key, label, def, extra = {}) => ({ key, label, kind: 'color', default: def, ...extra });

const PHYLLOTAXY = [
  { value: 'spiral', label: 'Spiral (137.5°)' },
  { value: 'alternate', label: 'Alternate' },
  { value: 'opposite', label: 'Opposite' },
  { value: 'whorled', label: 'Whorled' },
  { value: 'random', label: 'Random' },
];

const distribution = (countDef, countMax, startDef, endDef) => ({
  name: 'Distribution',
  params: [
    f('count', 'Count per parent', countDef, 0, countMax, 1, { hint: 'Number of children spawned on each parent spine.' }),
    b('countByLength', 'Scale count by parent length', true, { hint: 'Shorter parents get proportionally fewer children.' }),
    f('start', 'Start', startDef, 0, 1, 0.005, { hint: 'Position along the parent where spawning begins (0 = base, 1 = tip).' }),
    f('end', 'End', endDef, 0, 1, 0.005),
    e('phyllotaxy', 'Arrangement', 'spiral', PHYLLOTAXY),
    i('whorlSize', 'Whorl size', 4, 2, 10, { showIf: { phyllotaxy: 'whorled' } }),
    a('rotationJitter', 'Rotation jitter', 25, 0, 180),
    f('positionJitter', 'Position jitter', 0.4, 0, 1),
  ],
});

export const NODE_TYPES = {
  tree: {
    label: 'Tree',
    description: 'Global settings. Root of every graph.',
    color: '#a78bfa',
    accepts: [],
    singleton: true,
    groups: [
      {
        name: 'Global',
        params: [
          i('seed', 'Seed', 1337, 0, 999999),
          f('scale', 'Scale', 1, 0.1, 5, 0.01),
          f('quality', 'Mesh quality', 1, 0.25, 2, 0.05, { hint: 'Multiplies all segment counts. Use < 1 for lower LODs.' }),
        ],
      },
      {
        name: 'Shading',
        params: [
          f('aoStrength', 'Vertex AO', 0.7, 0, 1, 0.01, { hint: 'Baked canopy and crotch occlusion stored in vertex color.' }),
          f('leafTint', 'Leaf tint variation', 0.12, 0, 0.5, 0.01),
          f('barkTint', 'Bark tint variation', 0.06, 0, 0.3, 0.01),
        ],
      },
    ],
  },

  trunk: {
    label: 'Trunk',
    description: 'One or more stems growing from the ground.',
    color: '#d97706',
    accepts: ['tree'],
    groups: [
      {
        name: 'Shape',
        params: [
          i('count', 'Stems', 1, 1, 16),
          f('length', 'Length (m)', 12, 0.2, 60, 0.05),
          f('lengthVar', 'Length variation', 0.08, 0, 1),
          f('radius', 'Base radius (m)', 0.4, 0.005, 3, 0.005),
          c('radiusCurve', 'Radius profile', 'radius', CURVES.taper, 'own'),
          a('tilt', 'Tilt', 2, 0, 75),
          f('spread', 'Base spread (m)', 0, 0, 10, 0.01, { hint: 'Radius of the area multiple stems are scattered in.' }),
          a('splay', 'Stem splay', 0, 0, 75, { hint: 'Outward lean of multiple stems.' }),
        ],
      },
      {
        name: 'Growth',
        params: [
          f('gravity', 'Gravity', 0, -1, 2),
          c('gravityCurve', 'Gravity profile', 'gravity', CURVES.flat, 'own'),
          f('upAttraction', 'Up attraction', 0.1, 0, 2),
          f('gnarl', 'Gnarl', 0.25, 0, 3),
          f('gnarlScale', 'Gnarl frequency', 0.35, 0.02, 4, 0.01),
        ],
      },
      {
        name: 'Root flare',
        params: [
          f('flare', 'Flare', 0.6, 0, 3),
          f('flareHeight', 'Flare height (m)', 1.2, 0.05, 6, 0.05),
          i('flareLobes', 'Buttress lobes', 6, 0, 14),
          f('flareLobeDepth', 'Lobe depth', 0.5, 0, 1),
          f('sink', 'Sink into ground (m)', 0.25, 0, 2, 0.01),
        ],
      },
      {
        name: 'Crown',
        params: [
          f('crownLength', 'Crown length (m)', 0, 0, 6, 0.01, { hint: 'Swollen head at the top of the stem (palm crownshaft / leaf-base mass). 0 = off.' }),
          f('crownBulge', 'Crown bulge', 1.5, 0.6, 3, 0.01),
          f('crownTop', 'Crown overshoot', 0.25, 0, 1, 0.01, { hint: 'How far the crown extends above the stem tip, relative to its length.' }),
          m('crownMaterial', 'Crown material', 'bark', { hint: 'Empty = use the stem bark.' }),
        ],
      },
      {
        name: 'Surface',
        params: [
          f('ripple', 'Ripple', 0.05, 0, 0.4, 0.005),
          f('rippleScale', 'Ripple frequency', 2.5, 0.1, 12, 0.05),
        ],
      },
      {
        name: 'Mesh',
        params: [
          i('lengthSegments', 'Length segments', 28, 3, 96),
          i('radialSegments', 'Radial segments', 16, 3, 48),
        ],
      },
      { name: 'Material', params: [m('material', 'Bark', 'bark')] },
    ],
  },

  branches: {
    label: 'Branches',
    description: 'Woody children spawned along a parent.',
    color: '#b45309',
    accepts: ['trunk', 'branches'],
    groups: [
      distribution(20, 300, 0.3, 0.95),
      {
        name: 'Shape',
        params: [
          f('length', 'Length (× parent)', 0.45, 0.01, 2, 0.005),
          c('lengthCurve', 'Length along parent', 'length', CURVES.bell, 'parent'),
          f('lengthVar', 'Length variation', 0.2, 0, 1),
          f('radiusRatio', 'Radius (× parent)', 0.55, 0.02, 1, 0.005),
          c('radiusCurve', 'Radius profile', 'radiusRatio', CURVES.taper, 'own'),
          a('angle', 'Start angle', 55, 0, 180),
          c('angleCurve', 'Angle along parent', 'angle', CURVES.flat, 'parent'),
          a('angleVar', 'Angle variation', 10, 0, 90),
          f('collar', 'Branch collar', 0.6, 0, 2, 0.01, { hint: 'Swelling where the branch joins its parent.' }),
        ],
      },
      {
        name: 'Growth',
        params: [
          f('gravity', 'Gravity', 0.2, -1, 3),
          c('gravityCurve', 'Gravity profile', 'gravity', CURVES.easeIn, 'own'),
          f('upAttraction', 'Up attraction', 0.25, 0, 3),
          f('flatten', 'Flatten', 0, 0, 1, 0.01, { hint: 'Pull growth toward the horizontal plane (spruce, beech fans).' }),
          f('gnarl', 'Gnarl', 0.35, 0, 3),
          f('gnarlScale', 'Gnarl frequency', 0.8, 0.02, 8, 0.01),
        ],
      },
      {
        name: 'Mesh',
        params: [
          i('lengthSegments', 'Length segments', 12, 2, 64),
          i('radialSegments', 'Radial segments', 9, 3, 32),
        ],
      },
      { name: 'Wind', params: [f('flex', 'Flexibility', 0.5, 0, 1)] },
      { name: 'Material', params: [m('material', 'Bark', 'bark', { hint: 'Empty = inherit from parent.' })] },
    ],
  },

  leaves: {
    label: 'Leaves',
    description: 'Leaf cards or needle sprays attached to a parent.',
    color: '#16a34a',
    accepts: ['trunk', 'branches'],
    groups: [
      distribution(14, 400, 0.25, 1),
      {
        name: 'Shape',
        params: [
          f('size', 'Size (m)', 0.22, 0.01, 6, 0.005),
          c('sizeCurve', 'Size along parent', 'size', CURVES.flat, 'parent'),
          f('sizeVar', 'Size variation', 0.25, 0, 1),
          f('widthScale', 'Width scale', 1, 0.2, 3, 0.01),
          b('tipLeaf', 'Leaf at tip', true),
        ],
      },
      {
        name: 'Orientation',
        params: [
          a('angle', 'Angle to parent', 55, 0, 180),
          a('angleVar', 'Angle variation', 15, 0, 90),
          f('faceUp', 'Face sky', 0.55, 0, 1, 0.01),
          a('roll', 'Roll variation', 30, 0, 180),
          f('droop', 'Droop', 0.15, -1, 1, 0.01),
          f('offset', 'Petiole offset (m)', 0, 0, 0.5, 0.005),
        ],
      },
      {
        name: 'Deformation',
        params: [
          f('fold', 'Fold', 0.18, -1, 1, 0.01),
          f('curl', 'Curl', 0.2, -1.5, 1.5, 0.01),
          f('twist', 'Twist', 0.1, 0, 1, 0.01),
          f('deformVar', 'Variation', 0.5, 0, 1, 0.01),
        ],
      },
      {
        name: 'Mesh',
        params: [
          i('widthSegments', 'Width segments', 2, 1, 6),
          i('lengthSegments', 'Length segments', 3, 1, 10),
        ],
      },
      {
        name: 'Lighting',
        params: [f('normalBlend', 'Canopy normals', 0.55, 0, 1, 0.01, { hint: 'Blend card normals toward the canopy hull for soft, volumetric shading.' })],
      },
      { name: 'Wind', params: [f('flutter', 'Flutter', 0.7, 0, 1)] },
      { name: 'Material', params: [m('material', 'Leaf', 'leaf')] },
    ],
  },

  fronds: {
    label: 'Fronds',
    description: 'Long ribbon leaves with a rachis (palms, ferns).',
    color: '#0d9488',
    accepts: ['trunk', 'branches'],
    groups: [
      distribution(24, 120, 0.97, 1),
      {
        name: 'Shape',
        params: [
          f('length', 'Length (m)', 4, 0.05, 15, 0.01),
          c('lengthCurve', 'Length along parent', 'length', CURVES.flat, 'parent'),
          f('lengthVar', 'Length variation', 0.15, 0, 1),
          f('width', 'Width (m)', 1.4, 0.02, 6, 0.01),
          c('widthCurve', 'Width profile', 'width', [[0, 0], [0.12, 0.05], [0.25, 0.85], [0.6, 1], [1, 0.15]], 'own'),
          a('angle', 'Start angle', 60, 0, 180),
          c('angleCurve', 'Angle along parent', 'angle', CURVES.flat, 'parent'),
          a('angleVar', 'Angle variation', 12, 0, 90),
          a('fold', 'Fold angle', 25, -90, 90),
          a('twist', 'Twist', 15, 0, 180),
        ],
      },
      {
        name: 'Growth',
        params: [
          f('gravity', 'Gravity', 1.1, -1, 4),
          c('gravityCurve', 'Gravity profile', 'gravity', CURVES.easeIn, 'own'),
          f('upAttraction', 'Up attraction', 0.3, 0, 3),
          f('gnarl', 'Gnarl', 0.1, 0, 2),
        ],
      },
      {
        name: 'Rachis',
        params: [
          f('rachisRadius', 'Rachis radius (m)', 0.03, 0, 0.3, 0.001),
          f('sheath', 'Leaf-base sheath', 0, 0, 5, 0.01, { hint: 'Widens the rachis toward its base into a clasping sheath.' }),
          m('rachisMaterial', 'Rachis material', 'bark', { hint: 'Empty = inherit bark from parent.' }),
        ],
      },
      {
        name: 'Mesh',
        params: [
          i('lengthSegments', 'Length segments', 18, 3, 64),
          i('widthSegments', 'Width segments', 2, 1, 8),
        ],
      },
      { name: 'Lighting', params: [f('normalBlend', 'Canopy normals', 0.3, 0, 1, 0.01)] },
      { name: 'Wind', params: [f('flutter', 'Flutter', 0.5, 0, 1)] },
      { name: 'Material', params: [m('material', 'Frond', 'leaf')] },
    ],
  },

  grass: {
    label: 'Grass Clump',
    description: 'Ground-rooted blades.',
    color: '#65a30d',
    accepts: ['tree'],
    groups: [
      {
        name: 'Shape',
        params: [
          i('count', 'Blades', 70, 1, 1000),
          f('height', 'Height (m)', 0.6, 0.02, 4, 0.01),
          f('heightVar', 'Height variation', 0.35, 0, 1),
          f('spread', 'Spread radius (m)', 0.25, 0, 5, 0.01),
          f('width', 'Blade width (m)', 0.018, 0.002, 0.5, 0.001),
          a('lean', 'Lean', 22, 0, 85),
          a('leanVar', 'Lean variation', 14, 0, 60),
          f('curvature', 'Curvature', 0.9, 0, 3, 0.01),
          a('twist', 'Twist', 30, 0, 180),
        ],
      },
      {
        name: 'Mesh',
        params: [i('lengthSegments', 'Length segments', 5, 1, 16)],
      },
      { name: 'Lighting', params: [f('normalUp', 'Normal up-bias', 0.6, 0, 1, 0.01)] },
      { name: 'Wind', params: [f('flutter', 'Flutter', 0.8, 0, 1)] },
      { name: 'Material', params: [m('material', 'Blade', 'leaf')] },
    ],
  },
};

// ---------------------------------------------------------------------------
// Materials

const RES = [
  { value: 512, label: '512' },
  { value: 1024, label: '1K' },
  { value: 2048, label: '2K' },
];

export const MATERIAL_TYPES = {
  bark: {
    label: 'Bark',
    groups: [
      {
        name: 'Pattern',
        params: [
          e('style', 'Style', 'furrowed', [
            { value: 'furrowed', label: 'Furrowed (oak, ash)' },
            { value: 'plated', label: 'Plated (pine)' },
            { value: 'smooth', label: 'Smooth (beech)' },
            { value: 'birch', label: 'Papery (birch)' },
            { value: 'fibrous', label: 'Fibrous (palm, cedar)' },
          ]),
          i('seed', 'Seed', 3, 0, 9999),
          f('scale', 'Pattern scale', 5, 1, 40, 0.1),
          f('stretch', 'Vertical stretch', 3, 1, 8, 0.05),
          f('depth', 'Crack depth', 0.7, 0, 1),
          f('crackWidth', 'Crack width', 0.35, 0, 1),
          f('warp', 'Warp', 0.4, 0, 1),
          f('detail', 'Fine detail', 0.5, 0, 1),
          f('rings', 'Ring bands', 0, 0, 1, 0.01, { hint: 'Horizontal bands (palm leaf scars, birch lenticels).' }),
          f('moss', 'Moss', 0.1, 0, 1),
        ],
      },
      {
        name: 'Color',
        params: [
          col('colorTop', 'Ridge color', '#6b5a48'),
          col('colorCrack', 'Crack color', '#2a1f17'),
          col('colorVar', 'Variation color', '#8a7a68'),
          col('colorMoss', 'Moss color', '#4f6b2a'),
        ],
      },
      {
        name: 'Surface',
        params: [
          f('roughness', 'Roughness', 0.88, 0, 1),
          f('normalStrength', 'Normal strength', 1.6, 0, 5, 0.05),
        ],
      },
      {
        name: 'Mapping',
        params: [
          f('tileSize', 'Tile size (m)', 0.9, 0.1, 6, 0.01, { hint: 'World size of one texture repeat across the circumference.' }),
          f('tileAspect', 'Tile aspect (V/U)', 1.6, 0.25, 6, 0.01),
          e('resolution', 'Resolution', 1024, RES),
        ],
      },
    ],
  },

  leaf: {
    label: 'Leaf',
    groups: [
      {
        name: 'Type',
        params: [
          e('kind', 'Kind', 'broadleaf', [
            { value: 'broadleaf', label: 'Single leaf' },
            { value: 'twig', label: 'Leaf cluster (twig)' },
            { value: 'needles', label: 'Needle spray' },
            { value: 'frond', label: 'Frond (leaflets)' },
            { value: 'blade', label: 'Grass blade' },
          ]),
          i('seed', 'Seed', 11, 0, 9999),
          i('variants', 'Atlas variants', 4, 1, 4, { hint: 'Distinct leaf variations packed into one texture.' }),
          e('resolution', 'Resolution', 1024, RES),
        ],
      },
      {
        name: 'Shape',
        showIf: { kind: ['broadleaf', 'twig'] },
        params: [
          e('shape', 'Outline', 'ovate', [
            { value: 'ovate', label: 'Ovate' },
            { value: 'elliptic', label: 'Elliptic' },
            { value: 'lanceolate', label: 'Lanceolate' },
            { value: 'obovate', label: 'Obovate' },
            { value: 'cordate', label: 'Cordate' },
            { value: 'deltoid', label: 'Deltoid (birch)' },
          ]),
          f('width', 'Width', 0.55, 0.1, 1.2),
          f('tip', 'Tip sharpness', 0.5, 0, 1),
          i('lobes', 'Lobes', 0, 0, 9),
          f('lobeDepth', 'Lobe depth', 0.35, 0, 0.85),
          f('serration', 'Serration', 0.2, 0, 1),
          i('teeth', 'Teeth', 28, 4, 80),
          f('petiole', 'Petiole length', 0.12, 0, 0.4),
          i('veins', 'Vein pairs', 7, 2, 18),
          a('veinAngle', 'Vein angle', 50, 15, 80),
          f('veinStrength', 'Vein strength', 0.6, 0, 1),
        ],
      },
      {
        name: 'Twig',
        showIf: { kind: 'twig' },
        params: [
          i('twigLeaves', 'Leaves on twig', 9, 1, 25),
          f('leafScale', 'Leaf size', 0.34, 0.12, 0.7),
          a('twigSpread', 'Leaf angle', 52, 10, 90),
          f('twigCurve', 'Twig curve', 0.25, -1, 1),
          f('twigWidth', 'Twig width', 0.4, 0, 1),
          i('sideTwigs', 'Side twigs', 2, 0, 4),
        ],
      },
      {
        name: 'Needles',
        showIf: { kind: 'needles' },
        params: [
          f('needleDensity', 'Density', 0.6, 0.1, 1),
          f('needleLength', 'Needle length', 0.32, 0.05, 0.5),
          a('needleAngle', 'Needle angle', 55, 10, 90),
          f('needleCurve', 'Needle curve', 0.25, -1, 1),
          f('needleWidth', 'Needle width', 0.5, 0.1, 1),
          f('twigWidth', 'Twig width', 0.5, 0, 1),
          i('sideShoots', 'Side shoots', 3, 0, 8),
        ],
      },
      {
        name: 'Leaflets',
        showIf: { kind: 'frond' },
        params: [
          i('leaflets', 'Leaflet pairs', 38, 6, 90),
          f('leafletWidth', 'Leaflet width', 0.45, 0.1, 1),
          a('leafletAngle', 'Leaflet angle', 55, 15, 90),
          f('leafletDroop', 'Leaflet droop', 0.3, 0, 1),
          f('gaps', 'Gaps / tears', 0.25, 0, 1),
        ],
      },
      {
        name: 'Blade',
        showIf: { kind: 'blade' },
        params: [
          i('blades', 'Blades in card', 1, 1, 12),
          f('bladeTaper', 'Tip taper', 0.6, 0, 1),
        ],
      },
      {
        name: 'Color',
        params: [
          col('colorBase', 'Base color', '#3f6b25'),
          col('colorTip', 'Tip color', '#5c8a2e'),
          col('colorVein', 'Vein color', '#8fae55'),
          col('colorSubsurface', 'Translucent color', '#a8c43c'),
          f('colorVariation', 'Variation', 0.35, 0, 1),
          f('dryness', 'Dryness / damage', 0.12, 0, 1),
        ],
      },
      {
        name: 'Surface',
        params: [
          f('roughness', 'Roughness', 0.55, 0, 1),
          f('normalStrength', 'Normal strength', 1.2, 0, 5, 0.05),
          f('translucency', 'Translucency', 0.65, 0, 1),
          f('alphaCutoff', 'Alpha cutoff', 0.45, 0.05, 0.95),
        ],
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Helpers

export function allParams(groups) {
  return groups.flatMap((g) => g.params);
}

export function defaultParams(groups) {
  const out = {};
  for (const p of allParams(groups)) {
    out[p.key] = Array.isArray(p.default) ? p.default.map((pt) => [...pt]) : p.default;
  }
  return out;
}

export function nodeDefaults(type) {
  return defaultParams(NODE_TYPES[type].groups);
}

export function materialDefaults(kind) {
  return defaultParams(MATERIAL_TYPES[kind].groups);
}

/** Fill in missing keys (forward compatibility for older saved documents). */
export function withDefaults(params, defaults) {
  const out = { ...defaults };
  for (const k of Object.keys(params || {})) if (k in defaults) out[k] = params[k];
  return out;
}

export function isVisible(cond, params) {
  if (!cond) return true;
  return Object.entries(cond).every(([k, v]) => (Array.isArray(v) ? v.includes(params[k]) : params[k] === v));
}
