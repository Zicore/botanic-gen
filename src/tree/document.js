// Document model: a tree-shaped generator graph plus a material library.
//
// doc = {
//   version, name,
//   nodes: [{ id, type, name, parent, enabled, position: {x, y}, params }],
//   materials: [{ id, kind: 'bark' | 'leaf', name, params }],
// }

import { NODE_TYPES, nodeDefaults, materialDefaults, withDefaults } from './schema.js';

export const DOC_VERSION = 2;

let counter = 0;
export function uid(prefix = 'n') {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function makeNode(type, parent, params = {}, extra = {}) {
  return {
    id: extra.id ?? uid(type.slice(0, 2)),
    type,
    name: extra.name ?? NODE_TYPES[type].label,
    parent: parent ?? null,
    enabled: true,
    position: extra.position ?? { x: 0, y: 0 },
    params: { ...nodeDefaults(type), ...params },
  };
}

export function makeMaterial(kind, name, params = {}, id) {
  return { id: id ?? uid(kind === 'bark' ? 'mb' : 'ml'), kind, name, params: { ...materialDefaults(kind), ...params } };
}

export function canParent(childType, parentType) {
  return NODE_TYPES[childType]?.accepts.includes(parentType) ?? false;
}

export function isDescendant(doc, nodeId, maybeAncestorId) {
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  let cur = byId.get(nodeId);
  while (cur) {
    if (cur.id === maybeAncestorId) return true;
    cur = cur.parent ? byId.get(cur.parent) : null;
  }
  return false;
}

/** Upgrade / repair a loaded document. */
export function normalizeDoc(doc) {
  const nodes = (doc.nodes || [])
    .filter((n) => NODE_TYPES[n.type])
    .map((n) => ({
      ...n,
      enabled: n.enabled !== false,
      position: n.position || { x: 0, y: 0 },
      params: withDefaults(n.params, nodeDefaults(n.type)),
    }));
  if (!nodes.some((n) => n.type === 'tree')) nodes.unshift(makeNode('tree', null, {}, { id: 'tree' }));
  const materials = (doc.materials || [])
    .filter((m) => m.kind === 'bark' || m.kind === 'leaf')
    .map((m) => ({ ...m, params: withDefaults(m.params, materialDefaults(m.kind)) }));
  return { version: DOC_VERSION, name: doc.name || 'Untitled', nodes, materials };
}

/** Top-down tidy layout: parents above children, subtrees side by side. */
export function autoLayout(doc, { dx = 210, dy = 150 } = {}) {
  const kids = new Map();
  for (const n of doc.nodes) {
    if (!n.parent) continue;
    if (!kids.has(n.parent)) kids.set(n.parent, []);
    kids.get(n.parent).push(n);
  }
  const pos = new Map();
  let cursor = 0;
  const place = (n, depth) => {
    const ch = kids.get(n.id) || [];
    if (!ch.length) {
      pos.set(n.id, { x: cursor * dx, y: depth * dy });
      cursor++;
      return;
    }
    ch.forEach((c) => place(c, depth + 1));
    const xs = ch.map((c) => pos.get(c.id).x);
    pos.set(n.id, { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: depth * dy });
  };
  const roots = doc.nodes.filter((n) => !n.parent || !doc.nodes.some((m) => m.id === n.parent));
  roots.forEach((r) => place(r, 0));
  return { ...doc, nodes: doc.nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })) };
}
