import React, { useMemo, useRef, useState } from 'react';
import { evalCurve, CURVES } from '../../core/curve.js';

const W = 260, H = 104, PAD = 8;

const PRESET_LIST = [
  ['flat', 'Flat'],
  ['linearDown', 'Linear ↓'],
  ['linearUp', 'Linear ↑'],
  ['taper', 'Taper'],
  ['cone', 'Cone'],
  ['bell', 'Bell'],
  ['easeIn', 'Ease in'],
];

/**
 * Monotone-cubic curve editor.
 * Drag points · double-click or "+ Point" to add · double-click / right-click / "Del pt" to remove.
 * End points stay pinned to x = 0 and x = 1.
 */
export function CurveEditor({ points, onChange, axis }) {
  const svg = useRef(null);
  const [drag, setDrag] = useState(null);
  const [sel, setSel] = useState(null);
  const yMax = Math.max(1.25, Math.ceil(Math.max(...points.map((p) => p[1])) * 4) / 4);

  const toPx = ([x, y]) => [PAD + x * (W - 2 * PAD), H - PAD - (y / yMax) * (H - 2 * PAD)];
  const fromEvent = (e) => {
    const r = svg.current.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * W;
    const sy = ((e.clientY - r.top) / r.height) * H;
    return [Math.min(1, Math.max(0, (sx - PAD) / (W - 2 * PAD))), Math.min(yMax, Math.max(0, ((H - PAD - sy) / (H - 2 * PAD)) * yMax))];
  };

  const path = useMemo(() => {
    const parts = [];
    for (let i = 0; i <= 80; i++) {
      const x = i / 80;
      const [px, py] = toPx([x, Math.max(0, evalCurve(points, x))]);
      parts.push(`${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`);
    }
    return parts.join('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, yMax]);

  const update = (i, xy) => {
    const next = points.map((p) => [...p]);
    const last = next.length - 1;
    let [x, y] = xy;
    if (i === 0) x = 0;
    else if (i === last) x = 1;
    else x = Math.min(next[i + 1][0] - 0.01, Math.max(next[i - 1][0] + 0.01, x));
    next[i] = [Number(x.toFixed(3)), Number(y.toFixed(3))];
    onChange(next);
  };

  const remove = (i) => {
    if (i == null || i <= 0 || i >= points.length - 1) return;
    setSel(null);
    onChange(points.filter((_, k) => k !== i));
  };

  const add = (e) => {
    const [x, y] = fromEvent(e);
    const next = [...points.map((p) => [...p]), [Number(x.toFixed(3)), Number(y.toFixed(3))]].sort((a, b) => a[0] - b[0]);
    onChange(next);
  };

  const addMidpoint = () => {
    let bestGap = -1;
    let midX = 0.5;
    for (let i = 0; i < points.length - 1; i++) {
      const gap = points[i + 1][0] - points[i][0];
      if (gap > bestGap) {
        bestGap = gap;
        midX = (points[i][0] + points[i + 1][0]) * 0.5;
      }
    }
    const midY = Math.max(0, evalCurve(points, midX));
    const pt = [Number(midX.toFixed(3)), Number(midY.toFixed(3))];
    const next = [...points.map((p) => [...p]), pt].sort((a, b) => a[0] - b[0]);
    const idx = next.findIndex((p) => p[0] === pt[0] && p[1] === pt[1]);
    setSel(idx >= 0 ? idx : null);
    onChange(next);
  };

  const canDeleteSel = sel != null && sel > 0 && sel < points.length - 1;
  const grid1 = toPx([0, 1])[1];

  return (
    <div className="curve">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="curve-svg"
        onDoubleClick={(e) => e.target === svg.current || (e.target instanceof SVGElement && e.target.dataset.bg) ? add(e) : null}
        onPointerMove={(e) => drag != null && update(drag, fromEvent(e))}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        <rect data-bg="1" x="0" y="0" width={W} height={H} className="curve-bg" />
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} data-bg="1" x1={toPx([g, 0])[0]} x2={toPx([g, 0])[0]} y1={PAD} y2={H - PAD} className="curve-grid" />
        ))}
        <line data-bg="1" x1={PAD} x2={W - PAD} y1={grid1} y2={grid1} className="curve-grid strong" />
        <path d={path} className="curve-line" />
        {points.map((p, i) => {
          const [cx, cy] = toPx(p);
          return (
            <g key={i}>
              <circle
                cx={cx}
                cy={cy}
                r={11}
                fill="transparent"
                style={{ cursor: 'grab' }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.currentTarget.ownerSVGElement.setPointerCapture?.(e.pointerId);
                  setSel(i);
                  setDrag(i);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  remove(i);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  remove(i);
                }}
              />
              <circle
                cx={cx}
                cy={cy}
                r={drag === i || sel === i ? 5.5 : 4.5}
                className={`curve-pt ${sel === i ? 'sel' : ''}`}
                pointerEvents="none"
              />
            </g>
          );
        })}
      </svg>
      <div className="curve-foot">
        <span className="curve-axis">{axis === 'parent' ? 'x: on parent' : 'x: own length'}</span>
        <div className="curve-actions">
          <button type="button" className="curve-btn" title="Add curve point" onClick={addMidpoint}>+ Pt</button>
          {canDeleteSel && (
            <button type="button" className="curve-btn danger" title="Remove selected point" onClick={() => remove(sel)}>Del</button>
          )}
          <select className="curve-preset" value="" onChange={(e) => {
            if (!e.target.value) return;
            setSel(null);
            onChange(CURVES[e.target.value].map((p) => [...p]));
          }}>
            <option value="">Preset…</option>
            {PRESET_LIST.map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
