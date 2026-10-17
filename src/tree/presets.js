// Species presets, expressed as nested generator specs.

import { makeNode, makeMaterial, autoLayout, normalizeDoc } from './document.js';

function build(name, materials, spec) {
  const nodes = [];
  // stable ids: generator seeds derive from node ids, so presets must not use random ids
  const prefix = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  materials.forEach((m, i) => {
    const id = `${prefix}_mat${i}`;
    const walkFix = (s) => {
      for (const k of Object.keys(s.params || {})) if (s.params[k] === m.id) s.params[k] = id;
      (s.children || []).forEach(walkFix);
    };
    walkFix(spec);
    m.id = id;
  });
  const walk = (s, parentId) => {
    const node = makeNode(s.type, parentId, s.params || {}, { id: s.id ?? `${prefix}_${s.type}${nodes.length}`, name: s.name });
    nodes.push(node);
    (s.children || []).forEach((c) => walk(c, node.id));
  };
  walk(spec, null);
  return autoLayout(normalizeDoc({ name, nodes, materials }));
}

// ---------------------------------------------------------------------------

function oak() {
  const bark = makeMaterial('bark', 'Oak Bark', {
    style: 'furrowed', seed: 4, scale: 20, stretch: 6, depth: 0.85, crackWidth: 0.4, warp: 0.6, detail: 0.9, moss: 0.12,
    colorTop: '#5f584a', colorCrack: '#1a140f', colorVar: '#7a7569', colorMoss: '#4d5e2a', tileSize: 0.85, tileAspect: 1.6,
    normalStrength: 2.2,
  });
  const leaf = makeMaterial('leaf', 'Oak Twig', {
    kind: 'twig', shape: 'obovate', width: 0.56, tip: 0.2, lobes: 5, lobeDepth: 0.45, serration: 0, petiole: 0.06,
    veins: 6, veinAngle: 48, veinStrength: 0.5, twigLeaves: 9, leafScale: 0.36, twigSpread: 55, twigCurve: 0.3, sideTwigs: 2,
    colorBase: '#355a1f', colorTip: '#4a7428', colorVein: '#7f9e4c', colorSubsurface: '#9fbd3a', colorVariation: 0.45,
    dryness: 0.12, roughness: 0.55, translucency: 0.6, variants: 4,
  });
  return build('Oak', [bark, leaf], {
    type: 'tree', id: 'tree', params: { seed: 1337 },
    children: [{
      type: 'trunk', name: 'Trunk',
      params: {
        length: 7.5, radius: 0.5, radiusCurve: [[0, 1], [0.3, 0.74], [0.75, 0.42], [1, 0.16]],
        tilt: 4, gnarl: 0.35, gnarlScale: 0.3, flare: 0.75, flareHeight: 1.3, flareLobes: 7, ripple: 0.06, material: bark.id,
      },
      children: [{
        type: 'branches', name: 'Limbs',
        params: {
          count: 8, countByLength: false, start: 0.38, end: 1, length: 0.95, lengthCurve: [[0, 1], [0.6, 0.85], [1, 0.55]], lengthVar: 0.2,
          radiusRatio: 0.66, angle: 62, angleCurve: [[0, 1.15], [1, 0.55]], angleVar: 10, gravity: 0.3, upAttraction: 0.25,
          gnarl: 0.7, gnarlScale: 0.4, collar: 0.7, lengthSegments: 18, radialSegments: 11, flex: 0.35,
        },
        children: [{
          type: 'branches', name: 'Branches',
          params: {
            count: 15, start: 0.12, end: 1, phyllotaxy: 'alternate', rotationJitter: 50, length: 0.5,
            lengthCurve: [[0, 1], [1, 0.45]], radiusRatio: 0.55, angle: 50, angleVar: 14, gravity: 0.35,
            upAttraction: 0.3, gnarl: 0.7, gnarlScale: 1.1, lengthSegments: 9, radialSegments: 7, flex: 0.5,
          },
          children: [{
            type: 'branches', name: 'Twigs',
            params: {
              count: 10, start: 0.1, end: 1, phyllotaxy: 'alternate', rotationJitter: 60, length: 0.34,
              lengthCurve: [[0, 1], [1, 0.55]], radiusRatio: 0.5, angle: 48, angleVar: 15, gravity: 0.15,
              upAttraction: 0.2, gnarl: 0.5, gnarlScale: 2.5, lengthSegments: 4, radialSegments: 4, flex: 0.7, collar: 0.3,
            },
            children: [{
              type: 'leaves', name: 'Leaf clusters',
              params: {
                count: 7, start: 0.15, end: 1, phyllotaxy: 'spiral', size: 0.7, sizeVar: 0.2, angle: 45, faceUp: 0.5,
                roll: 35, droop: 0.05, fold: 0.12, curl: 0.15, material: leaf.id, normalBlend: 0.6,
              },
            }],
          }],
        }],
      }],
    }],
  });
}

function birch() {
  const bark = makeMaterial('bark', 'Birch Bark', {
    style: 'birch', seed: 9, scale: 4, stretch: 1.5, depth: 0.45, crackWidth: 0.3, warp: 0.3, detail: 0.4, rings: 0.75, moss: 0.05,
    colorTop: '#e6e1d6', colorCrack: '#24211f', colorVar: '#bdb6a8', colorMoss: '#6b7a3a', roughness: 0.7, tileSize: 0.7, tileAspect: 1.2,
  });
  const leaf = makeMaterial('leaf', 'Birch Twig', {
    kind: 'twig', shape: 'deltoid', width: 0.7, tip: 0.75, serration: 0.55, teeth: 30, petiole: 0.18, veins: 7,
    veinAngle: 42, twigLeaves: 9, leafScale: 0.3, twigSpread: 48, twigCurve: 0.55, sideTwigs: 1, twigWidth: 0.25,
    colorBase: '#4a7428', colorTip: '#5e8c36', colorVein: '#93b558', colorSubsurface: '#b9d14a',
    colorVariation: 0.35, dryness: 0.08, translucency: 0.7,
  });
  return build('Birch', [bark, leaf], {
    type: 'tree', id: 'tree', params: { seed: 4242 },
    children: [{
      type: 'trunk', name: 'Trunk',
      params: {
        length: 15, radius: 0.2, radiusCurve: [[0, 1], [0.5, 0.6], [1, 0.08]], tilt: 5, gnarl: 0.2, gnarlScale: 0.25,
        flare: 0.35, flareHeight: 0.6, flareLobes: 4, ripple: 0.02, material: bark.id,
      },
      children: [{
        type: 'branches', name: 'Branches',
        params: {
          count: 26, start: 0.3, end: 0.97, length: 0.38, lengthCurve: [[0, 0.7], [0.3, 1], [1, 0.3]], radiusRatio: 0.45,
          angle: 50, angleCurve: [[0, 1.1], [1, 0.7]], gravity: 0.45, upAttraction: 0.3, gnarl: 0.4, gnarlScale: 0.8,
          lengthSegments: 12, radialSegments: 7, flex: 0.55,
        },
        children: [{
          type: 'branches', name: 'Hanging twigs',
          params: {
            count: 14, start: 0.1, end: 1, length: 0.45, lengthCurve: [[0, 1], [1, 0.5]], radiusRatio: 0.4, angle: 40,
            gravity: 1.4, gravityCurve: [[0, 0.3], [1, 1]], upAttraction: 0, gnarl: 0.3, gnarlScale: 2,
            lengthSegments: 6, radialSegments: 4, flex: 0.9, collar: 0.2,
          },
          children: [{
            type: 'leaves', name: 'Leaves',
            params: {
              count: 6, start: 0.15, size: 0.42, sizeVar: 0.2, angle: 28, faceUp: 0.3, roll: 40, droop: 0.25, fold: 0.1,
              curl: 0.1, material: leaf.id, normalBlend: 0.55,
            },
          }],
        }],
      }],
    }],
  });
}

function spruce() {
  const bark = makeMaterial('bark', 'Spruce Bark', {
    style: 'plated', seed: 21, scale: 9, stretch: 1.4, depth: 0.5, crackWidth: 0.22, warp: 0.5, detail: 0.6, moss: 0.12,
    colorTop: '#5c4a3e', colorCrack: '#241914', colorVar: '#6e5a4c', tileSize: 0.6, tileAspect: 1.3,
  });
  const needles = makeMaterial('leaf', 'Spruce Needles', {
    kind: 'needles', needleDensity: 0.9, needleLength: 0.3, needleAngle: 62, needleCurve: 0.25, needleWidth: 0.55, sideShoots: 3,
    colorBase: '#1b3a1f', colorTip: '#2f5534', colorVein: '#4f3d2c', colorSubsurface: '#5f8a3a', colorVariation: 0.25,
    dryness: 0.04, roughness: 0.7, translucency: 0.35, alphaCutoff: 0.4,
  });
  const spray = (count, size) => ({
    count, countByLength: true, start: 0.05, end: 1, phyllotaxy: 'alternate', rotationJitter: 40, size, sizeVar: 0.2,
    angle: 30, angleVar: 12, faceUp: 0.55, roll: 50, droop: 0.2, fold: 0.35, curl: 0.2, material: needles.id, normalBlend: 0.5,
  });
  return build('Spruce', [bark, needles], {
    type: 'tree', id: 'tree', params: { seed: 777 },
    children: [{
      type: 'trunk', name: 'Trunk',
      params: {
        length: 19, radius: 0.3, radiusCurve: [[0, 1], [0.15, 0.8], [1, 0.04]], tilt: 1, gnarl: 0.08, gnarlScale: 0.2,
        flare: 0.5, flareHeight: 0.9, flareLobes: 5, ripple: 0.03, lengthSegments: 40, material: bark.id,
      },
      children: [{
        type: 'branches', name: 'Whorls',
        params: {
          count: 130, countByLength: false, start: 0.07, end: 0.985, phyllotaxy: 'whorled', whorlSize: 5, rotationJitter: 16,
          positionJitter: 0.3, length: 0.2, lengthCurve: [[0, 1], [0.55, 0.6], [1, 0.06]], lengthVar: 0.15,
          radiusRatio: 0.2, radiusCurve: [[0, 1], [1, 0.12]], angle: 84, angleCurve: [[0, 1.12], [0.7, 0.92], [1, 0.62]],
          gravity: 0.45, gravityCurve: [[0, 0.1], [0.6, 0.6], [1, 1]], upAttraction: 0.3, flatten: 0.1, gnarl: 0.18, gnarlScale: 0.8,
          lengthSegments: 9, radialSegments: 6, collar: 0.4, flex: 0.45,
        },
        children: [{
          type: 'branches', name: 'Hanging shoots',
          params: {
            count: 16, start: 0.08, end: 0.95, phyllotaxy: 'alternate', rotationJitter: 35, length: 0.32,
            lengthCurve: [[0, 0.8], [0.4, 1], [1, 0.35]], radiusRatio: 0.4, angle: 58, angleVar: 12, gravity: 0.9,
            gravityCurve: [[0, 0.3], [1, 1]], upAttraction: 0, flatten: 0.2, gnarl: 0.12, lengthSegments: 4, radialSegments: 3,
            collar: 0.2, flex: 0.75,
          },
          children: [{ type: 'leaves', name: 'Needle sprays (shoots)', params: spray(5, 0.5) }],
        }, {
          type: 'leaves', name: 'Needle sprays',
          params: { ...spray(11, 0.6), angle: 22, faceUp: 0.65 },
        }],
      }],
    }],
  });
}

function palm() {
  const bark = makeMaterial('bark', 'Palm Trunk', {
    style: 'fibrous', seed: 5, scale: 4, stretch: 1, depth: 0.6, crackWidth: 0.4, warp: 0.2, detail: 0.5, rings: 0.85, moss: 0,
    colorTop: '#7d705c', colorCrack: '#352b20', colorVar: '#94846b', tileSize: 1.0, tileAspect: 0.9, roughness: 0.9,
  });
  const crown = makeMaterial('bark', 'Palm Crownshaft', {
    style: 'fibrous', seed: 8, scale: 6, stretch: 1, depth: 0.35, crackWidth: 0.3, warp: 0.3, detail: 0.7, rings: 0.35, moss: 0,
    colorTop: '#6b6a3c', colorCrack: '#3a3420', colorVar: '#857a4e', tileSize: 0.6, tileAspect: 1.2, roughness: 0.8,
  });
  const frond = makeMaterial('leaf', 'Palm Frond', {
    kind: 'frond', leaflets: 44, leafletWidth: 0.4, leafletAngle: 58, leafletDroop: 0.35, gaps: 0.2, variants: 2,
    colorBase: '#3e6a2a', colorTip: '#5c8a35', colorVein: '#9bb35a', colorSubsurface: '#a9c84a', colorVariation: 0.3,
    dryness: 0.18, roughness: 0.45, translucency: 0.55,
  });
  const dead = makeMaterial('leaf', 'Dead Frond', {
    kind: 'frond', seed: 23, leaflets: 40, leafletWidth: 0.32, leafletAngle: 35, leafletDroop: 0.8, gaps: 0.55, variants: 2,
    colorBase: '#6e5a37', colorTip: '#8a7448', colorVein: '#a08a5c', colorSubsurface: '#b09050', colorVariation: 0.35,
    dryness: 0.5, roughness: 0.85, translucency: 0.3,
  });
  const fronds = {
    countByLength: false, phyllotaxy: 'spiral', lengthVar: 0.18, width: 1.5, fold: 28, twist: 20,
    upAttraction: 0.1, rachisRadius: 0.04, sheath: 2.4, rachisMaterial: crown.id,
  };
  return build('Palm', [bark, crown, frond, dead], {
    type: 'tree', id: 'tree', params: { seed: 31337 },
    children: [{
      type: 'trunk', name: 'Trunk',
      params: {
        length: 11, radius: 0.24, radiusCurve: [[0, 1], [0.1, 0.85], [1, 0.72]], tilt: 14, gravity: -0.08,
        gnarl: 0.15, gnarlScale: 0.15, upAttraction: 0.25, flare: 0.55, flareHeight: 0.6, flareLobes: 0, ripple: 0.02,
        lengthSegments: 32, radialSegments: 14, material: bark.id,
        crownLength: 1.4, crownBulge: 1.45, crownTop: 0.3, crownMaterial: crown.id,
      },
      children: [{
        type: 'fronds', name: 'Fronds',
        params: {
          ...fronds, count: 22, start: 0.975, end: 1, length: 4.2, lengthCurve: [[0, 0.75], [1, 1]], angle: 58, angleVar: 28,
          gravity: 2.1, gravityCurve: [[0, 0.15], [0.5, 0.6], [1, 1]], material: frond.id,
        },
      }, {
        type: 'fronds', name: 'Dead fronds',
        params: {
          ...fronds, count: 7, start: 0.93, end: 0.965, length: 3.4, width: 1.1, angle: 100, angleVar: 15,
          gravity: 4, gravityCurve: [[0, 0.5], [1, 1]], upAttraction: 0, fold: 45, flutter: 0.2, material: dead.id,
        },
      }],
    }],
  });
}

function shrub() {
  const bark = makeMaterial('bark', 'Shrub Bark', {
    style: 'smooth', seed: 13, scale: 6, stretch: 2.5, depth: 0.35, crackWidth: 0.25, detail: 0.5, rings: 0.3,
    colorTop: '#5e5246', colorCrack: '#2d241d', colorVar: '#6f6355', tileSize: 0.4,
  });
  const leaf = makeMaterial('leaf', 'Shrub Twig', {
    kind: 'twig', shape: 'elliptic', width: 0.5, tip: 0.55, serration: 0.15, petiole: 0.08, veins: 6, twigLeaves: 11,
    leafScale: 0.3, twigSpread: 50, twigCurve: 0.2, sideTwigs: 2, colorBase: '#355f26', colorTip: '#4a7a30',
    colorVein: '#7ea150', colorSubsurface: '#8fbf3a', translucency: 0.6, colorVariation: 0.35,
  });
  return build('Shrub', [bark, leaf], {
    type: 'tree', id: 'tree', params: { seed: 99 },
    children: [{
      type: 'trunk', name: 'Stems',
      params: {
        count: 7, length: 1.9, lengthVar: 0.25, radius: 0.035, radiusCurve: [[0, 1], [1, 0.15]], spread: 0.25, splay: 32,
        tilt: 8, gravity: 0.25, gnarl: 0.5, gnarlScale: 1.5, flare: 0.2, flareHeight: 0.15, flareLobes: 0, sink: 0.05,
        lengthSegments: 12, radialSegments: 6, material: bark.id,
      },
      children: [{
        type: 'branches', name: 'Branches',
        params: {
          count: 9, start: 0.15, end: 1, length: 0.5, lengthCurve: [[0, 1], [1, 0.45]], radiusRatio: 0.6, angle: 45,
          gravity: 0.35, upAttraction: 0.3, gnarl: 0.6, gnarlScale: 3, lengthSegments: 6, radialSegments: 4, flex: 0.7,
        },
        children: [{
          type: 'leaves', name: 'Leaves',
          params: { count: 7, start: 0.1, size: 0.32, sizeVar: 0.25, angle: 50, faceUp: 0.45, roll: 40, material: leaf.id, normalBlend: 0.65 },
        }],
      }, {
        type: 'leaves', name: 'Stem leaves',
        params: { count: 6, start: 0.35, size: 0.3, sizeVar: 0.25, angle: 60, faceUp: 0.45, roll: 40, material: leaf.id, normalBlend: 0.65 },
      }],
    }],
  });
}

function grass() {
  const blade = makeMaterial('leaf', 'Grass Blade', {
    kind: 'blade', blades: 1, bladeTaper: 0.65, variants: 4, colorBase: '#3f5f22', colorTip: '#8a9a4a', colorVein: '#6f8a3a',
    colorSubsurface: '#a3b84a', colorVariation: 0.35, dryness: 0.2, roughness: 0.6, translucency: 0.6, alphaCutoff: 0.4,
  });
  return build('Grass', [blade], {
    type: 'tree', id: 'tree', params: { seed: 5 },
    children: [{
      type: 'grass', name: 'Clump',
      params: { count: 90, height: 0.55, heightVar: 0.4, spread: 0.22, width: 0.02, lean: 25, curvature: 1.0, material: blade.id },
    }],
  });
}

// ---------------------------------------------------------------------------
// City builder templates: low-poly trees meant to be instanced by the thousand.
// Budget ~1-3k triangles at LOD0. The tricks: only two or three wood levels with
// 3-8 radial segments, and no twig level at all — big single-quad "foliage clump" cards
// (a whole leafy sub-branch per card) sit directly on the branches, with strong canopy
// normals so the crown still shades like a volume. 512px bark keeps many species cheap.
// Wood marked 3-sided and terminal is dropped at the far LOD (see export/lod.js).

const lowCard = (material, params) => ({
  start: 0.2, end: 1, phyllotaxy: 'spiral', rotationJitter: 40, sizeVar: 0.25, angle: 45, angleVar: 15, faceUp: 0.55,
  roll: 40, droop: 0.05, fold: 0.15, curl: 0.12, widthSegments: 1, lengthSegments: 1, normalBlend: 0.8, material, ...params,
});

const lowBark = (name, params) => makeMaterial('bark', name, { resolution: 512, ...params });
const lowClump = (name, params) => makeMaterial('leaf', name, {
  kind: 'clump', clumpLeaves: 120, clumpLeafSize: 0.11, clumpWidth: 0.9, twigWidth: 0.3,
  colorVariation: 0.4, dryness: 0.06, translucency: 0.55, ...params,
});

function cityLinden() {
  const bark = lowBark('Linden Bark', {
    style: 'furrowed', seed: 31, scale: 14, stretch: 5, depth: 0.55, crackWidth: 0.3, warp: 0.5, detail: 0.6, moss: 0.08,
    colorTop: '#6a6156', colorCrack: '#2a231d', colorVar: '#7d7366', tileSize: 0.7, tileAspect: 1.8,
  });
  const leaf = lowClump('Linden Foliage', {
    shape: 'cordate', width: 0.8, tip: 0.55, serration: 0.35, teeth: 34, petiole: 0.15, veins: 6, veinAngle: 45,
    colorBase: '#3d6624', colorTip: '#557f2e', colorVein: '#86a656', colorSubsurface: '#a6c443',
  });
  return build('City Linden', [bark, leaf], {
    type: 'tree', id: 'tree', params: { seed: 2101 },
    children: [{
      type: 'trunk', name: 'Trunk',
      params: {
        length: 9, radius: 0.22, radiusCurve: [[0, 1], [0.3, 0.8], [1, 0.25]], tilt: 2, gnarl: 0.15, gnarlScale: 0.3,
        flare: 0.4, flareHeight: 0.6, flareLobes: 0, ripple: 0.03, sink: 0.15, lengthSegments: 8, radialSegments: 7, material: bark.id,
      },
      children: [{
        type: 'branches', name: 'Limbs',
        params: {
          count: 8, countByLength: false, start: 0.33, end: 0.95, length: 0.48, lengthCurve: [[0, 0.85], [0.35, 1], [1, 0.35]],
          lengthVar: 0.15, radiusRatio: 0.55, angle: 52, angleCurve: [[0, 1.15], [1, 0.55]], angleVar: 8, gravity: 0.15,
          upAttraction: 0.35, gnarl: 0.35, gnarlScale: 0.5, collar: 0.4, lengthSegments: 5, radialSegments: 5, flex: 0.4,
        },
        children: [{
          type: 'branches', name: 'Branches',
          params: {
            count: 6, start: 0.25, end: 0.95, phyllotaxy: 'alternate', rotationJitter: 50, length: 0.5, lengthCurve: [[0, 1], [1, 0.6]],
            radiusRatio: 0.5, angle: 45, angleVar: 15, gravity: 0.25, upAttraction: 0.2, gnarl: 0.4, gnarlScale: 1.2, collar: 0.2,
            lengthSegments: 3, radialSegments: 3, flex: 0.65,
          },
          children: [{ type: 'leaves', name: 'Foliage cards', params: lowCard(leaf.id, { count: 6, size: 1.7 }) }],
        }, {
          type: 'leaves', name: 'Inner cards', params: lowCard(leaf.id, { count: 4, start: 0.4, size: 1.5, tipLeaf: false }),
        }],
      }, {
        type: 'leaves', name: 'Crown top', params: lowCard(leaf.id, { count: 4, start: 0.85, size: 1.6, faceUp: 0.7 }),
      }],
    }],
  });
}

function cityPlane() {
  const bark = lowBark('Plane Bark', {
    // birch style for its flaking patches: plane camouflage is the same pattern in olive and cream
    style: 'birch', seed: 44, scale: 3, stretch: 1.2, depth: 1, crackWidth: 0.15, warp: 0.7, detail: 0.3, rings: 0, moss: 0,
    colorTop: '#7a7354', colorCrack: '#48422c', colorVar: '#8c8565', roughness: 1, tileSize: 1.2, tileAspect: 1.1, normalStrength: 0.8,
  });
  const leaf = lowClump('Plane Foliage', {
    shape: 'cordate', width: 1.0, tip: 0.6, lobes: 5, lobeDepth: 0.4, serration: 0.1, petiole: 0.2, veins: 5, veinAngle: 55,
    clumpLeaves: 90, clumpLeafSize: 0.14, colorBase: '#3a5f22', colorTip: '#4f772b', colorVein: '#8aa457', colorSubsurface: '#9fbd3f',
  });
  return build('City Plane', [bark, leaf], {
    type: 'tree', id: 'tree', params: { seed: 2202 },
    children: [{
      type: 'trunk', name: 'Trunk',
      params: {
        length: 8, radius: 0.36, radiusCurve: [[0, 1], [0.35, 0.78], [1, 0.3]], tilt: 4, gnarl: 0.2, gnarlScale: 0.25,
        flare: 0.45, flareHeight: 0.8, flareLobes: 0, ripple: 0.04, sink: 0.15, lengthSegments: 8, radialSegments: 8, material: bark.id,
      },
      children: [{
        type: 'branches', name: 'Limbs',
        params: {
          count: 6, countByLength: false, start: 0.4, end: 0.92, length: 0.85, lengthCurve: [[0, 1], [1, 0.6]], lengthVar: 0.15,
          radiusRatio: 0.62, angle: 55, angleCurve: [[0, 1.1], [1, 0.7]], angleVar: 10, gravity: 0.2, upAttraction: 0.35,
          gnarl: 0.5, gnarlScale: 0.35, collar: 0.5, lengthSegments: 6, radialSegments: 6, flex: 0.35,
        },
        children: [{
          type: 'branches', name: 'Branches',
          params: {
            count: 7, start: 0.2, end: 0.95, phyllotaxy: 'alternate', rotationJitter: 50, length: 0.42, lengthCurve: [[0, 1], [1, 0.55]],
            radiusRatio: 0.5, angle: 50, angleVar: 15, gravity: 0.3, upAttraction: 0.2, gnarl: 0.5, gnarlScale: 1, collar: 0.2,
            lengthSegments: 3, radialSegments: 3, flex: 0.6,
          },
          children: [{ type: 'leaves', name: 'Foliage cards', params: lowCard(leaf.id, { count: 6, size: 2.0 }) }],
        }, {
          type: 'leaves', name: 'Inner cards', params: lowCard(leaf.id, { count: 4, start: 0.45, size: 1.8, tipLeaf: false }),
        }],
      }],
    }],
  });
}

function cityPoplar() {
  const bark = lowBark('Poplar Bark', {
    style: 'furrowed', seed: 52, scale: 10, stretch: 6, depth: 0.6, crackWidth: 0.35, warp: 0.4, detail: 0.5, moss: 0.05,
    colorTop: '#6e695c', colorCrack: '#2b2721', colorVar: '#837d6d', tileSize: 0.6, tileAspect: 2,
  });
  const leaf = lowClump('Poplar Foliage', {
    shape: 'deltoid', width: 0.85, tip: 0.6, serration: 0.4, teeth: 26, petiole: 0.22, veins: 6, veinAngle: 45,
    clumpWidth: 0.75, colorBase: '#3f6a25', colorTip: '#5a8a33', colorVein: '#8eaf55', colorSubsurface: '#b2cf45',
  });
  return build('City Poplar', [bark, leaf], {
    type: 'tree', id: 'tree', params: { seed: 2303 },
    children: [{
      type: 'trunk', name: 'Trunk',
      params: {
        length: 16, radius: 0.24, radiusCurve: [[0, 1], [0.3, 0.75], [1, 0.08]], tilt: 1, gnarl: 0.1, gnarlScale: 0.2,
        flare: 0.4, flareHeight: 0.6, flareLobes: 0, ripple: 0.03, sink: 0.15, lengthSegments: 10, radialSegments: 7, material: bark.id,
      },
      children: [{
        type: 'branches', name: 'Upright branches',
        params: {
          count: 20, countByLength: false, start: 0.12, end: 0.95, length: 0.2, lengthCurve: [[0, 0.7], [0.35, 1], [1, 0.4]],
          lengthVar: 0.2, radiusRatio: 0.4, angle: 28, angleVar: 8, gravity: 0, upAttraction: 1.1, gnarl: 0.25, gnarlScale: 0.8,
          collar: 0.3, lengthSegments: 3, radialSegments: 3, flex: 0.55,
        },
        children: [{ type: 'leaves', name: 'Foliage cards', params: lowCard(leaf.id, { count: 6, size: 1.5, angle: 30, faceUp: 0.35 }) }],
      }, {
        type: 'leaves', name: 'Trunk cards', params: lowCard(leaf.id, { count: 14, start: 0.15, size: 1.5, angle: 35, faceUp: 0.3 }),
      }],
    }],
  });
}

function cityOak() {
  const bark = lowBark('Oak Bark', {
    style: 'furrowed', seed: 4, scale: 16, stretch: 6, depth: 0.85, crackWidth: 0.4, warp: 0.6, detail: 0.7, moss: 0.12,
    colorTop: '#5f584a', colorCrack: '#1a140f', colorVar: '#7a7569', colorMoss: '#4d5e2a', tileSize: 0.85, tileAspect: 1.6, normalStrength: 2,
  });
  const leaf = lowClump('Oak Foliage', {
    shape: 'obovate', width: 0.56, tip: 0.2, lobes: 5, lobeDepth: 0.45, serration: 0, petiole: 0.06, veins: 6, veinAngle: 48,
    clumpLeafSize: 0.12, colorBase: '#355a1f', colorTip: '#4a7428', colorVein: '#7f9e4c', colorSubsurface: '#9fbd3a', dryness: 0.12,
  });
  return build('City Oak', [bark, leaf], {
    type: 'tree', id: 'tree', params: { seed: 2404 },
    children: [{
      type: 'trunk', name: 'Trunk',
      params: {
        length: 6, radius: 0.42, radiusCurve: [[0, 1], [0.3, 0.72], [1, 0.3]], tilt: 4, gnarl: 0.3, gnarlScale: 0.3,
        flare: 0.6, flareHeight: 1, flareLobes: 5, ripple: 0.05, sink: 0.2, lengthSegments: 7, radialSegments: 8, material: bark.id,
      },
      children: [{
        type: 'branches', name: 'Limbs',
        params: {
          count: 6, countByLength: false, start: 0.45, end: 1, length: 1.15, lengthCurve: [[0, 1], [1, 0.65]], lengthVar: 0.2,
          radiusRatio: 0.66, angle: 62, angleCurve: [[0, 1.15], [1, 0.55]], angleVar: 10, gravity: 0.3, upAttraction: 0.3,
          gnarl: 0.7, gnarlScale: 0.4, collar: 0.6, lengthSegments: 7, radialSegments: 6, flex: 0.35,
        },
        children: [{
          type: 'branches', name: 'Branches',
          params: {
            count: 7, start: 0.15, end: 1, phyllotaxy: 'alternate', rotationJitter: 50, length: 0.42, lengthCurve: [[0, 1], [1, 0.45]],
            radiusRatio: 0.5, angle: 50, angleVar: 14, gravity: 0.3, upAttraction: 0.3, gnarl: 0.7, gnarlScale: 1.1, collar: 0.25,
            lengthSegments: 3, radialSegments: 3, flex: 0.6,
          },
          children: [{ type: 'leaves', name: 'Foliage cards', params: lowCard(leaf.id, { count: 6, size: 2.0 }) }],
        }, {
          type: 'leaves', name: 'Inner cards', params: lowCard(leaf.id, { count: 4, start: 0.4, size: 1.8, tipLeaf: false }),
        }],
      }],
    }],
  });
}

function cityConifer() {
  const bark = lowBark('Fir Bark', {
    style: 'plated', seed: 21, scale: 9, stretch: 1.4, depth: 0.5, crackWidth: 0.22, warp: 0.5, detail: 0.6, moss: 0.1,
    colorTop: '#5c4a3e', colorCrack: '#241914', colorVar: '#6e5a4c', tileSize: 0.6, tileAspect: 1.3,
  });
  const needles = makeMaterial('leaf', 'Fir Needles', {
    kind: 'needles', needleDensity: 1, needleLength: 0.34, needleAngle: 68, needleCurve: 0.2, needleWidth: 0.75, sideShoots: 6,
    colorBase: '#1c3b20', colorTip: '#31583a', colorVein: '#4f3d2c', colorSubsurface: '#5f8a3a', colorVariation: 0.25,
    dryness: 0.04, roughness: 0.7, translucency: 0.35, alphaCutoff: 0.4, resolution: 512,
  });
  return build('City Conifer', [bark, needles], {
    type: 'tree', id: 'tree', params: { seed: 2505 },
    children: [{
      type: 'trunk', name: 'Trunk',
      params: {
        length: 13, radius: 0.24, radiusCurve: [[0, 1], [0.15, 0.8], [1, 0.05]], tilt: 1, gnarl: 0.06, gnarlScale: 0.2,
        flare: 0.45, flareHeight: 0.7, flareLobes: 0, ripple: 0.03, sink: 0.15, lengthSegments: 10, radialSegments: 6, material: bark.id,
      },
      children: [{
        type: 'branches', name: 'Whorls',
        params: {
          count: 60, countByLength: false, start: 0.12, end: 0.96, phyllotaxy: 'whorled', whorlSize: 5, rotationJitter: 18,
          positionJitter: 0.3, length: 0.24, lengthCurve: [[0, 1], [0.5, 0.55], [1, 0.08]], lengthVar: 0.15,
          radiusRatio: 0.22, radiusCurve: [[0, 1], [1, 0.15]], angle: 82, angleCurve: [[0, 1.12], [0.7, 0.92], [1, 0.62]],
          gravity: 0.4, gravityCurve: [[0, 0.1], [0.6, 0.6], [1, 1]], upAttraction: 0.25, flatten: 0.1, gnarl: 0.15, gnarlScale: 0.8,
          collar: 0.3, lengthSegments: 2, radialSegments: 3, flex: 0.45,
        },
        children: [{
          type: 'leaves', name: 'Needle cards',
          params: lowCard(needles.id, {
            count: 5, countByLength: true, start: 0.05, phyllotaxy: 'alternate', size: 1.7, sizeCurve: [[0, 1], [1, 0.7]], angle: 30, faceUp: 0.6, roll: 45,
            droop: 0.15, fold: 0.3, normalBlend: 0.6,
          }),
        }],
      }, {
        type: 'leaves', name: 'Leader cards',
        params: lowCard(needles.id, { count: 6, start: 0.86, size: 1.4, angle: 20, faceUp: 0.2, normalBlend: 0.6 }),
      }],
    }],
  });
}

function cityPine() {
  const bark = lowBark('Pine Bark', {
    style: 'plated', seed: 27, scale: 7, stretch: 1.6, depth: 0.55, crackWidth: 0.25, warp: 0.5, detail: 0.6, moss: 0.05,
    colorTop: '#7a5136', colorCrack: '#2e1c12', colorVar: '#94603c', tileSize: 0.6, tileAspect: 1.4,
  });
  const needles = makeMaterial('leaf', 'Pine Needles', {
    kind: 'needles', seed: 31, needleDensity: 0.7, needleLength: 0.34, needleAngle: 58, needleCurve: 0.15, needleWidth: 0.5,
    sideShoots: 4, colorBase: '#2a4a26', colorTip: '#4a6e3a', colorVein: '#5a4030', colorSubsurface: '#7a9a45',
    colorVariation: 0.3, dryness: 0.06, roughness: 0.7, translucency: 0.35, alphaCutoff: 0.4,
  });
  return build('City Pine', [bark, needles], {
    type: 'tree', id: 'tree', params: { seed: 2555 },
    children: [{
      type: 'trunk', name: 'Trunk',
      params: {
        length: 14, radius: 0.22, radiusCurve: [[0, 1], [0.2, 0.8], [1, 0.12]], tilt: 5, gnarl: 0.18, gnarlScale: 0.2,
        flare: 0.4, flareHeight: 0.6, flareLobes: 0, ripple: 0.03, sink: 0.15, lengthSegments: 10, radialSegments: 6, material: bark.id,
      },
      children: [{
        type: 'branches', name: 'Crown limbs',
        params: {
          count: 24, countByLength: false, start: 0.55, end: 0.97, phyllotaxy: 'whorled', whorlSize: 3, rotationJitter: 40,
          positionJitter: 0.5, length: 0.33, lengthCurve: [[0, 0.8], [0.4, 1], [1, 0.35]], lengthVar: 0.25, radiusRatio: 0.35,
          angle: 68, angleCurve: [[0, 1.15], [1, 0.6]], angleVar: 12, gravity: 0.15, upAttraction: 0.45, gnarl: 0.45,
          gnarlScale: 0.6, collar: 0.3, lengthSegments: 3, radialSegments: 3, flex: 0.45,
        },
        children: [{
          type: 'leaves', name: 'Needle cards',
          params: lowCard(needles.id, {
            count: 7, start: 0.15, phyllotaxy: 'alternate', size: 1.8, angle: 40, faceUp: 0.75, roll: 40, droop: 0.05,
            fold: 0.25, normalBlend: 0.65,
          }),
        }],
      }, {
        type: 'leaves', name: 'Leader cards',
        params: lowCard(needles.id, { count: 5, start: 0.86, size: 1.3, angle: 25, faceUp: 0.5, normalBlend: 0.65 }),
      }],
    }],
  });
}

function cityBirch() {
  const bark = lowBark('Birch Bark', {
    style: 'birch', seed: 9, scale: 4, stretch: 1.5, depth: 0.45, crackWidth: 0.3, warp: 0.3, detail: 0.4, rings: 0.75, moss: 0.05,
    colorTop: '#e6e1d6', colorCrack: '#24211f', colorVar: '#bdb6a8', colorMoss: '#6b7a3a', roughness: 0.7, tileSize: 0.7, tileAspect: 1.2,
  });
  const leaf = lowClump('Birch Foliage', {
    shape: 'deltoid', width: 0.7, tip: 0.75, serration: 0.55, teeth: 30, petiole: 0.18, veins: 7, veinAngle: 42,
    clumpLeaves: 140, clumpLeafSize: 0.09, clumpWidth: 0.8, twigWidth: 0.2,
    colorBase: '#4a7428', colorTip: '#5e8c36', colorVein: '#93b558', colorSubsurface: '#b9d14a', colorVariation: 0.35, translucency: 0.7,
  });
  return build('City Birch', [bark, leaf], {
    type: 'tree', id: 'tree', params: { seed: 2606 },
    children: [{
      type: 'trunk', name: 'Trunk',
      params: {
        length: 12, radius: 0.16, radiusCurve: [[0, 1], [0.5, 0.6], [1, 0.08]], tilt: 5, gnarl: 0.2, gnarlScale: 0.25,
        flare: 0.3, flareHeight: 0.5, flareLobes: 0, ripple: 0.02, sink: 0.12, lengthSegments: 9, radialSegments: 6, material: bark.id,
      },
      children: [{
        type: 'branches', name: 'Branches',
        params: {
          count: 18, countByLength: false, start: 0.3, end: 0.96, length: 0.36, lengthCurve: [[0, 0.7], [0.3, 1], [1, 0.3]],
          radiusRatio: 0.45, angle: 50, angleCurve: [[0, 1.1], [1, 0.7]], gravity: 0.7, gravityCurve: [[0, 0.2], [1, 1]],
          upAttraction: 0.25, gnarl: 0.35, gnarlScale: 0.8, collar: 0.3, lengthSegments: 4, radialSegments: 3, flex: 0.7,
        },
        children: [{
          type: 'leaves', name: 'Hanging cards',
          params: lowCard(leaf.id, { count: 9, start: 0.15, size: 1.3, angle: 35, faceUp: 0.3, droop: 0.45, curl: 0.2 }),
        }],
      }, {
        type: 'leaves', name: 'Crown top', params: lowCard(leaf.id, { count: 4, start: 0.88, size: 1.2, faceUp: 0.4, droop: 0.2 }),
      }],
    }],
  });
}

function cityCherry() {
  const bark = lowBark('Cherry Bark', {
    style: 'smooth', seed: 61, scale: 5, stretch: 1.2, depth: 0.3, crackWidth: 0.2, detail: 0.4, rings: 0.6, moss: 0.05,
    colorTop: '#5a3f38', colorCrack: '#2a1c19', colorVar: '#6e4f45', roughness: 0.6, tileSize: 0.5, tileAspect: 1,
  });
  const blossom = lowClump('Cherry Blossom', {
    seed: 17, shape: 'elliptic', width: 0.85, tip: 0.15, serration: 0, petiole: 0.1, veins: 3, veinStrength: 0.15,
    clumpLeaves: 160, clumpLeafSize: 0.08, twigWidth: 0.2,
    colorBase: '#f0889e', colorTip: '#f8bcc8', colorVein: '#b8607f', colorSubsurface: '#ffc9dc', colorVariation: 0.3,
    dryness: 0, roughness: 0.65, translucency: 0.7,
  });
  return build('City Cherry', [bark, blossom], {
    type: 'tree', id: 'tree', params: { seed: 2707, leafTint: 0.08 },
    children: [{
      type: 'trunk', name: 'Trunk',
      params: {
        length: 3.2, radius: 0.18, radiusCurve: [[0, 1], [0.5, 0.8], [1, 0.45]], tilt: 6, gnarl: 0.35, gnarlScale: 0.5,
        flare: 0.35, flareHeight: 0.4, flareLobes: 0, ripple: 0.03, sink: 0.1, lengthSegments: 5, radialSegments: 7, material: bark.id,
      },
      children: [{
        type: 'branches', name: 'Scaffold limbs',
        params: {
          count: 5, countByLength: false, start: 0.75, end: 1, length: 1.15, lengthCurve: [[0, 1], [1, 0.85]], lengthVar: 0.15,
          radiusRatio: 0.7, angle: 42, angleVar: 10, gravity: 0.15, upAttraction: 0.25, gnarl: 0.55, gnarlScale: 0.6,
          collar: 0.4, lengthSegments: 5, radialSegments: 5, flex: 0.4,
        },
        children: [{
          type: 'branches', name: 'Branches',
          params: {
            count: 6, start: 0.25, end: 1, phyllotaxy: 'alternate', rotationJitter: 50, length: 0.55, lengthCurve: [[0, 1], [1, 0.5]],
            radiusRatio: 0.5, angle: 55, angleVar: 15, gravity: 0.35, upAttraction: 0.15, gnarl: 0.6, gnarlScale: 1.4, collar: 0.2,
            lengthSegments: 3, radialSegments: 3, flex: 0.65,
          },
          children: [{ type: 'leaves', name: 'Blossom cards', params: lowCard(blossom.id, { count: 6, size: 1.4, faceUp: 0.65 }) }],
        }, {
          type: 'leaves', name: 'Inner cards', params: lowCard(blossom.id, { count: 4, start: 0.35, size: 1.3, tipLeaf: false, faceUp: 0.65 }),
        }],
      }],
    }],
  });
}

function cityPalm() {
  const bark = lowBark('Palm Trunk', {
    style: 'fibrous', seed: 5, scale: 4, stretch: 1, depth: 0.6, crackWidth: 0.4, warp: 0.2, detail: 0.5, rings: 0.85, moss: 0,
    colorTop: '#7d705c', colorCrack: '#352b20', colorVar: '#94846b', tileSize: 1.0, tileAspect: 0.9, roughness: 0.9,
  });
  const crown = lowBark('Palm Crownshaft', {
    style: 'fibrous', seed: 8, scale: 6, stretch: 1, depth: 0.35, crackWidth: 0.3, warp: 0.3, detail: 0.7, rings: 0.35, moss: 0,
    colorTop: '#6b6a3c', colorCrack: '#3a3420', colorVar: '#857a4e', tileSize: 0.6, tileAspect: 1.2, roughness: 0.8,
  });
  const frond = makeMaterial('leaf', 'Palm Frond', {
    kind: 'frond', leaflets: 40, leafletWidth: 0.4, leafletAngle: 58, leafletDroop: 0.35, gaps: 0.2, variants: 2,
    colorBase: '#3e6a2a', colorTip: '#5c8a35', colorVein: '#9bb35a', colorSubsurface: '#a9c84a', colorVariation: 0.3,
    dryness: 0.18, roughness: 0.45, translucency: 0.55, resolution: 512,
  });
  return build('City Palm', [bark, crown, frond], {
    type: 'tree', id: 'tree', params: { seed: 2808 },
    children: [{
      type: 'trunk', name: 'Trunk',
      params: {
        length: 10, radius: 0.22, radiusCurve: [[0, 1], [0.1, 0.85], [1, 0.72]], tilt: 8, gravity: -0.05,
        gnarl: 0.12, gnarlScale: 0.15, upAttraction: 0.2, flare: 0.5, flareHeight: 0.5, flareLobes: 0, ripple: 0.02, sink: 0.15,
        lengthSegments: 8, radialSegments: 7, material: bark.id, crownLength: 1.2, crownBulge: 1.4, crownTop: 0.3, crownMaterial: crown.id,
      },
      children: [{
        type: 'fronds', name: 'Fronds',
        params: {
          count: 14, countByLength: false, start: 0.975, end: 1, phyllotaxy: 'spiral', length: 3.8, lengthCurve: [[0, 0.75], [1, 1]],
          lengthVar: 0.18, width: 1.6, angle: 58, angleVar: 25, fold: 28, twist: 20, gravity: 2, gravityCurve: [[0, 0.15], [0.5, 0.6], [1, 1]],
          upAttraction: 0.1, rachisRadius: 0.04, sheath: 2, rachisMaterial: crown.id, lengthSegments: 6, widthSegments: 1, material: frond.id,
        },
      }],
    }],
  });
}

function citySapling() {
  const bark = lowBark('Sapling Bark', {
    style: 'smooth', seed: 71, scale: 5, stretch: 2.5, depth: 0.3, crackWidth: 0.2, detail: 0.4, rings: 0.2, moss: 0,
    colorTop: '#6b5e4e', colorCrack: '#30271f', colorVar: '#7c6e5c', tileSize: 0.3,
  });
  const leaf = lowClump('Sapling Foliage', {
    shape: 'ovate', width: 0.6, tip: 0.55, serration: 0.3, petiole: 0.12, veins: 6, clumpLeaves: 70, clumpLeafSize: 0.14,
    colorBase: '#456f28', colorTip: '#5f8f34', colorVein: '#8fb158', colorSubsurface: '#b0cf45',
  });
  return build('City Sapling', [bark, leaf], {
    type: 'tree', id: 'tree', params: { seed: 2909 },
    children: [{
      type: 'trunk', name: 'Trunk',
      params: {
        length: 4.2, radius: 0.055, radiusCurve: [[0, 1], [1, 0.25]], tilt: 2, gnarl: 0.1, gnarlScale: 0.4,
        flare: 0.2, flareHeight: 0.2, flareLobes: 0, ripple: 0.01, sink: 0.08, lengthSegments: 5, radialSegments: 5, material: bark.id,
      },
      children: [{
        type: 'branches', name: 'Branches',
        params: {
          count: 7, countByLength: false, start: 0.5, end: 0.95, length: 0.3, lengthCurve: [[0, 1], [1, 0.5]], lengthVar: 0.2,
          radiusRatio: 0.5, angle: 40, angleVar: 10, gravity: 0.1, upAttraction: 0.5, gnarl: 0.3, gnarlScale: 1.5, collar: 0.2,
          lengthSegments: 3, radialSegments: 3, flex: 0.8,
        },
        children: [{ type: 'leaves', name: 'Foliage cards', params: lowCard(leaf.id, { count: 4, size: 0.8, faceUp: 0.5 }) }],
      }, {
        type: 'leaves', name: 'Leader cards', params: lowCard(leaf.id, { count: 4, start: 0.7, size: 0.7, faceUp: 0.4 }),
      }],
    }],
  });
}

function cityShrub() {
  const bark = lowBark('Shrub Bark', {
    style: 'smooth', seed: 13, scale: 6, stretch: 2.5, depth: 0.35, crackWidth: 0.25, detail: 0.5, rings: 0.3,
    colorTop: '#5e5246', colorCrack: '#2d241d', colorVar: '#6f6355', tileSize: 0.4,
  });
  const leaf = lowClump('Shrub Foliage', {
    shape: 'elliptic', width: 0.5, tip: 0.55, serration: 0.15, petiole: 0.08, veins: 6, clumpLeaves: 130, clumpLeafSize: 0.1,
    colorBase: '#335c25', colorTip: '#47762f', colorVein: '#7ea150', colorSubsurface: '#8fbf3a',
    colorVariation: 0.35,
  });
  return build('City Shrub', [bark, leaf], {
    type: 'tree', id: 'tree', params: { seed: 3010 },
    children: [{
      type: 'trunk', name: 'Stems',
      params: {
        count: 5, length: 1.3, lengthVar: 0.25, radius: 0.03, radiusCurve: [[0, 1], [1, 0.2]], spread: 0.2, splay: 38,
        tilt: 8, gravity: 0.2, gnarl: 0.4, gnarlScale: 1.5, flare: 0, flareLobes: 0, sink: 0.05, lengthSegments: 4, radialSegments: 3,
        material: bark.id,
      },
      children: [{
        type: 'leaves', name: 'Foliage cards',
        params: lowCard(leaf.id, { count: 10, start: 0.15, size: 0.9, angle: 55, faceUp: 0.5, normalBlend: 0.85 }),
      }],
    }],
  });
}

export const PRESETS = {
  oak: { label: 'Oak', build: oak },
  birch: { label: 'Birch', build: birch },
  spruce: { label: 'Spruce', build: spruce },
  palm: { label: 'Palm', build: palm },
  shrub: { label: 'Shrub', build: shrub },
  grass: { label: 'Grass', build: grass },

  cityLinden: { label: 'Street Linden', group: 'city', build: cityLinden },
  cityPlane: { label: 'Plane Tree', group: 'city', build: cityPlane },
  cityOak: { label: 'Park Oak', group: 'city', build: cityOak },
  cityPoplar: { label: 'Columnar Poplar', group: 'city', build: cityPoplar },
  cityBirch: { label: 'Birch', group: 'city', build: cityBirch },
  cityCherry: { label: 'Cherry Blossom', group: 'city', build: cityCherry },
  cityConifer: { label: 'Conifer', group: 'city', build: cityConifer },
  cityPine: { label: 'Pine', group: 'city', build: cityPine },
  cityPalm: { label: 'Boulevard Palm', group: 'city', build: cityPalm },
  citySapling: { label: 'Young Tree', group: 'city', build: citySapling },
  cityShrub: { label: 'Round Shrub', group: 'city', build: cityShrub },
};
