import React, { useEffect, useRef, useState } from 'react';
import { Undo2, Redo2, Dices, Download, ChevronDown, FolderOpen, Save, Package, Box, Image as ImageIcon, Sprout, Trees } from 'lucide-react';
import { useStore, treeSeed } from '../state/store.js';
import { PRESETS } from '../tree/presets.js';
import { exportGLB, exportGodotPackage, exportTexturesZip, saveProject, loadProjectFile } from '../export/exporters.js';

function Dropdown({ label, mobileLabel = undefined, icon, children, align = 'left', className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [open]);
  return (
    <div className={`dropdown ${className}`} ref={ref}>
      <button className="tb-btn" onClick={() => setOpen(!open)}>
        {icon}
        <span className="tb-label">{label}</span>
        {mobileLabel && <span className="tb-label-mobile">{mobileLabel}</span>}
        <ChevronDown size={13} className="dim tb-chev" />
      </button>
      {open && (
        <div className={`dd-menu ${align}`} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const doc = useStore((s) => s.doc);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const { undo, redo, loadPreset, renameDocument, setNodeParam } = useStore.getState();
  const [busy, setBusy] = useState(null);
  const fileRef = useRef(null);
  const seed = treeSeed(doc);
  const treeId = doc.nodes.find((n) => n.type === 'tree')?.id;

  const run = async (label, fn) => {
    setBusy(label);
    try {
      await fn();
    } catch (err) {
      console.error(err);
      alert(`Export failed: ${err.message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark"><Sprout size={16} /></div>
        <div className="brand-text">
          <div className="brand-name">Botanica</div>
          <div className="brand-sub">Procedural foliage studio</div>
        </div>
      </div>

      <div className="tb-group">
        <Dropdown label="Species" mobileLabel={doc.name || 'Species'} icon={<Trees size={14} />}>
          <div className="dd-title">Load preset (undoable)</div>
          <div className="dd-grid">
            {Object.entries(PRESETS).filter(([, p]) => !p.group).map(([k, p]) => (
              <button key={k} className="dd-item" onClick={() => loadPreset(k)}>{p.label}</button>
            ))}
          </div>
          <div className="dd-title">City builder · low-poly</div>
          <div className="dd-grid">
            {Object.entries(PRESETS).filter(([, p]) => p.group === 'city').map(([k, p]) => (
              <button key={k} className="dd-item" onClick={() => loadPreset(k)}>{p.label}</button>
            ))}
          </div>
        </Dropdown>
        <input className="doc-name" value={doc.name} onChange={(e) => renameDocument(e.target.value)} spellCheck={false} />
      </div>

      <div className="tb-group">
        <div className="seed">
          <span className="dim seed-label">Seed</span>
          <input
            className="seed-input"
            type="number"
            value={seed}
            onChange={(e) => setNodeParam(treeId, 'seed', Math.max(0, parseInt(e.target.value || '0', 10)))}
          />
          <button
            className="icon-btn seed-dice"
            title={`Randomize seed (current: ${seed})`}
            onClick={() => setNodeParam(treeId, 'seed', Math.floor(Math.random() * 999999))}
          >
            <Dices size={15} />
          </button>
        </div>
        <button className="icon-btn" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}><Undo2 size={16} /></button>
        <button className="icon-btn" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}><Redo2 size={16} /></button>
      </div>

      <div className="tb-spacer" />

      <div className="tb-group">
        <Dropdown label="Project" icon={<FolderOpen size={14} />} align="right">
          <div className="dd-title">Tree name & seed</div>
          <div className="dd-input-wrap" onClick={(e) => e.stopPropagation()}>
            <input
              className="dd-doc-name"
              value={doc.name}
              placeholder="Tree name"
              onChange={(e) => renameDocument(e.target.value)}
              spellCheck={false}
            />
            <div className="dd-seed-row">
              <span className="dim">Seed</span>
              <input
                className="dd-seed-input"
                type="number"
                value={seed}
                onChange={(e) => setNodeParam(treeId, 'seed', Math.max(0, parseInt(e.target.value || '0', 10)))}
              />
              <button
                className="tb-btn"
                onClick={() => setNodeParam(treeId, 'seed', Math.floor(Math.random() * 999999))}
              >
                <Dices size={13} /> Random
              </button>
            </div>
          </div>
          <div className="dd-title">Project file</div>
          <button className="dd-item" onClick={() => saveProject(doc)}><Save size={14} /> Save project (.json)</button>
          <button className="dd-item" onClick={() => fileRef.current?.click()}><FolderOpen size={14} /> Open project…</button>
        </Dropdown>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) useStore.getState().loadDocument(await loadProjectFile(f));
          }}
        />
        <Dropdown label={busy ? `${busy}…` : 'Export'} mobileLabel={busy ? '…' : 'Export'} icon={<Download size={14} />} align="right" className="primary">
          <div className="dd-title">Game engine</div>
          <button className="dd-item" onClick={() => run('Godot', () => exportGodotPackage(doc))}>
            <Package size={14} />
            <div><div>Godot 4 package (.zip)</div><div className="dd-note">GLB · LODs · wind shaders · materials · scene</div></div>
          </button>
          <button className="dd-item" onClick={() => run('GLB', () => exportGLB(doc))}>
            <Box size={14} />
            <div><div>glTF binary (.glb)</div><div className="dd-note">PBR materials embedded, AO in vertex color</div></div>
          </button>
          <button className="dd-item" onClick={() => run('Textures', () => exportTexturesZip(doc))}>
            <ImageIcon size={14} />
            <div><div>Texture maps (.zip)</div><div className="dd-note">Albedo · Normal · ORM · Translucency</div></div>
          </button>
        </Dropdown>
      </div>
    </header>
  );
}
