// Bridges the document store to the worker generator, the texture baker and the viewer.

import { useEffect, useRef } from 'react';
import { useStore } from './store.js';
import { createGenerator } from '../tree/generatorClient.js';
import { getMaterialTextures, pruneTextureCache } from '../materials/textures.js';
import { materialDefaults, withDefaults } from '../tree/schema.js';
import { lodDocument, LOD_COUNT } from '../export/lod.js';

export const engine = {
  viewer: null,
  generator: null,
  lodGenerators: [], // by level (1..), only fed while the viewport previews LODs
  lodKey: '', // generation key the current LOD previews belong to
  textures: new Map(), // materialId -> { maps, raw, layout, version, params, kind }
  result: null,
  textureVersion: 0,
  listeners: new Set(),
  notify() {
    this.textureVersion++;
    for (const l of this.listeners) l();
  },
};

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
    engine.viewer?.clearLods();
  }, [doc]);

  // lower LODs: generated only while the preview needs them, and again after every edit
  useEffect(() => {
    if (view.lod === 0 || engine.lodKey === lastGenKey.current) return;
    engine.lodKey = lastGenKey.current;
    const gdoc = generationDoc(useStore.getState().doc);
    for (let l = 1; l < LOD_COUNT; l++) engine.lodGenerators[l]?.request(lodDocument(gdoc, l));
  }, [doc, view.lod]);

  // bake textures (debounced; baking is synchronous GPU work)
  const matKey = JSON.stringify(doc.materials.map((m) => [m.id, m.kind, m.params]));
  useEffect(() => {
    const t = setTimeout(() => {
      const { changed, ms } = bakeAll(useStore.getState().doc.materials);
      if (changed) {
        engine.viewer?.setTextures(engine.textures);
        engine.notify();
        useStore.getState().setBakeMs(ms);
      }
    }, engine.textures.size ? 140 : 0);
    return () => clearTimeout(t);
  }, [matKey]);

  useEffect(() => {
    engine.viewer?.setView(view);
  }, [view]);
}
