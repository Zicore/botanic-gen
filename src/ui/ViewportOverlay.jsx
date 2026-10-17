import React, { useEffect, useRef, useState } from 'react';
import { Sun, Wind, Bone, Maximize, Camera, RotateCw, Mountain } from 'lucide-react';
import { useStore } from '../state/store.js';
import { engine } from '../state/engine.js';
import { NumberField } from './controls/NumberField.jsx';

const LODS = [
  [0, 'LOD0'],
  [1, 'LOD1'],
  [2, 'LOD2'],
  ['auto', 'Auto'],
];

const MODES = [
  ['lit', 'Lit'],
  ['albedo', 'Albedo'],
  ['ao', 'AO'],
  ['wind', 'Wind'],
  ['wireframe', 'Wire'],
];

export function ViewportOverlay() {
  const view = useStore((s) => s.view);
  const result = useStore((s) => s.result);
  const generating = useStore((s) => s.generating);
  const bakeMs = useStore((s) => s.bakeMs);
  const lodStats = useStore((s) => s.lodStats);
  const activeLod = useStore((s) => s.activeLod);
  const lodDistance = useStore((s) => s.lodDistance);
  const { setView } = useStore.getState();
  const [envOpen, setEnvOpen] = useState(false);
  const envRef = useRef(null);
  useEffect(() => {
    if (!envOpen) return;
    const close = (e) => envRef.current && !envRef.current.contains(e.target) && setEnvOpen(false);
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [envOpen]);

  const s = activeLod > 0 ? lodStats[activeLod] ?? result?.stats : result?.stats;
  const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n));

  return (
    <>
      <div className="vp-top-left">
        <div className="segmented small">
          {MODES.map(([k, l]) => (
            <button key={k} className={view.mode === k ? 'active' : ''} onClick={() => setView({ mode: k })}>{l}</button>
          ))}
        </div>
        <div className="segmented small" title="Preview the exported LODs. Auto switches by camera distance with the Godot visibility ranges.">
          {LODS.map(([k, l]) => (
            <button key={k} className={view.lod === k ? 'active' : ''} onClick={() => setView({ lod: k })}>
              {view.lod === 'auto' && k === activeLod ? <u>{l}</u> : l}
            </button>
          ))}
        </div>
      </div>

      <div className="vp-top-right">
        <div className="env" ref={envRef}>
          <button className={`icon-btn glass ${envOpen ? 'active' : ''}`} title="Sun & wind" onClick={() => setEnvOpen(!envOpen)}>
            <Sun size={16} />
          </button>
          {envOpen && (
            <div className="env-pop">
              <div className="env-title"><Sun size={13} /> Sun</div>
              <NumberField label="Azimuth" value={view.sunAzimuth} min={0} max={360} step={1} suffix="°" onChange={(v) => setView({ sunAzimuth: v })} />
              <NumberField label="Elevation" value={view.sunElevation} min={2} max={88} step={1} suffix="°" onChange={(v) => setView({ sunElevation: v })} />
              <div className="env-title"><Wind size={13} /> Wind preview</div>
              <NumberField label="Strength" value={view.wind} min={0} max={2} step={0.01} onChange={(v) => setView({ wind: v })} />
              <NumberField label="Direction" value={view.windDir} min={0} max={360} step={1} suffix="°" onChange={(v) => setView({ windDir: v })} />
            </div>
          )}
        </div>
        <button className={`icon-btn glass ${view.wind > 0 ? 'active' : ''}`} title="Toggle wind" onClick={() => setView({ wind: view.wind > 0 ? 0 : 0.35 })}>
          <Wind size={16} />
        </button>
        <button className={`icon-btn glass ${view.skeleton ? 'active' : ''}`} title="Skeleton overlay" onClick={() => setView({ skeleton: !view.skeleton })}>
          <Bone size={16} />
        </button>
        <button className={`icon-btn glass ${view.ground ? 'active' : ''}`} title="Ground" onClick={() => setView({ ground: !view.ground })}>
          <Mountain size={16} />
        </button>
        <button className={`icon-btn glass ${view.autoRotate ? 'active' : ''}`} title="Turntable" onClick={() => setView({ autoRotate: !view.autoRotate })}>
          <RotateCw size={16} />
        </button>
        <button className="icon-btn glass" title="Frame tree (F)" onClick={() => engine.viewer?.frame()}>
          <Maximize size={16} />
        </button>
        <button
          className="icon-btn glass"
          title="Save screenshot"
          onClick={() => {
            const url = engine.viewer?.snapshot(1600);
            if (!url) return;
            const a = document.createElement('a');
            a.href = url;
            a.download = `${useStore.getState().doc.name || 'tree'}.png`;
            a.click();
          }}
        >
          <Camera size={16} />
        </button>
      </div>

      <div className="vp-stats">
        <span className={`dot ${generating ? 'busy' : ''}`} />
        {s ? (
          <>
            {view.lod !== 0 && (
              <span><b>LOD{activeLod}</b>{lodDistance != null ? ` · ${lodDistance.toFixed(0)} m` : ''}</span>
            )}
            <span><b>{fmt(s.triangles)}</b> tris</span>
            <span><b>{fmt(s.vertices)}</b> verts</span>
            <span><b>{s.drawCalls}</b> draws</span>
            <span><b>{fmt(s.leaves || 0)}</b> leaves</span>
            <span className="dim">gen {s.ms} ms{bakeMs ? ` · bake ${bakeMs} ms` : ''}</span>
          </>
        ) : (
          <span className="dim">Generating…</span>
        )}
      </div>
      {result?.warnings?.length > 0 && (
        <div className="vp-warn">{result.warnings.map((w, i) => <div key={i}>{w}</div>)}</div>
      )}
    </>
  );
}
