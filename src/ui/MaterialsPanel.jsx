import React, { useMemo, useSyncExternalStore } from 'react';
import { Plus } from 'lucide-react';
import { useStore } from '../state/store.js';
import { engine } from '../state/engine.js';
import { previewUrl } from '../materials/textures.js';

const thumbCache = new Map();

function thumb(id) {
  const t = engine.textures.get(id);
  if (!t) return null;
  const key = `${id}:${t.version}`;
  if (!thumbCache.has(key)) thumbCache.set(key, previewUrl(t.raw, 'albedo', 96));
  return thumbCache.get(key);
}

export function MaterialsPanel() {
  const materials = useStore((s) => s.doc.materials);
  const nodes = useStore((s) => s.doc.nodes);
  const selection = useStore((s) => s.selection);
  const { select, addMaterial } = useStore.getState();
  useSyncExternalStore(
    (cb) => {
      engine.listeners.add(cb);
      return () => engine.listeners.delete(cb);
    },
    () => engine.textureVersion,
  );

  const usage = useMemo(() => {
    const u = new Map();
    for (const n of nodes) for (const v of Object.values(n.params)) if (typeof v === 'string') u.set(v, (u.get(v) || 0) + 1);
    return u;
  }, [nodes]);

  const section = (kind, title) => (
    <div className="mat-section">
      <div className="mat-section-head">
        <span>{title}</span>
        <button className="tb-btn" onClick={() => addMaterial(kind)}>
          <Plus size={13} /> New
        </button>
      </div>
      <div className="mat-list">
        {materials.filter((m) => m.kind === kind).map((m) => (
          <button
            key={m.id}
            className={`mat-item ${selection?.type === 'material' && selection.id === m.id ? 'sel' : ''}`}
            onClick={() => select({ type: 'material', id: m.id })}
          >
            <div className={`mat-thumb ${kind === 'leaf' ? 'checker' : ''}`}>{thumb(m.id) && <img src={thumb(m.id)} alt="" />}</div>
            <div className="mat-info">
              <div className="mat-name">{m.name}</div>
              <div className="mat-meta">
                {kind === 'bark' ? m.params.style : m.params.kind} · {m.params.resolution}px · {usage.get(m.id) || 0} use{usage.get(m.id) === 1 ? '' : 's'}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="materials">
      {section('bark', 'Bark')}
      {section('leaf', 'Foliage')}
    </div>
  );
}
