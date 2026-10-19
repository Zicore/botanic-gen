import 'react';

declare module 'react' {
  interface CSSProperties {
    [property: `--${string}`]: string | number;
  }
}

declare global {
  interface Window {
    __botanica?: {
      engine: typeof import('./state/engine.js').engine;
      viewer: import('./viewer/Viewer.js').Viewer;
      store: typeof import('./state/store.js').useStore;
    };
  }
}
