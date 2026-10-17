// App state (zustand): the document, selection, viewer settings, and undo/redo history.
// Rapid edits to the same field are coalesced into one history entry.

import { create } from 'zustand';
import { PRESETS } from '../tree/presets.js';
import { makeNode, makeMaterial, canParent, isDescendant, autoLayout, normalizeDoc, uid } from '../tree/document.js';
import { NODE_TYPES } from '../tree/schema.js';

const STORAGE_KEY = 'botanica.v2.doc';
const HISTORY_LIMIT = 150;
const COALESCE_MS = 600;

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeDoc(JSON.parse(raw));
  } catch {
    /* ignore corrupt storage */
  }
  return PRESETS.oak.build();
}

let saveTimer = null;
function persist(doc) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    } catch {
      /* quota or private mode */
    }
  }, 400);
}

export const useStore = create((set, get) => {
  /** Apply a document mutation with history. `key` enables coalescing. */
  const commit = (nextDoc, key = null) => {
    const { doc, past, lastKey, lastTime } = get();
    if (nextDoc === doc) return;
    const now = performance.now();
    const coalesce = key && key === lastKey && now - lastTime < COALESCE_MS;
    set({
      doc: nextDoc,
      past: coalesce ? past : [...past, doc].slice(-HISTORY_LIMIT),
      future: [],
      lastKey: key,
      lastTime: now,
    });
    persist(nextDoc);
  };

  const mapNodes = (fn) => {
    const { doc } = get();
    return { ...doc, nodes: doc.nodes.map(fn) };
  };

  const initialDoc = loadInitial();
  return {
    doc: initialDoc,
    past: [],
    future: [],
    lastKey: null,
    lastTime: 0,
    selection: { type: 'node', id: initialDoc.nodes.find((n) => n.type === 'trunk')?.id ?? 'tree' },
    leftTab: 'graph',
    view: {
      mode: 'lit', // lit | albedo | ao | wind | wireframe
      wind: 0.35,
      windDir: 20,
      sunAzimuth: 35,
      sunElevation: 42,
      skeleton: false,
      ground: true,
      autoRotate: false,
      lod: 0, // 0 | 1 | 2 | 'auto' (by camera distance, same ranges as the Godot export)
    },
    result: null,
    lodStats: [], // stats of the generated LOD1/2 previews, by level
    activeLod: 0,
    lodDistance: null,
    generating: false,
    bakeMs: 0,

    // ---- history
    undo() {
      const { past, doc, future } = get();
      if (!past.length) return;
      const prev = past[past.length - 1];
      set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], lastKey: null });
      persist(prev);
    },
    redo() {
      const { past, doc, future } = get();
      if (!future.length) return;
      const next = future[0];
      set({ doc: next, past: [...past, doc], future: future.slice(1), lastKey: null });
      persist(next);
    },

    // ---- document
    loadPreset(key) {
      const doc = PRESETS[key].build();
      commit(doc);
      set({ selection: { type: 'node', id: doc.nodes.find((n) => n.type === 'trunk' || n.type === 'grass')?.id ?? 'tree' } });
    },
    loadDocument(raw) {
      const doc = normalizeDoc(raw);
      commit(doc);
      set({ selection: { type: 'node', id: doc.nodes[0]?.id } });
    },
    renameDocument(name) {
      commit({ ...get().doc, name }, 'doc-name');
    },

    setNodeParam(id, key, value) {
      commit(mapNodes((n) => (n.id === id ? { ...n, params: { ...n.params, [key]: value } } : n)), `node:${id}:${key}`);
    },
    setNodeProps(id, props, key = null) {
      commit(mapNodes((n) => (n.id === id ? { ...n, ...props } : n)), key);
    },
    setNodePositions(changes) {
      // drag moves are cosmetic; keep them out of history granularity by coalescing
      const pos = new Map(changes.map((c) => [c.id, c.position]));
      commit(mapNodes((n) => (pos.has(n.id) ? { ...n, position: pos.get(n.id) } : n)), 'node-drag');
    },
    addNode(type, parentId, position) {
      const { doc } = get();
      const parent = doc.nodes.find((n) => n.id === parentId);
      if (parent && !canParent(type, parent.type)) return null;
      const params = {};
      if (type === 'leaves' || type === 'fronds' || type === 'grass') {
        const leafMat = doc.materials.find((m) => m.kind === 'leaf');
        if (leafMat) params.material = leafMat.id;
      }
      if (type === 'trunk') {
        const bark = doc.materials.find((m) => m.kind === 'bark');
        if (bark) params.material = bark.id;
      }
      const fallback = parent ? { x: parent.position.x + 40, y: parent.position.y + 150 } : { x: 0, y: 0 };
      const node = makeNode(type, parent?.id ?? null, params, { position: position ?? fallback });
      commit({ ...doc, nodes: [...doc.nodes, node] });
      set({ selection: { type: 'node', id: node.id } });
      return node.id;
    },
    connect(childId, parentId) {
      const { doc } = get();
      const child = doc.nodes.find((n) => n.id === childId);
      const parent = doc.nodes.find((n) => n.id === parentId);
      if (!child || !parent || child.id === parent.id) return false;
      if (!canParent(child.type, parent.type)) return false;
      if (isDescendant(doc, parent.id, child.id)) return false; // would create a cycle
      commit(mapNodes((n) => (n.id === childId ? { ...n, parent: parentId } : n)));
      return true;
    },
    disconnect(childId) {
      if (!get().doc.nodes.some((n) => n.id === childId && n.parent)) return;
      commit(mapNodes((n) => (n.id === childId ? { ...n, parent: null } : n)));
    },
    deleteNodes(ids) {
      const { doc, selection } = get();
      const removable = new Set(ids.filter((id) => !NODE_TYPES[doc.nodes.find((n) => n.id === id)?.type]?.singleton));
      if (!removable.size) return;
      // a generator without its parent produces nothing, so the whole subtree goes (undo restores it)
      let grew = true;
      while (grew) {
        grew = false;
        for (const n of doc.nodes) {
          if (n.parent && removable.has(n.parent) && !removable.has(n.id)) {
            removable.add(n.id);
            grew = true;
          }
        }
      }
      commit({ ...doc, nodes: doc.nodes.filter((n) => !removable.has(n.id)) });
      if (selection.type === 'node' && removable.has(selection.id)) set({ selection: { type: 'node', id: 'tree' } });
    },
    duplicateNode(id, withChildren = true) {
      const { doc } = get();
      const src = doc.nodes.find((n) => n.id === id);
      if (!src || NODE_TYPES[src.type].singleton) return;
      const created = [];
      const clone = (node, parent, offset) => {
        const copy = { ...structuredClone(node), id: uid(node.type.slice(0, 2)), parent, position: { x: node.position.x + offset, y: node.position.y + 30 } };
        if (node.id === src.id) copy.name = `${node.name} copy`;
        created.push(copy);
        if (withChildren) doc.nodes.filter((n) => n.parent === node.id).forEach((c) => clone(c, copy.id, offset));
        return copy;
      };
      const top = clone(src, src.parent, 60);
      commit({ ...doc, nodes: [...doc.nodes, ...created] });
      set({ selection: { type: 'node', id: top.id } });
    },
    tidyLayout() {
      commit(autoLayout(get().doc));
    },

    // ---- materials
    setMaterialParam(id, key, value) {
      const { doc } = get();
      commit({ ...doc, materials: doc.materials.map((m) => (m.id === id ? { ...m, params: { ...m.params, [key]: value } } : m)) }, `mat:${id}:${key}`);
    },
    renameMaterial(id, name) {
      const { doc } = get();
      commit({ ...doc, materials: doc.materials.map((m) => (m.id === id ? { ...m, name } : m)) }, `mat-name:${id}`);
    },
    addMaterial(kind) {
      const { doc } = get();
      const m = makeMaterial(kind, kind === 'bark' ? 'New Bark' : 'New Leaf');
      commit({ ...doc, materials: [...doc.materials, m] });
      set({ selection: { type: 'material', id: m.id }, leftTab: 'materials' });
    },
    duplicateMaterial(id) {
      const { doc } = get();
      const src = doc.materials.find((m) => m.id === id);
      if (!src) return;
      const m = { ...structuredClone(src), id: uid(src.kind === 'bark' ? 'mb' : 'ml'), name: `${src.name} copy` };
      commit({ ...doc, materials: [...doc.materials, m] });
      set({ selection: { type: 'material', id: m.id } });
    },
    deleteMaterial(id) {
      const { doc } = get();
      const materials = doc.materials.filter((m) => m.id !== id);
      const nodes = doc.nodes.map((n) => {
        const params = { ...n.params };
        let changed = false;
        for (const k of Object.keys(params)) {
          if (params[k] === id) {
            params[k] = null;
            changed = true;
          }
        }
        return changed ? { ...n, params } : n;
      });
      commit({ ...doc, materials, nodes });
      set({ selection: { type: 'node', id: 'tree' } });
    },

    // ---- ui
    select(selection) {
      set({ selection });
    },
    setLeftTab(leftTab) {
      set({ leftTab });
    },
    setView(patch) {
      set({ view: { ...get().view, ...patch } });
    },
    setResult(result) {
      set({ result, generating: false });
    },
    setLodStats(level, stats) {
      const lodStats = [...get().lodStats];
      lodStats[level] = stats;
      set({ lodStats });
    },
    setActiveLod(activeLod, lodDistance) {
      set({ activeLod, lodDistance });
    },
    setGenerating(generating) {
      set({ generating });
    },
    setBakeMs(bakeMs) {
      set({ bakeMs });
    },
  };
});

export function treeSeed(doc) {
  return doc.nodes.find((n) => n.type === 'tree')?.params.seed ?? 0;
}
