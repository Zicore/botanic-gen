// Bridges the document store to the worker generator, the texture baker and the viewer.

import { useEffect, useRef } from 'react';
import { useStore } from './store.js';
import { createGenerator } from '../tree/generatorClient.js';
import { getMaterialTextures, pruneTextureCache } from '../materials/textures.js';
import { materialDefaults, withDefaults } from '../tree/schema.js';

export const engine = {
  viewer: null,
  generator: null,
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
    return () => gen.dispose();
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
  }, [doc]);

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
