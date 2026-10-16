import React, { useEffect, useRef, useState } from 'react';
import { Workflow, Palette } from 'lucide-react';
import { useStore } from '../state/store.js';
import { useEngineSync, engine } from '../state/engine.js';
import { TopBar } from './TopBar.jsx';
import { GraphPanel } from './GraphPanel.jsx';
import { MaterialsPanel } from './MaterialsPanel.jsx';
import { Inspector } from './Inspector.jsx';
import { Viewport } from './Viewport.jsx';
import { ViewportOverlay } from './ViewportOverlay.jsx';

function useShortcuts() {
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        e.shiftKey ? s.redo() : s.undo();
      } else if (mod && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        s.redo();
      } else if (mod && e.key.toLowerCase() === 'd' && !typing) {
        e.preventDefault();
        if (s.selection?.type === 'node') s.duplicateNode(s.selection.id);
      } else if (!mod && !typing && e.key.toLowerCase() === 'f') {
        engine.viewer?.frame();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function useResizable(key, initial, min, max, side) {
  const [w, setW] = useState(() => {
    const v = Number(localStorage.getItem(key));
    return v >= min && v <= max ? v : initial;
  });
  const start = useRef(null);
  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, w };
  };
  const onPointerMove = (e) => {
    if (!start.current) return;
    const dx = (e.clientX - start.current.x) * (side === 'left' ? 1 : -1);
    setW(Math.min(max, Math.max(min, start.current.w + dx)));
  };
  const onPointerUp = () => {
    start.current = null;
    localStorage.setItem(key, String(w));
  };
  return [w, { onPointerDown, onPointerMove, onPointerUp }];
}

export default function App() {
  useEngineSync();
  useShortcuts();
  const leftTab = useStore((s) => s.leftTab);
  const { setLeftTab } = useStore.getState();
  const [leftW, leftHandle] = useResizable('botanica.leftW', 380, 260, 720, 'left');
  const [rightW, rightHandle] = useResizable('botanica.rightW', 330, 270, 560, 'right');

  return (
    <div className="app">
      <TopBar />
      <div className="main" style={{ gridTemplateColumns: `${leftW}px 5px 1fr 5px ${rightW}px` }}>
        <aside className="panel left">
          <div className="tabs">
            <button className={leftTab === 'graph' ? 'active' : ''} onClick={() => setLeftTab('graph')}>
              <Workflow size={14} /> Generators
            </button>
            <button className={leftTab === 'materials' ? 'active' : ''} onClick={() => setLeftTab('materials')}>
              <Palette size={14} /> Materials
            </button>
          </div>
          <div className="panel-body">{leftTab === 'graph' ? <GraphPanel /> : <MaterialsPanel />}</div>
        </aside>
        <div className="splitter" {...leftHandle} />
        <section className="center">
          <Viewport />
          <ViewportOverlay />
        </section>
        <div className="splitter" {...rightHandle} />
        <aside className="panel right">
          <Inspector />
        </aside>
      </div>
    </div>
  );
}
