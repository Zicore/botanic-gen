// Bridges the document store to the worker generator, the texture baker and the viewer.

import { useEffect, useRef } from 'react';
import { useStore } from './store.js';
import { createGenerator } from '../tree/generatorClient.js';
import { getMaterialTextures, pruneTextureCache } from '../materials/textures.js';
import { materialDefaults, withDefaults } from '../tree/schema.js';
import { lodDocument, LOD_COUNT, IMPOSTOR_LEVEL } from '../export/lod.js';
import { bakeImpostor } from '../impostor/impostor.js';

export const engine = {
  viewer: null,
  generator: null,
  lodGenerators: [], // by level (1..), only fed while the viewport previews LODs
  lodKey: '', // generation key the current LOD previews belong to
  impostorKey: '',
  impostorTimer: 0,
  textures: new Map(), // materialId -> { maps, raw, layout, version, params, kind }
  result: null,
  textureVersion: 0,
  listeners: new Set(),
  notify() {
    this.textureVersion++;
    for (const l of this.listeners) l();
  },
};

/** Impostor bake settings for a document: frame layout from the Tree node, look from the first leaf material. */
export function impostorSettings(doc) {
  const tree = doc.nodes.find((n) => n.type === 'tree')?.params ?? {};
  const leaf = doc.materials.find((m) => m.kind === 'leaf')?.params;
  return {
    enabled: tree.impostor !== false,
    frames: Number(tree.impostorFrames) || 8,
    frameSize: Number(tree.impostorResolution) || 128,
    alphaCutoff: Math.min(0.45, (leaf?.alphaCutoff ?? 0.45) * 0.9),
    subsurface: leaf?.colorSubsurface ?? '#a8c43c',
  };
}

/**
 * Re-bakes the viewport impostor when the preview can show it and the tree or its textures
 * changed. Debounced: baking renders frames² views and runs on the main thread.
 */
export function scheduleImpostor() {
  clearTimeout(engine.impostorTimer);
  engine.impostorTimer = window.setTimeout(() => {
    const { doc, view } = useStore.getState();
    const s = impostorSettings(doc);
    if ((view.lod !== IMPOSTOR_LEVEL && view.lod !== 'auto') || !s.enabled || !engine.result?.bounds || !engine.viewer) {
      if (!s.enabled) engine.viewer?.setImpostor(null);
      return;
    }
    const key = `${JSON.stringify(generationDoc(doc))}|${engine.textureVersion}`;
    if (key === engine.impostorKey) return;
    engine.impostorKey = key;
    const bake = bakeImpostor(engine.viewer.renderer, engine.result, engine.textures, s);
    engine.viewer.setImpostor(bake, s);
    useStore.getState().setLodStats(IMPOSTOR_LEVEL, { triangles: 2, vertices: 4, drawCalls: 1, leaves: 0, ms: bake.ms });
  }, 200);
}

/** The part of the document that affects geometry (positions and names are cosmetic). */
export function generationDoc(doc) {
  return {
    nodes: doc.nodes.map(({ id, type, parent, enabled, params, name }) => ({ id, type, parent, enabled, params, name })),
    materials: doc.materials.map(({ id, kind, params }) => ({ id, kind, params })),
  };
}

export function bakeAll(materials) {
  const t0 = performance.now();
  let changed = false;
  for (const m of materials) {
    const prev = engine.textures.get(m.id);
    const entry = getMaterialTextures(m);
    if (!prev || prev.version !== entry.version) changed = true;
    engine.textures.set(m.id, { ...entry, params: withDefaults(m.params, materialDefaults(m.kind)), kind: m.kind });
  }
  const live = new Set(materials.map((m) => m.id));
  for (const id of [...engine.textures.keys()]) if (!live.has(id)) engine.textures.delete(id);
  pruneTextureCache(live);
  return { changed, ms: Math.round(performance.now() - t0) };
}

export function useEngineSync() {
  const doc = useStore((s) => s.doc);
  const view = useStore((s) => s.view);
  const lastGenKey = useRef('');
  const lastPreset = useRef(doc.name);

  // generator lifecycle
  useEffect(() => {
    const gen = createGenerator(
      (result) => {
        engine.result = result;
        const reframe = engine.pendingReframe;
        engine.pendingReframe = false;
        engine.viewer?.setResult(result, { reframe });
        useStore.getState().setResult(result);
        scheduleImpostor();
      },
      (err) => {
        console.error(err);
        useStore.getState().setResult({ ...(engine.result || {}), warnings: [String(err).split('\n')[0]] });
      },
    );
    engine.generator = gen;
    for (let l = 1; l < LOD_COUNT; l++) {
      engine.lodGenerators[l] = createGenerator(
        (result) => {
          engine.viewer?.setLodResult(l, result);
          useStore.getState().setLodStats(l, result.stats);
        },
        (err) => console.error(err),
      );
    }
    return () => {
      gen.dispose();
      engine.lodGenerators.forEach((g) => g?.dispose());
    };
  }, []);

  // regenerate when geometry-relevant data changes
  useEffect(() => {
    const gdoc = generationDoc(doc);
    const key = JSON.stringify(gdoc);
    if (key === lastGenKey.current) return;
    lastGenKey.current = key;
    if (doc.name !== lastPreset.current) {
      engine.pendingReframe = true;
      lastPreset.current = doc.name;
    }
    useStore.getState().setGenerating(true);
    engine.generator?.request(gdoc);
    engine.lodKey = '';
    engine.impostorKey = '';
    engine.viewer?.clearLods();
  }, [doc]);

  // lower LODs: generated only while the preview needs them, and again after every edit
  useEffect(() => {
    if (view.lod === 0 || engine.lodKey === lastGenKey.current) return;
    engine.lodKey = lastGenKey.current;
    const gdoc = generationDoc(useStore.getState().doc);
    for (let l = 1; l < LOD_COUNT; l++) engine.lodGenerators[l]?.request(lodDocument(gdoc, l));
  }, [doc, view.lod]);

  useEffect(() => scheduleImpostor(), [view.lod]);

  // bake textures (debounced; baking is synchronous GPU work)
  const matKey = JSON.stringify(doc.materials.map((m) => [m.id, m.kind, m.params]));
  useEffect(() => {
    const t = setTimeout(() => {
      const { changed, ms } = bakeAll(useStore.getState().doc.materials);
      if (changed) {
        engine.viewer?.setTextures(engine.textures);
        engine.notify();
        scheduleImpostor();
        useStore.getState().setBakeMs(ms);
      }
    }, engine.textures.size ? 140 : 0);
    return () => clearTimeout(t);
  }, [matKey]);

  useEffect(() => {
    engine.viewer?.setView(view);
  }, [view]);
}
