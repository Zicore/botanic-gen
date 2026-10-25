import React, { useEffect, useRef, useState } from 'react';
import {
  Workflow,
  Palette,
  SlidersHorizontal,
  Box,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Maximize2,
  Minimize2,
  X,
} from 'lucide-react';
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

function useIsMobile(breakpoint = 960) {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = (e) => setMobile(e.matches);
    setMobile(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [breakpoint]);
  return mobile;
}

export default function App() {
  useEngineSync();
  useShortcuts();
  const isMobile = useIsMobile(960);
  const leftTab = useStore((s) => s.leftTab);
  const mobilePanel = useStore((s) => s.mobilePanel);
  const leftOpen = useStore((s) => s.leftOpen);
  const rightOpen = useStore((s) => s.rightOpen);
  const selection = useStore((s) => s.selection);
  const doc = useStore((s) => s.doc);
  const { setLeftTab, setMobilePanel, toggleLeft, toggleRight } = useStore.getState();

  const [leftW, leftHandle] = useResizable('botanica.leftW', 380, 260, 720, 'left');
  const [rightW, rightHandle] = useResizable('botanica.rightW', 330, 270, 560, 'right');

  // Mobile sheet height in vh (default 54% split view so 3D tree stays visible on top)
  const [sheetVh, setSheetVh] = useState(54);
  const sheetDrag = useRef(null);
  const onSheetDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    sheetDrag.current = { y: e.clientY, vh: sheetVh, moved: false };
  };
  const onSheetMove = (e) => {
    if (!sheetDrag.current) return;
    const dy = sheetDrag.current.y - e.clientY;
    if (Math.abs(dy) > 3) sheetDrag.current.moved = true;
    const dvh = (dy / Math.max(1, window.innerHeight)) * 100;
    const next = sheetDrag.current.vh + dvh;
    if (next < 20) {
      sheetDrag.current = null;
      setMobilePanel(null);
      return;
    }
    setSheetVh(Math.min(86, Math.max(28, Math.round(next))));
  };
  const onSheetUp = () => {
    sheetDrag.current = null;
  };

  const selectedLabel = (() => {
    if (selection?.type === 'material') {
      return doc.materials.find((m) => m.id === selection.id)?.name || 'Material';
    }
    const n = doc.nodes.find((x) => x.id === selection?.id) ?? doc.nodes.find((x) => x.type === 'tree');
    return n?.name || 'Inspector';
  })();

  if (isMobile) {
    const activeLeft = mobilePanel === 'graph' || mobilePanel === 'materials';
    const activeRight = mobilePanel === 'inspector';
    const toggleTab = (tab) => setMobilePanel(mobilePanel === tab ? null : tab);
    const expanded = sheetVh >= 76;

    return (
      <div className="app is-mobile">
        <TopBar />
        <div className={`main mobile-main ${mobilePanel ? 'has-sheet' : ''}`}>
          <section className="center">
            <Viewport />
            <ViewportOverlay />
          </section>

          {mobilePanel && (
            <aside className="mobile-sheet" style={{ '--sheet-vh': `${sheetVh}dvh` }}>
              <div
                className="sheet-bar"
                onPointerDown={onSheetDown}
                onPointerMove={onSheetMove}
                onPointerUp={onSheetUp}
              >
                <div className="sheet-grip" />
                <div className="sheet-title">
                  {mobilePanel === 'graph' && <><Workflow size={14} /> Generators</>}
                  {mobilePanel === 'materials' && <><Palette size={14} /> Materials</>}
                  {mobilePanel === 'inspector' && <><SlidersHorizontal size={14} /> Inspector · <b>{selectedLabel}</b></>}
                </div>
                <div className="sheet-actions" onPointerDown={(e) => e.stopPropagation()}>
                  <button
                    className="icon-btn"
                    title={expanded ? 'Split view (54%)' : 'Expand panel (84%)'}
                    onClick={() => setSheetVh(expanded ? 54 : 84)}
                  >
                    {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </button>
                  <button className="icon-btn" title="Close panel" onClick={() => setMobilePanel(null)}>
                    <X size={16} />
                  </button>
                </div>
              </div>
              <div className="sheet-body">
                {activeLeft && (mobilePanel === 'graph' ? <GraphPanel /> : <MaterialsPanel />)}
                {activeRight && <Inspector onCollapse={undefined} />}
              </div>
            </aside>
          )}
        </div>

        <nav className="mobile-nav" aria-label="Workspace panels">
          <button
            className={`mnav-btn ${mobilePanel === null ? 'active' : ''}`}
            onClick={() => setMobilePanel(null)}
          >
            <Box size={16} />
            <span>3D View</span>
          </button>
          <button
            className={`mnav-btn ${mobilePanel === 'graph' ? 'active' : ''}`}
            onClick={() => toggleTab('graph')}
          >
            <Workflow size={16} />
            <span>Generators</span>
          </button>
          <button
            className={`mnav-btn ${mobilePanel === 'materials' ? 'active' : ''}`}
            onClick={() => toggleTab('materials')}
          >
            <Palette size={16} />
            <span>Materials</span>
          </button>
          <button
            className={`mnav-btn ${mobilePanel === 'inspector' ? 'active' : ''}`}
            onClick={() => toggleTab('inspector')}
          >
            <SlidersHorizontal size={16} />
            <span className="mnav-sub">{selectedLabel}</span>
          </button>
        </nav>
      </div>
    );
  }

  const cols = `${leftOpen ? `${leftW}px 5px` : '0px 0px'} 1fr ${rightOpen ? `5px ${rightW}px` : '0px 0px'}`;

  return (
    <div className="app">
      <TopBar />
      <div className="main" style={{ gridTemplateColumns: cols }}>
        <aside className={`panel left ${leftOpen ? '' : 'collapsed'}`}>
          {leftOpen && (
            <>
              <div className="tabs">
                <button className={leftTab === 'graph' ? 'active' : ''} onClick={() => setLeftTab('graph')}>
                  <Workflow size={14} /> Generators
                </button>
                <button className={leftTab === 'materials' ? 'active' : ''} onClick={() => setLeftTab('materials')}>
                  <Palette size={14} /> Materials
                </button>
                <button className="icon-btn tab-collapse" title="Hide left panel" onClick={toggleLeft}>
                  <PanelLeftClose size={15} />
                </button>
              </div>
              <div className="panel-body">{leftTab === 'graph' ? <GraphPanel /> : <MaterialsPanel />}</div>
            </>
          )}
        </aside>
        <div className={`splitter ${leftOpen ? '' : 'hidden'}`} {...leftHandle} />
        <section className="center">
          <Viewport />
          <ViewportOverlay />
          {!leftOpen && (
            <button className="icon-btn glass edge-toggle left" title="Show left panel" onClick={toggleLeft}>
              <PanelLeftOpen size={16} />
            </button>
          )}
          {!rightOpen && (
            <button className="icon-btn glass edge-toggle right" title="Show inspector" onClick={toggleRight}>
              <PanelRightOpen size={16} />
            </button>
          )}
        </section>
        <div className={`splitter ${rightOpen ? '' : 'hidden'}`} {...rightHandle} />
        <aside className={`panel right ${rightOpen ? '' : 'collapsed'}`}>
          {rightOpen && <Inspector onCollapse={toggleRight} />}
        </aside>
      </div>
    </div>
  );
}
