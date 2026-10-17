import React, { useEffect, useRef, useState } from 'react';
import { Undo2, Redo2, Dices, Download, ChevronDown, FolderOpen, Save, Package, Box, Image as ImageIcon, Sprout } from 'lucide-react';
import { useStore, treeSeed } from '../state/store.js';
import { PRESETS } from '../tree/presets.js';
import { exportGLB, exportGodotPackage, exportTexturesZip, saveProject, loadProjectFile } from '../export/exporters.js';

function Dropdown({ label, icon, children, align = 'left', className = '' }) {
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
        {label}
        <ChevronDown size={13} className="dim" />
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
        <div>
          <div className="brand-name">Botanica</div>
          <div className="brand-sub">Procedural foliage studio</div>
        </div>
      </div>

      <div className="tb-group">
        <Dropdown label="Species" icon={null}>
          <div className="dd-title">Load preset (undoable)</div>
          {Object.entries(PRESETS).filter(([, p]) => !p.group).map(([k, p]) => (
            <button key={k} className="dd-item" onClick={() => loadPreset(k)}>{p.label}</button>
          ))}
          <div className="dd-title">City builder · low-poly</div>
          {Object.entries(PRESETS).filter(([, p]) => p.group === 'city').map(([k, p]) => (
            <button key={k} className="dd-item" onClick={() => loadPreset(k)}>{p.label}</button>
          ))}
        </Dropdown>
        <input className="doc-name" value={doc.name} onChange={(e) => renameDocument(e.target.value)} spellCheck={false} />
      </div>

      <div className="tb-group">
        <div className="seed">
          <span className="dim">Seed</span>
          <input
            type="number"
            value={seed}
            onChange={(e) => setNodeParam(treeId, 'seed', Math.max(0, parseInt(e.target.value || '0', 10)))}
          />
          <button className="icon-btn" title="Random seed" onClick={() => setNodeParam(treeId, 'seed', Math.floor(Math.random() * 999999))}>
            <Dices size={15} />
          </button>
        </div>
        <button className="icon-btn" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}><Undo2 size={16} /></button>
        <button className="icon-btn" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}><Redo2 size={16} /></button>
      </div>

      <div className="tb-spacer" />

      <div className="tb-group">
        <Dropdown label="Project" icon={<FolderOpen size={14} />} align="right">
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
        <Dropdown label={busy ? `${busy}…` : 'Export'} icon={<Download size={14} />} align="right" className="primary">
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
