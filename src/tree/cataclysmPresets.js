// Temperate woodland, wetland and disturbance variants for Cataclysm.
// Each function returns a fresh, editable graph and a local material library.
import { makeMaterial } from './document.js';
import { build, lowBark, lowCard, lowClump } from './presetUtils.js';

function tree(name, seed, bark, leaf, stem, children) {
  return build(name, leaf ? [bark, leaf] : [bark], {
    type: 'tree', id: 'tree', params: { seed },
    children: [{
      type: 'trunk', name: 'Trunk', params: {
        lengthSegments: 10, radialSegments: 7, gnarl: 0.18, flareLobes: 4, sink: 0.14,
        radiusCurve: [[0, 1], [0.22, 0.8], [0.72, 0.42], [1, 0.06]], ...stem, material: bark.id,
      }, children,
    }],
  });
}

function limb(name, params, children = []) {
  return { type: 'branches', name, params: {
    countByLength: false, angleVar: 10, lengthVar: 0.17, lengthSegments: 5, radialSegments: 4, flex: 0.45, ...params,
  }, children };
}

function forks(name, params, children = []) {
  return limb(name, {
    countByLength: true, phyllotaxy: 'alternate', start: 0.18, end: 0.99, length: 0.52, radiusRatio: 0.43,
    lengthCurve: [[0, 1], [1, 0.52]], angle: 49, gnarl: 0.45, collar: 0.25, flex: 0.65, lengthSegments: 3, radialSegments: 3, ...params,
  }, children);
}

function sprays(leaf, name, count, size, params = {}) {
  return { type: 'leaves', name, params: lowCard(leaf.id, {
    count, size, roll: 50, sizeVar: 0.22, cardPuff: 0.38, normalBlend: 0.72, ...params,
  }) };
}

function foliage(name, params) {
  return lowClump(name, { resolution: 512, variants: 2, clumpLeaves: 125, clumpLeafSize: 0.12, ...params });
}

function whitePine() {
  const bark = lowBark('Pine Bark', { style: 'furrowed', scale: 12, stretch: 3.2, colorTop: '#65594c', colorCrack: '#28251f', colorVar: '#8b7461' });
  const leaf = makeMaterial('leaf', 'Pine Shoots', {
    kind: 'fir', resolution: 512, variants: 1, sideShoots: 6, needleLength: 0.28, needleWidth: 0.38, needleAngle: 47,
    needleDensity: 0.72, tintShootTips: true, colorBase: '#254037', colorTip: '#749079', colorVein: '#56543b', colorSubsurface: '#869c61',
  });
  return tree('Eastern White Pine', 6101, bark, leaf, { length: 24, radius: 0.43, tilt: 2, gnarl: 0.08 }, [
    limb('High whorls', { count: 24, start: 0.49, end: 0.99, phyllotaxy: 'whorled', whorlSize: 4, rotationJitter: 24,
      length: 0.29, lengthCurve: [[0.49, 0.74], [0.67, 1], [1, 0.17]], radiusRatio: 0.37, angle: 99, angleCurve: [[0.49, 1], [1, 0.68]],
      gnarl: 0.35, upAttraction: 0.54, gravity: 0.19, radialSegments: 3, lengthSegments: 3 }, [
      forks('Upturned branchlets', { count: 4, length: 0.57, phyllotaxy: 'lateral', angle: 53, upAttraction: 0.65, gravity: 0.06, lengthSegments: 2 }, [
        sprays(leaf, 'Needle tufts', 5, 2.05, { start: 0.12, droop: 0.1, widthScale: 1.1, angle: 33, roll: 29 }),
      ]),
      sprays(leaf, 'Inner shoots', 6, 2.36, { start: 0.14, angle: 28, scaleToParent: true }),
    ]),
    limb('Remaining lower limbs', { count: 4, start: 0.31, end: 0.51, length: 0.16, angle: 97, angleVar: 14, gnarl: 0.38,
      lengthCurve: [[0.31, 0.48], [0.51, 1]], radiusRatio: 0.27, upAttraction: 0.55, lengthSegments: 3, radialSegments: 3 }, [
      sprays(leaf, 'Lower tufts', 4, 1.43, { start: 0.6, angle: 32, roll: 28 }),
    ]),
    sprays(leaf, 'Leader', 13, 1.1, { start: 0.89, angle: 33, sizeCurve: [[0.89, 1], [1, 0.34]] }),
  ]);
}

function tulipPoplar() {
  const bark = lowBark('Tulip Poplar Bark', { style: 'furrowed', scale: 20, stretch: 5.2, colorTop: '#726c56', colorCrack: '#363126', colorVar: '#827e69' });
  const leaf = foliage('Tulip Leaves', { shape: 'deltoid', width: 0.91, lobes: 4, lobeDepth: 0.32, tip: 0.12,
    clumpLeafSize: 0.15, colorBase: '#406033', colorTip: '#77934d', colorVein: '#8b995e', colorSubsurface: '#b2ba62' });
  return tree('Tulip Poplar', 6102, bark, leaf, { length: 22, radius: 0.45, tilt: 1, gnarl: 0.07, flare: 0.65 }, [
    limb('Ascending scaffolds', { count: 14, start: 0.44, end: 0.97, length: 0.36, lengthCurve: [[0.44, 0.91], [0.62, 1], [1, 0.25]],
      radiusRatio: 0.48, angle: 46, upAttraction: 0.38, gravity: 0.12, gnarl: 0.25 }, [
      forks('Crown forks', { count: 7, angle: 48, upAttraction: 0.37 }, [sprays(leaf, 'Outer leaves', 7, 2.15, { start: 0.06 })]),
      sprays(leaf, 'Inner canopy', 6, 2.35),
    ]),
    sprays(leaf, 'Top foliage', 10, 1.9, { start: 0.84 }),
  ]);
}

function swampOak() {
  const bark = lowBark('Old Oak Bark', { style: 'furrowed', scale: 17, stretch: 5.4, depth: 0.91, moss: 0.23,
    colorTop: '#645b4a', colorCrack: '#25221b', colorVar: '#847a63' });
  const leaf = foliage('Oak Leaves', { shape: 'obovate', width: 0.63, lobes: 5, lobeDepth: 0.39, tip: 0.17, serration: 0,
    clumpWidth: 0.99, colorBase: '#334d2b', colorTip: '#617944', colorVein: '#84935a', colorSubsurface: '#a7b664' });
  return tree('Swamp White Oak', 6103, bark, leaf, { length: 10.5, radius: 0.66, tilt: 6, gnarl: 0.43, flare: 1.05, radialSegments: 9 }, [
    limb('Spreading limbs', { count: 8, start: 0.26, end: 0.92, length: 0.72, lengthCurve: [[0.26, 1], [0.58, 0.95], [1, 0.53]],
      angle: 72, angleCurve: [[0.26, 1.14], [1, 0.63]], gnarl: 0.7, radiusRatio: 0.65, collar: 0.8, radialSegments: 5, lengthSegments: 6 }, [
      forks('Crooked forks', { count: 7, length: 0.54, gnarl: 0.72, angle: 57 }, [
        forks('Outer twigs', { count: 2, start: 0.48, length: 0.46, angle: 48, lengthSegments: 2 }, [sprays(leaf, 'Leaf clusters', 3, 1.72)]),
        sprays(leaf, 'Fork foliage', 5, 2.05),
      ]),
      sprays(leaf, 'Inner canopy', 4, 2.2, { start: 0.45 }),
    ]),
    sprays(leaf, 'Crown top', 7, 1.9, { start: 0.82 }),
  ]);
}

function redMaple() {
  const bark = lowBark('Maple Bark', { style: 'plated', seed: 17, scale: 11, stretch: 3, depth: 0.5,
    colorTop: '#68655e', colorCrack: '#36332e', colorVar: '#817870' });
  const leaf = foliage('Autumn Maple Leaves', { shape: 'cordate', lobes: 3, lobeDepth: 0.53, width: 0.86, serration: 0.35, tip: 0.7,
    clumpLeaves: 145, colorBase: '#81382b', colorTip: '#cc6335', colorVein: '#ad6638', colorSubsurface: '#e78c41', colorVariation: 0.6 });
  return tree('Autumn Red Maple', 6104, bark, leaf, { length: 11.6, radius: 0.32, tilt: 3 }, [
    limb('Low crown forks', { count: 10, start: 0.24, end: 0.93, length: 0.52, angle: 52, upAttraction: 0.46, radiusRatio: 0.57 }, [
      forks('Paired branches', { count: 7, phyllotaxy: 'opposite', length: 0.49, angle: 48 }, [
        sprays(leaf, 'Dense leaf clusters', 7, 1.67, { start: 0.06, angle: 62, roll: 65, droop: 0.16, faceUp: 0.66, widthSegments: 2, fold: 0.26 }),
      ]), sprays(leaf, 'Inner foliage', 7, 1.9),
    ]),
    sprays(leaf, 'Crown foliage', 10, 1.7, { start: 0.75 }),
  ]);
}

function americanElm() {
  const bark = lowBark('Elm Bark', { style: 'furrowed', scale: 19, stretch: 6.3, warp: 0.62, colorTop: '#675e51', colorCrack: '#2b271f', colorVar: '#867965' });
  const leaf = foliage('Elm Leaves', { shape: 'elliptic', width: 0.57, serration: 0.64, teeth: 35,
    colorBase: '#315436', colorTip: '#66884b', colorVein: '#85935a', colorSubsurface: '#a9be6a' });
  return tree('American Elm', 6105, bark, leaf, { length: 12.4, radius: 0.46, tilt: 3, flare: 0.85 }, [
    limb('Vase limbs', { count: 9, start: 0.37, end: 0.79, length: 0.85, lengthCurve: [[0, 1], [1, 0.78]], radiusRatio: 0.67,
      angle: 36, gravity: 0.79, gravityCurve: [[0, 0], [0.45, 0.16], [1, 1]], outward: 0.69, upAttraction: 0.09, lengthSegments: 7, radialSegments: 5 }, [
      forks('Arching fans', { count: 8, length: 0.41, start: 0.33, phyllotaxy: 'lateral', angle: 50, upAttraction: 0.12, gravity: 0.64 }, [
        sprays(leaf, 'Pendant leaves', 7, 1.75, { start: 0.10, droop: 0.42, curl: 0.3 }),
      ]), sprays(leaf, 'Crown mantle', 7, 2.0, { start: 0.55 }),
    ]),
    sprays(leaf, 'Crown center', 7, 1.65, { start: 0.85 }),
  ]);
}

function riverBirch() {
  const bark = lowBark('Peeling Birch Bark', { style: 'birch', seed: 37, scale: 4, stretch: 1.6, rings: 0.74, depth: 0.58,
    colorTop: '#c7ac8e', colorCrack: '#514135', colorVar: '#e1cbb1', tileSize: 0.62 });
  const leaf = foliage('Birch Leaves', { shape: 'deltoid', width: 0.66, serration: 0.55, clumpWidth: 0.8,
    colorBase: '#4b622a', colorTip: '#889449', colorVein: '#a5a961', colorSubsurface: '#bbc264' });
  return tree('River Birch', 6106, bark, leaf, { count: 3, length: 11.8, lengthVar: 0.2, radius: 0.15, spread: 0.38, splay: 18,
    tilt: 5, gnarl: 0.24, flare: 0.34, flareLobes: 0, radialSegments: 6 }, [
    limb('Fine lateral branches', { count: 13, start: 0.36, end: 0.995, length: 0.29, lengthCurve: [[0.36, 0.95], [0.6, 1], [1, 0.18]],
      angle: 49, gravity: 0.51, upAttraction: 0.16, gnarl: 0.32, radiusRatio: 0.36, lengthSegments: 3, radialSegments: 3 }, [
      sprays(leaf, 'Airy leaf sprays', 9, 1.34, { droop: 0.28, faceUp: 0.45, widthSegments: 2, fold: 0.23 }),
    ]), sprays(leaf, 'Stem tips', 6, 1.12, { start: 0.88, angle: 32 }),
  ]);
}

function willowBark() {
  return lowBark('Willow Bark', { style: 'furrowed', scale: 20, stretch: 4.5, moss: 0.21, depth: 0.8,
    colorTop: '#62583e', colorCrack: '#30281e', colorVar: '#847759' });
}

function blackWillow() {
  const bark = willowBark();
  const leaf = makeMaterial('leaf', 'Willow Sprays', { kind: 'twig', resolution: 512, variants: 2, shape: 'lanceolate',
    width: 0.28, tip: 0.91, sideTwigs: 3, twigLeaves: 18, leafScale: 0.24, twigSpread: 43, twigWidth: 0.23, twigCurve: 0.32, colorBase: '#505d36', colorTip: '#8a9653', colorVein: '#9ba56e', colorSubsurface: '#c0c77c' });
  return tree('Black Willow', 6107, bark, leaf, { length: 8.5, radius: 0.42, tilt: 11, gnarl: 0.51, flare: 0.85 }, [
    limb('Low spreading forks', { count: 10, start: 0.23, end: 0.93, length: 0.68, radiusRatio: 0.58, angle: 61, upAttraction: 0.26,
      gnarl: 0.54, outward: 0.33, lengthSegments: 6, radialSegments: 5 }, [
      forks('Slender switches', { count: 9, length: 0.55, angle: 50, gravity: 1.35, gravityCurve: [[0, 0.22], [1, 1]],
        upAttraction: 0.02, outward: 0.02, flex: 0.87, lengthSegments: 4 }, [
        sprays(leaf, 'Trailing foliage', 8, 1.55, { widthScale: 1.2, angle: 24, faceUp: 0.25, droop: 0.67, curl: 0.35, flutter: 0.84 }),
      ]), sprays(leaf, 'Inner leaves', 5, 1.68, { start: 0.43, droop: 0.25 }),
    ]),
    sprays(leaf, 'Crown shoots', 12, 1.45, { start: 0.75, droop: 0.32 }),
  ]);
}

function fineCrownWillow() {
  const leaf = makeMaterial('leaf', 'Fine Willow Shoots', {
    kind: 'twig', shape: 'lanceolate', resolution: 512, variants: 3, twigLeaves: 21, sideTwigs: 2,
    leafScale: 0.20, width: 0.25, tip: 0.91, twigSpread: 48, twigCurve: 0.46, twigIrregularity: 0.86,
    twigWidth: 0.21, colorBase: '#40583a', colorTip: '#879854', colorVein: '#83915c', colorSubsurface: '#aebe73',
    normalStrength: 0.78, roughness: 0.65, translucency: 0.64, colorVariation: 0.47,
  });
  return tree('Black Willow (Fine Crown)', 6107, willowBark(), leaf, {
    length: 8.8, radius: 0.43, tilt: 8, gnarl: 0.42, flare: 0.78,
  }, [
    limb('Spreading forks', { count: 10, start: 0.26, end: 0.94, length: 0.65, radiusRatio: 0.6, angle: 58,
      outward: 0.31, upAttraction: 0.32, gnarl: 0.49, lengthSegments: 6, radialSegments: 5 }, [
      forks('Arching switches', { count: 6, countByLength: false, length: 0.54, start: 0.18, angle: 54, lengthVar: 0.18, gravity: 1.25,
        gravityCurve: [[0, 0.12], [0.55, 0.59], [1, 1]], upAttraction: 0.07, outward: 0.12, flex: 0.8, lengthSegments: 4 }, [
        sprays(leaf, 'Pendant sprays', 6, 1.54, { countByLength: false, start: 0.08, widthScale: 1.08, sizeVar: 0.32,
          sizeCurve: [[0, 0.86], [0.45, 1], [1, 0.78]], angle: 34, angleVar: 21,
          faceUp: 0.38, roll: 53, droop: 0.52, curl: 0.43, twist: 0.34, lengthSegments: 2, flutter: 0.8, cardPuff: 0.23 }),
        sprays(leaf, 'Side shoots', 3, 1.12, { start: 0.20, end: 0.86, tipLeaf: false, phyllotaxy: 'lateral',
          angle: 64, faceUp: 0.68, droop: 0.28, sizeVar: 0.30, flutter: 0.6, lodPolicy: 'detail' }),
      ]),
      sprays(leaf, 'Inner foliage', 8, 1.47, { start: 0.31, angle: 57, faceUp: 0.64, droop: 0.18, widthSegments: 2, fold: 0.30 }),
    ]),
    limb('Upper fans', { count: 5, start: 0.74, end: 0.98, length: 0.31, lengthCurve: [[0.74, 1], [1, 0.4]],
      radiusRatio: 0.42, angle: 44, gravity: 0.55, upAttraction: 0.16, gnarl: 0.43, lengthSegments: 3, radialSegments: 3 }, [
      sprays(leaf, 'Crown sprays', 9, 1.25, { start: 0.14, angle: 49, droop: 0.26, faceUp: 0.53, curl: 0.27, lengthSegments: 2 }),
    ]),
  ]);
}

function stormSnag() {
  const bark = lowBark('Weathered Wood', { style: 'furrowed', scale: 24, stretch: 7, moss: 0.06, depth: 0.66,
    colorTop: '#858078', colorCrack: '#39352f', colorVar: '#a59b87', normalStrength: 1.5 });
  return tree('Storm Snag', 6108, bark, null, { length: 13.5, radius: 0.38, tilt: 7, gnarl: 0.31, flare: 0.63,
    radiusCurve: [[0, 1], [0.4, 0.67], [0.87, 0.27], [1, 0.045]] }, [
    limb('Stripped limbs', { count: 9, start: 0.32, end: 0.94, length: 0.33, lengthVar: 0.39, angle: 59, angleVar: 23,
      radiusRatio: 0.54, gnarl: 1.1, flex: 0.16, gravity: 0.18, lengthSegments: 5, radialSegments: 5 }, [
      // Four sides keep exposed forks visible when LOD2 drops thin, leaf-covered twigs.
      forks('Bare forks', { count: 4, start: 0.38, length: 0.47, lengthVar: 0.35, gnarl: 0.75, radialSegments: 4, flex: 0.25 }),
    ]),
    limb('Snapped stubs', { count: 5, start: 0.18, end: 0.83, length: 0.08, angle: 83, radiusRatio: 0.47,
      lengthVar: 0.32, radiusCurve: [[0, 1], [0.7, 0.65], [1, 0.10]], lengthSegments: 2, radialSegments: 3 }),
  ]);
}

export const CATACLYSM_PRESETS = {
  catWhitePine: { label: 'Eastern White Pine', group: 'cataclysm', build: whitePine },
  catTulipPoplar: { label: 'Tulip Poplar', group: 'cataclysm', build: tulipPoplar },
  catSwampOak: { label: 'Swamp White Oak', group: 'cataclysm', build: swampOak },
  catRedMaple: { label: 'Autumn Red Maple', group: 'cataclysm', build: redMaple },
  catAmericanElm: { label: 'American Elm', group: 'cataclysm', build: americanElm },
  catRiverBirch: { label: 'River Birch', group: 'cataclysm', build: riverBirch },
  catBlackWillow: { label: 'Black Willow', group: 'cataclysm', build: blackWillow },
  catFineCrownWillow: { label: 'Black Willow (Fine Crown)', group: 'cataclysm', build: fineCrownWillow },
  catStormSnag: { label: 'Storm Snag', group: 'cataclysm', build: stormSnag },
};
