import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Position,
  applyNodeChanges,
  useReactFlow,
} from '@xyflow/react';
import * as FlowComponents from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, LayoutGrid, Maximize, Eye, EyeOff, MoreHorizontal, SlidersHorizontal, Copy, Trash2 } from 'lucide-react';
import { useStore } from '../state/store.js';
import { NODE_TYPES } from '../tree/schema.js';
import { canParent, isDescendant } from '../tree/document.js';
import { NodeIcon } from './icons.jsx';

// Namespace access avoids the package's Handle value/type re-export collision.
const { Handle } = FlowComponents;

const CHILD_TYPES = Object.keys(NODE_TYPES).filter((t) => !NODE_TYPES[t].singleton);
const canHaveChildren = (type) => CHILD_TYPES.some((t) => NODE_TYPES[t].accepts.includes(type));
const fmt = (v, d = 1) => Number(v).toFixed(d).replace(/\.0+$/, '');

function summary(node, materials) {
  const p = node.params;
  const mat = (id) => materials.find((m) => m.id === id)?.name;
  switch (node.type) {
    case 'tree': return `seed ${p.seed} · ×${fmt(p.scale, 2)}`;
    case 'trunk': return `${p.count > 1 ? `${p.count} stems · ` : ''}${fmt(p.length)} m · r ${fmt(p.radius, 2)}`;
    case 'branches': return `${fmt(p.count, 0)}× · ${fmt(p.length, 2)}×L · ${fmt(p.angle, 0)}°`;
    case 'leaves': return `${fmt(p.count, 0)}× · ${fmt(p.size, 2)} m${mat(p.material) ? ` · ${mat(p.material)}` : ''}`;
    case 'fronds': return `${fmt(p.count, 0)}× · ${fmt(p.length)} m`;
    case 'grass': return `${p.count} blades · ${fmt(p.height, 2)} m`;
    default: return '';
  }
}

/** @typedef {import('@xyflow/react').Node<{ node: ReturnType<typeof import('../tree/document.js').makeNode>, text: string }>} GeneratorFlowNode */

const GenNode = memo(/** @param {import('@xyflow/react').NodeProps<GeneratorFlowNode>} props */ function GenNode({ data, selected }) {
  const { node, text } = data;
  const def = NODE_TYPES[node.type];
  return (
    <div
      className={`gnode ${selected ? 'sel' : ''} ${node.enabled ? '' : 'off'}`}
      style={{ '--c': def.color }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        useStore.getState().select({ type: 'node', id: node.id });
        useStore.getState().setMobilePanel('inspector');
      }}
    >
      {def.accepts.length > 0 && <Handle type="target" position={Position.Top} className="ghandle" />}
      <div className="gnode-head">
        <span className="gnode-icon"><NodeIcon type={node.type} size={13} /></span>
        <span className="gnode-name">{node.name}</span>
        {!def.singleton && (
          <button
            className="gnode-eye nodrag"
            title={node.enabled ? 'Disable' : 'Enable'}
            onClick={(e) => {
              e.stopPropagation();
              useStore.getState().setNodeProps(node.id, { enabled: !node.enabled });
            }}
          >
            {node.enabled ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
        )}
      </div>
      <div className="gnode-sub">{text}</div>
      {canHaveChildren(node.type) && <Handle type="source" position={Position.Bottom} className="ghandle" />}
    </div>
  );
});

const nodeTypes = { gen: GenNode };

function Menu({ menu, onClose, boundsRef }) {
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && onClose();
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  const b = boundsRef?.current?.getBoundingClientRect();
  const maxX = b ? Math.max(8, b.width - 204) : menu.x;
  const maxY = b ? Math.max(8, b.height - 230) : menu.y;
  const x = Math.max(8, Math.min(menu.x, maxX));
  const y = Math.max(8, Math.min(menu.y, maxY));

  return (
    <div ref={ref} className="ctx-menu" style={{ left: x, top: y }}>
      {menu.title && <div className="ctx-title">{menu.title}</div>}
      {menu.items.map((it, i) =>
        it.sep ? (
          <div key={i} className="ctx-sep" />
        ) : (
          <button
            key={i}
            className={`ctx-item ${it.danger ? 'danger' : ''}`}
            disabled={it.disabled}
            onClick={() => {
              it.run();
              onClose();
            }}
          >
            {it.icon && <span className="ctx-icon" style={{ color: it.color }}>{it.icon}</span>}
            <span>{it.label}</span>
            {it.kbd && <kbd>{it.kbd}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}

function Graph() {
  const doc = useStore((s) => s.doc);
  const selection = useStore((s) => s.selection);
  const store = useStore.getState();
  const rf = useReactFlow();
  const wrap = useRef(null);
  const [rfNodes, setRfNodes] = useState([]);
  const [menu, setMenu] = useState(null);
  const [selectedEdges, setSelectedEdges] = useState(new Set());

  // sync store -> react flow (keep measured sizes from RF state)
  useEffect(() => {
    setRfNodes((prev) => {
      const prevMap = new Map(prev.map((n) => [n.id, n]));
      return doc.nodes.map((n) => {
        const old = prevMap.get(n.id);
        return {
          ...(old || {}),
          id: n.id,
          type: 'gen',
          position: old?.dragging ? old.position : n.position,
          data: { node: n, text: summary(n, doc.materials) },
          selected: selection?.type === 'node' && selection.id === n.id,
          deletable: !NODE_TYPES[n.type].singleton,
        };
      });
    });
  }, [doc.nodes, doc.materials, selection]);

  const edges = useMemo(
    () =>
      doc.nodes
        .filter((n) => n.parent && doc.nodes.some((p) => p.id === n.parent))
        .map((n) => {
          const id = `e:${n.parent}:${n.id}`;
          return {
            id,
            source: n.parent,
            target: n.id,
            selected: selectedEdges.has(id),
            style: { stroke: NODE_TYPES[n.type].color, strokeWidth: selectedEdges.has(id) ? 3 : 2, opacity: n.enabled ? 0.9 : 0.35 },
          };
        }),
    [doc.nodes, selectedEdges],
  );

  const onNodesChange = useCallback(
    (changes) => {
      setRfNodes((nds) => applyNodeChanges(changes.filter((c) => c.type !== 'remove'), nds));
      const moved = changes.filter((c) => c.type === 'position' && c.dragging === false && c.position);
      if (moved.length) store.setNodePositions(moved.map((c) => ({ id: c.id, position: c.position })));
      const sel = changes.find((c) => c.type === 'select' && c.selected);
      if (sel) store.select({ type: 'node', id: sel.id });
    },
    [store],
  );

  const onNodeDragStop = useCallback(
    (_, __, nodes) => {
      store.setNodePositions(nodes.map((n) => ({ id: n.id, position: n.position })));
    },
    [store],
  );

  const onEdgesChange = useCallback((changes) => {
    setSelectedEdges((prev) => {
      const next = new Set(prev);
      for (const c of changes) {
        if (c.type === 'select') c.selected ? next.add(c.id) : next.delete(c.id);
        if (c.type === 'remove') next.delete(c.id);
      }
      return next;
    });
  }, []);

  const isValidConnection = useCallback(
    (c) => {
      const parent = doc.nodes.find((n) => n.id === c.source);
      const child = doc.nodes.find((n) => n.id === c.target);
      if (!parent || !child || parent.id === child.id) return false;
      return canParent(child.type, parent.type) && !isDescendant(doc, parent.id, child.id);
    },
    [doc],
  );

  const onConnect = useCallback((c) => store.connect(c.target, c.source), [store]);

  const openAddMenu = useCallback(
    (clientX, clientY, parentId) => {
      const parent = doc.nodes.find((n) => n.id === parentId);
      const rect = wrap.current.getBoundingClientRect();
      const flowPos = rf.screenToFlowPosition({ x: clientX, y: clientY });
      const types = parent ? CHILD_TYPES.filter((t) => canParent(t, parent.type)) : CHILD_TYPES;
      setMenu({
        x: clientX - rect.left,
        y: clientY - rect.top,
        title: parent ? `Add child to ${parent.name}` : 'Add node',
        items: types.map((t) => ({
          label: NODE_TYPES[t].label,
          icon: <NodeIcon type={t} size={13} />,
          color: NODE_TYPES[t].color,
          run: () => store.addNode(t, parent?.id ?? null, { x: flowPos.x - 80, y: flowPos.y - 20 }),
        })),
      });
    },
    [doc.nodes, rf, store],
  );

  const openNodeMenu = useCallback(
    (clientX, clientY, node) => {
      if (!node) return;
      const def = NODE_TYPES[node.type];
      const rect = wrap.current.getBoundingClientRect();
      const childTypes = CHILD_TYPES.filter((t) => canParent(t, node.type));
      store.select({ type: 'node', id: node.id });
      setMenu({
        x: clientX - rect.left,
        y: clientY - rect.top,
        title: node.name,
        items: [
          {
            label: 'Inspect parameters',
            icon: <SlidersHorizontal size={13} />,
            run: () => store.setMobilePanel('inspector'),
          },
          ...(childTypes.length ? [{ sep: true }] : []),
          ...childTypes.map((t) => ({
            label: `Add ${NODE_TYPES[t].label}`,
            icon: <NodeIcon type={t} size={13} />,
            color: NODE_TYPES[t].color,
            run: () => store.addNode(t, node.id),
          })),
          ...(!def.singleton
            ? [
                { sep: true },
                { label: node.enabled ? 'Disable' : 'Enable', run: () => store.setNodeProps(node.id, { enabled: !node.enabled }) },
                { label: 'Duplicate with children', kbd: 'Ctrl+D', run: () => store.duplicateNode(node.id) },
                { label: 'Duplicate node only', run: () => store.duplicateNode(node.id, false) },
                ...(node.parent ? [{ label: 'Disconnect from parent', run: () => store.disconnect(node.id) }] : []),
                { sep: true },
                { label: 'Delete', kbd: 'Del', danger: true, run: () => store.deleteNodes([node.id]) },
              ]
            : []),
        ],
      });
    },
    [store],
  );

  const onConnectEnd = useCallback(
    (event, state) => {
      if (state.isValid || !state.fromNode || state.fromHandle?.type !== 'source') return;
      const { clientX, clientY } = 'changedTouches' in event ? event.changedTouches[0] : event;
      openAddMenu(clientX, clientY, state.fromNode.id);
    },
    [openAddMenu],
  );

  const onNodeContextMenu = useCallback(
    (e, rfNode) => {
      e.preventDefault();
      const node = doc.nodes.find((n) => n.id === rfNode.id);
      openNodeMenu(e.clientX, e.clientY, node);
    },
    [doc.nodes, openNodeMenu],
  );

  const onPaneContextMenu = useCallback(
    (e) => {
      e.preventDefault();
      openAddMenu(e.clientX, e.clientY, null);
    },
    [openAddMenu],
  );

  const onBeforeDelete = useCallback(async ({ nodes, edges: es }) => ({
    nodes: nodes.filter((n) => !NODE_TYPES[doc.nodes.find((d) => d.id === n.id)?.type]?.singleton),
    edges: es,
  }), [doc.nodes]);

  const onDelete = useCallback(
    ({ nodes, edges: es }) => {
      // edges attached to deleted nodes go with them; only lone edge deletions detach a child
      if (nodes.length) store.deleteNodes(nodes.map((n) => n.id));
      else for (const e of es) store.disconnect(e.target);
    },
    [store],
  );

  const selectedNode = selection?.type === 'node' ? doc.nodes.find((n) => n.id === selection.id) : doc.nodes.find((n) => n.type === 'tree');
  const selectedDef = selectedNode ? NODE_TYPES[selectedNode.type] : null;

  return (
    <div className="graph" ref={wrap}>
      <div className="graph-toolbar">
        <button
          className="tb-btn"
          title="Add child to selected node"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            openAddMenu(r.left, r.bottom + 4, selectedNode && canHaveChildren(selectedNode.type) ? selectedNode.id : null);
          }}
        >
          <Plus size={14} /> Add
        </button>
        {selectedNode && (
          <button
            className="tb-btn"
            title="Node actions (duplicate, disconnect, delete)"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              openNodeMenu(r.left, r.bottom + 4, selectedNode);
            }}
          >
            <MoreHorizontal size={14} /> Actions
          </button>
        )}
        <button className="tb-btn" title="Tidy layout" onClick={() => { store.tidyLayout(); setTimeout(() => rf.fitView({ padding: 0.2, duration: 300 }), 30); }}>
          <LayoutGrid size={14} /> Tidy
        </button>
        <button className="tb-btn" title="Fit view" onClick={() => rf.fitView({ padding: 0.2, duration: 300 })}>
          <Maximize size={14} />
        </button>
        <span className="tb-hint">Right-click or Actions · drag ● to spawn child</span>
      </div>
      <ReactFlow
        nodes={rfNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        isValidConnection={isValidConnection}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={() => setMenu(null)}
        onBeforeDelete={onBeforeDelete}
        onDelete={onDelete}
        deleteKeyCode={['Delete', 'Backspace']}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        defaultEdgeOptions={{ type: 'default' }}
      >
        <Background gap={18} size={1.2} color="#2a3038" />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap pannable zoomable position="bottom-right" nodeColor={/** @param {GeneratorFlowNode} n */ (n) => NODE_TYPES[n.data.node.type].color} maskColor="rgba(10,12,15,0.7)" style={{ width: 120, height: 80 }} />
      </ReactFlow>

      {selectedNode && selectedDef && (
        <div className="graph-sel-bar">
          <button
            className="graph-sel-edit"
            style={{ '--c': selectedDef.color }}
            onClick={() => store.setMobilePanel('inspector')}
            title="Edit selected node in Inspector"
          >
            <SlidersHorizontal size={13} />
            <span>Edit <b>{selectedNode.name}</b></span>
          </button>
          {canHaveChildren(selectedNode.type) && (
            <button
              className="tb-btn"
              title={`Add child to ${selectedNode.name}`}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                openAddMenu(r.left, r.top - 120, selectedNode.id);
              }}
            >
              <Plus size={13} /> Child
            </button>
          )}
          {!selectedDef.singleton && (
            <>
              <button
                className="icon-btn"
                title={selectedNode.enabled ? 'Disable' : 'Enable'}
                onClick={() => store.setNodeProps(selectedNode.id, { enabled: !selectedNode.enabled })}
              >
                {selectedNode.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              <button
                className="icon-btn"
                title="Duplicate with children"
                onClick={() => store.duplicateNode(selectedNode.id)}
              >
                <Copy size={14} />
              </button>
              <button
                className="icon-btn danger"
                title="Delete node"
                onClick={() => store.deleteNodes([selectedNode.id])}
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      )}

      {menu && <Menu menu={menu} onClose={() => setMenu(null)} boundsRef={wrap} />}
    </div>
  );
}

export function GraphPanel() {
  return (
    <ReactFlowProvider>
      <Graph />
    </ReactFlowProvider>
  );
}
