import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ChevronDown, Copy, Trash2, Eye, EyeOff, Spline, PencilLine } from 'lucide-react';
import { useStore } from '../state/store.js';
import { engine } from '../state/engine.js';
import { NODE_TYPES, MATERIAL_TYPES, allParams, isVisible, nodeDefaults, materialDefaults } from '../tree/schema.js';
import { evalCurve } from '../core/curve.js';
import { previewUrl } from '../materials/textures.js';
import { NumberField, Toggle, SelectField } from './controls/NumberField.jsx';
import { CurveEditor } from './controls/CurveEditor.jsx';
import { ColorField } from './controls/ColorField.jsx';
import { NodeIcon } from './icons.jsx';

export function Inspector() {
  const selection = useStore((s) => s.selection);
  const doc = useStore((s) => s.doc);
  if (selection?.type === 'material') {
    const m = doc.materials.find((x) => x.id === selection.id);
    if (m) return <MaterialInspector material={m} />;
  }
  const node = doc.nodes.find((n) => n.id === selection?.id) ?? doc.nodes.find((n) => n.type === 'tree');
  if (!node) return <div className="inspector-empty">Nothing selected</div>;
  return <NodeInspector node={node} />;
}

// ---------------------------------------------------------------------------

function NodeInspector({ node }) {
  const def = NODE_TYPES[node.type];
  const { setNodeParam, setNodeProps, deleteNodes, duplicateNode } = useStore.getState();
  const defaults = useMemo(() => nodeDefaults(node.type), [node.type]);
  const parent = useStore((s) => s.doc.nodes.find((n) => n.id === node.parent));

  return (
    <div className="inspector">
      <div className="insp-head">
        <div className="insp-icon" style={{ '--c': def.color }}>
          <NodeIcon type={node.type} size={16} />
        </div>
        <div className="insp-title">
          <input className="insp-name" value={node.name} onChange={(e) => setNodeProps(node.id, { name: e.target.value }, `name:${node.id}`)} />
          <div className="insp-sub">
            {def.label}
            {parent ? <> · child of <b>{parent.name}</b></> : node.type !== 'tree' ? <span className="warn"> · not connected</span> : null}
          </div>
        </div>
        {!def.singleton && (
          <div className="insp-actions">
            <button className="icon-btn" title={node.enabled ? 'Disable' : 'Enable'} onClick={() => setNodeProps(node.id, { enabled: !node.enabled })}>
              {node.enabled ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
            <button className="icon-btn" title="Duplicate with children (Ctrl+D)" onClick={() => duplicateNode(node.id)}>
              <Copy size={15} />
            </button>
            <button className="icon-btn danger" title="Delete (Del)" onClick={() => deleteNodes([node.id])}>
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>
      <p className="insp-desc">{def.description}</p>
      <ParamGroups
        scope={`node:${node.type}`}
        groups={def.groups}
        params={node.params}
        defaults={defaults}
        onChange={(k, v) => setNodeParam(node.id, k, v)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function useTextures() {
  return useSyncExternalStore(
    (cb) => {
      engine.listeners.add(cb);
      return () => engine.listeners.delete(cb);
    },
    () => engine.textureVersion,
  );
}

const MAP_TABS = {
  bark: [['albedo', 'Albedo'], ['normal', 'Normal'], ['orm', 'ORM']],
  leaf: [['albedo', 'Albedo'], ['normal', 'Normal'], ['orm', 'ORM'], ['translucency', 'Transl.']],
};

function MaterialInspector({ material }) {
  const def = MATERIAL_TYPES[material.kind];
  const { setMaterialParam, renameMaterial, duplicateMaterial, deleteMaterial } = useStore.getState();
  const defaults = useMemo(() => materialDefaults(material.kind), [material.kind]);
  const nodes = useStore((s) => s.doc.nodes);
  const users = useMemo(() => nodes.filter((n) => Object.values(n.params).includes(material.id)), [nodes, material.id]);
  const version = useTextures();
  const [tab, setTab] = useState('albedo');
  const tex = engine.textures.get(material.id);
  const url = useMemo(() => (tex ? previewUrl(tex.raw, tab, 384) : null), [tex?.version, tab, version]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!MAP_TABS[material.kind].some(([k]) => k === tab)) setTab('albedo');
  }, [material.kind, tab]);

  return (
    <div className="inspector">
      <div className="insp-head">
        <div className="insp-icon" style={{ '--c': material.kind === 'bark' ? '#b45309' : '#16a34a' }}>
          <NodeIcon type={material.kind === 'bark' ? 'bark' : 'leaf'} size={16} />
        </div>
        <div className="insp-title">
          <input className="insp-name" value={material.name} onChange={(e) => renameMaterial(material.id, e.target.value)} />
          <div className="insp-sub">
            {def.label} material · used by {users.length} node{users.length === 1 ? '' : 's'}
          </div>
        </div>
        <div className="insp-actions">
          <button className="icon-btn" title="Duplicate" onClick={() => duplicateMaterial(material.id)}>
            <Copy size={15} />
          </button>
          <button className="icon-btn danger" title="Delete" onClick={() => deleteMaterial(material.id)}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="tex-preview">
        <div className={`tex-img ${tab === 'albedo' ? 'checker' : ''}`}>
          {url ? <img src={url} alt="" draggable={false} /> : <div className="tex-wait">Baking…</div>}
        </div>
        <div className="tex-tabs">
          {MAP_TABS[material.kind].map(([k, l]) => (
            <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>
          ))}
          {tex && <span className="tex-meta">{tex.raw.size}px · {tex.ms} ms</span>}
        </div>
      </div>

      <ParamGroups
        scope={`mat:${material.kind}`}
        groups={def.groups}
        params={material.params}
        defaults={defaults}
        onChange={(k, v) => setMaterialParam(material.id, k, v)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

const collapsedStore = (() => {
  try {
    return JSON.parse(localStorage.getItem('botanica.collapsed') || '{}');
  } catch {
    return {};
  }
})();

function ParamGroups({ scope, groups, params, defaults, onChange }) {
  const curves = useMemo(() => {
    const map = {};
    for (const p of allParams(groups)) if (p.kind === 'curve') map[p.curveFor] = p;
    return map;
  }, [groups]);

  return (
    <div className="groups">
      {groups.filter((g) => isVisible(g.showIf, params)).map((g) => (
        <Group key={g.name} id={`${scope}:${g.name}`} title={g.name}>
          {g.params
            .filter((p) => p.kind !== 'curve' && isVisible(p.showIf, params))
            .map((p) => (
              <React.Fragment key={p.key}>
                <Param p={p} value={params[p.key]} reset={() => onChange(p.key, defaults[p.key])} onChange={(v) => onChange(p.key, v)} />
                {curves[p.key] && (
                  <CurveParam
                    p={curves[p.key]}
                    value={params[curves[p.key].key]}
                    onChange={(v) => onChange(curves[p.key].key, v)}
                  />
                )}
              </React.Fragment>
            ))}
        </Group>
      ))}
    </div>
  );
}

function Group({ id, title, children }) {
  const [open, setOpen] = useState(!collapsedStore[id]);
  const toggle = () => {
    collapsedStore[id] = open;
    try {
      localStorage.setItem('botanica.collapsed', JSON.stringify(collapsedStore));
    } catch {
      /* ignore */
    }
    setOpen(!open);
  };
  return (
    <section className={`group ${open ? 'open' : ''}`}>
      <button className="group-head" onClick={toggle}>
        <ChevronDown size={14} className="chev" />
        {title}
      </button>
      {open && <div className="group-body">{children}</div>}
    </section>
  );
}

function Param({ p, value, onChange, reset }) {
  switch (p.kind) {
    case 'float':
    case 'int':
    case 'angle':
      return (
        <NumberField
          label={p.label}
          value={value ?? p.default}
          min={p.min}
          max={p.max}
          step={p.step}
          hint={p.hint}
          suffix={p.kind === 'angle' ? '°' : undefined}
          onChange={onChange}
          onReset={reset}
        />
      );
    case 'bool':
      return <Toggle label={p.label} value={!!value} onChange={onChange} hint={p.hint} />;
    case 'enum':
      return <SelectField label={p.label} value={value} options={p.options} onChange={onChange} hint={p.hint} />;
    case 'color':
      return <ColorField label={p.label} value={value} onChange={onChange} onReset={reset} />;
    case 'material':
      return <MaterialParam p={p} value={value} onChange={onChange} />;
    default:
      return null;
  }
}

function MaterialParam({ p, value, onChange }) {
  const all = useStore((s) => s.doc.materials);
  const materials = useMemo(() => all.filter((m) => m.kind === p.materialKind), [all, p.materialKind]);
  const { select, setLeftTab, addMaterial } = useStore.getState();
  return (
    <div className="field">
      <label className="field-label" title={p.hint}>{p.label}</label>
      <div className="mat-pick">
        <select className="select" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{p.hint?.startsWith('Empty') ? 'Inherit from parent' : 'Default (first)'}</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <button
          className="icon-btn"
          title={value ? 'Edit material' : 'New material'}
          onClick={() => {
            if (value) {
              select({ type: 'material', id: value });
              setLeftTab('materials');
            } else addMaterial(p.materialKind);
          }}
        >
          <PencilLine size={14} />
        </button>
      </div>
    </div>
  );
}

function CurveParam({ p, value, onChange }) {
  const [open, setOpen] = useState(false);
  const pts = value ?? p.default;
  const spark = useMemo(() => {
    const vals = Array.from({ length: 24 }, (_, i) => evalCurve(pts, i / 23));
    const max = Math.max(1, ...vals);
    return vals.map((v, i) => `${i ? 'L' : 'M'}${(i / 23) * 38 + 1},${13 - (Math.max(0, v) / max) * 11}`).join('');
  }, [pts]);
  const isFlat = pts.every((q) => Math.abs(q[1] - pts[0][1]) < 1e-3);
  return (
    <div className={`curve-param ${open ? 'open' : ''}`}>
      <button className={`curve-toggle ${isFlat ? '' : 'active'}`} onClick={() => setOpen(!open)} title={p.label}>
        <Spline size={12} />
        <span>{p.label}</span>
        <svg width="40" height="14" className="spark"><path d={spark} /></svg>
      </button>
      {open && <CurveEditor points={pts} onChange={onChange} axis={p.axis} />}
    </div>
  );
}
