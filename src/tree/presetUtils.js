import { makeNode, makeMaterial, autoLayout, normalizeDoc } from './document.js';

export function build(name, materials, spec, idNamespace = name) {
  const nodes = [];
  // stable ids: generator seeds derive from node ids, so presets must not use random ids
  const prefix = idNamespace.toLowerCase().replace(/[^a-z0-9]+/g, '_');
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

export const lowCard = (material, params) => ({
  start: 0.2, end: 1, phyllotaxy: 'spiral', rotationJitter: 40, sizeVar: 0.25, angle: 45, angleVar: 15, faceUp: 0.55,
  roll: 40, droop: 0.05, fold: 0.15, curl: 0.12, widthSegments: 1, lengthSegments: 1, normalBlend: 0.8, material, ...params,
});

export const lowBark = (name, params) => makeMaterial('bark', name, { resolution: 512, ...params });
export const lowClump = (name, params) => makeMaterial('leaf', name, {
  kind: 'clump', clumpLeaves: 120, clumpLeafSize: 0.11, clumpWidth: 0.9, twigWidth: 0.3,
  colorVariation: 0.4, dryness: 0.06, translucency: 0.55, ...params,
});
