// Species presets, expressed as nested generator specs.

import { makeNode, makeMaterial, autoLayout, normalizeDoc } from './document.js';

function build(name, materials, spec) {
  const nodes = [];
  // stable ids: generator seeds derive from node ids, so presets must not use random ids
  const prefix = name.toLowerCase();
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
    colorTop: '#8a7a64', colorCrack: '#3b3024', colorVar: '#a39277', tileSize: 1.0, tileAspect: 0.9, roughness: 0.9,
  });
  const frond = makeMaterial('leaf', 'Palm Frond', {
    kind: 'frond', leaflets: 44, leafletWidth: 0.4, leafletAngle: 58, leafletDroop: 0.35, gaps: 0.2, variants: 2,
    colorBase: '#3e6a2a', colorTip: '#5c8a35', colorVein: '#9bb35a', colorSubsurface: '#a9c84a', colorVariation: 0.3,
    dryness: 0.18, roughness: 0.45, translucency: 0.55,
  });
  return build('Palm', [bark, frond], {
    type: 'tree', id: 'tree', params: { seed: 31337 },
    children: [{
      type: 'trunk', name: 'Trunk',
      params: {
        length: 11, radius: 0.24, radiusCurve: [[0, 1], [0.1, 0.85], [1, 0.72]], tilt: 14, gravity: -0.08,
        gnarl: 0.15, gnarlScale: 0.15, upAttraction: 0.25, flare: 0.55, flareHeight: 0.6, flareLobes: 0, ripple: 0.02,
        lengthSegments: 32, radialSegments: 14, material: bark.id,
      },
      children: [{
        type: 'fronds', name: 'Fronds',
        params: {
          count: 22, countByLength: false, start: 0.975, end: 1, phyllotaxy: 'spiral', length: 4.2, lengthVar: 0.18,
          lengthCurve: [[0, 0.75], [1, 1]], width: 1.5, angle: 62, angleVar: 28,
          gravity: 2.1, gravityCurve: [[0, 0.15], [0.5, 0.6], [1, 1]], upAttraction: 0.1, fold: 28, twist: 20, rachisRadius: 0.035, material: frond.id,
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

export const PRESETS = {
  oak: { label: 'Oak', build: oak },
  birch: { label: 'Birch', build: birch },
  spruce: { label: 'Spruce', build: spruce },
  palm: { label: 'Palm', build: palm },
  shrub: { label: 'Shrub', build: shrub },
  grass: { label: 'Grass', build: grass },
};
