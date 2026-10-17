import React, { useEffect, useRef } from 'react';
import { Viewer } from '../viewer/Viewer.js';
import { engine } from '../state/engine.js';
import { useStore } from '../state/store.js';

export function Viewport() {
  const ref = useRef(null);
  useEffect(() => {
    const viewer = new Viewer(ref.current);
    engine.viewer = viewer;
    viewer.setView(useStore.getState().view);
    viewer.onLod = (level, dist) => useStore.getState().setActiveLod(level, dist);
    if (engine.textures.size) viewer.setTextures(engine.textures);
    if (engine.result) viewer.setResult(engine.result, { reframe: true });
    window.__botanica = { engine, viewer, store: useStore };
    return () => {
      viewer.dispose();
      engine.viewer = null;
    };
  }, []);
  return <div className="viewport" ref={ref} />;
}
