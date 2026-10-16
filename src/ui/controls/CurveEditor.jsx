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
 * Drag points · double-click empty space to add · double-click / right-click a point to remove.
 * End points stay pinned to x = 0 and x = 1.
 */
export function CurveEditor({ points, onChange, axis }) {
  const svg = useRef(null);
  const [drag, setDrag] = useState(null);
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
    if (i === 0 || i === points.length - 1) return;
    onChange(points.filter((_, k) => k !== i));
  };

  const add = (e) => {
    const [x, y] = fromEvent(e);
    const next = [...points.map((p) => [...p]), [Number(x.toFixed(3)), Number(y.toFixed(3))]].sort((a, b) => a[0] - b[0]);
    onChange(next);
  };

  const grid1 = toPx([0, 1])[1];

  return (
    <div className="curve">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="curve-svg"
        onDoubleClick={(e) => e.target === svg.current || e.target.dataset.bg ? add(e) : null}
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
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={drag === i ? 5.5 : 4.5}
              className="curve-pt"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.ownerSVGElement.setPointerCapture?.(e.pointerId);
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
          );
        })}
      </svg>
      <div className="curve-foot">
        <span className="curve-axis">{axis === 'parent' ? 'x: position on parent' : 'x: along own length'}</span>
        <select className="curve-preset" value="" onChange={(e) => e.target.value && onChange(CURVES[e.target.value].map((p) => [...p]))}>
          <option value="">Preset…</option>
          {PRESET_LIST.map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
