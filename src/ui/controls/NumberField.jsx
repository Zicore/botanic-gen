import React, { useEffect, useRef, useState } from 'react';

const decimals = (step) => (step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step))));

/**
 * Slider + scrubbable numeric field. Drag horizontally on the value to scrub
 * (Shift = fine, Ctrl = coarse); click to type. Double-click the label to reset.
 */
export function NumberField({ label, value, min, max, step = 0.01, onChange, onReset, hint, suffix, softMax }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const drag = useRef(null);
  const d = decimals(step);
  const sliderMax = softMax ?? max;
  const pct = Math.min(1, Math.max(0, (value - min) / (sliderMax - min || 1)));

  const clampSnap = (v) => {
    const snapped = Math.round(v / step) * step;
    return Math.min(max, Math.max(min, Number(snapped.toFixed(6))));
  };

  const onPointerDown = (e) => {
    if (editing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    // scrub span adapts to the current magnitude so large ranges stay controllable
    const full = sliderMax - min;
    const span = Math.min(full, Math.max(Math.abs(value) * 2, full * 0.15, step * 40));
    drag.current = { x: e.clientX, v: value, moved: false, span };
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    if (Math.abs(dx) > 2) drag.current.moved = true;
    if (!drag.current.moved) return;
    const k = e.shiftKey ? 0.1 : e.ctrlKey ? 4 : 1;
    onChange(clampSnap(drag.current.v + (dx / 250) * drag.current.span * k));
  };
  const onPointerUp = () => {
    if (drag.current && !drag.current.moved) {
      setText(String(Number(value.toFixed(d))));
      setEditing(true);
    }
    drag.current = null;
  };

  const commitText = () => {
    const v = parseFloat(text);
    if (!Number.isNaN(v)) onChange(clampSnap(v));
    setEditing(false);
  };

  return (
    <div className="field">
      <div className="field-row">
        <label className="field-label" title={hint ? `${hint}\n(double-click to reset)` : 'Double-click to reset'} onDoubleClick={onReset}>
          {label}
        </label>
        {editing ? (
          <input
            autoFocus
            className="num-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitText();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <div className="num-scrub" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} title="Drag to scrub · click to type">
            {value.toFixed(d)}
            {suffix && <span className="num-suffix">{suffix}</span>}
          </div>
        )}
      </div>
      <input
        type="range"
        className="slider"
        min={min}
        max={sliderMax}
        step={step}
        value={Math.min(value, sliderMax)}
        style={{ '--pct': `${pct * 100}%` }}
        onChange={(e) => onChange(clampSnap(parseFloat(e.target.value)))}
      />
    </div>
  );
}

export function Toggle({ label, value, onChange, hint }) {
  return (
    <div className="field field-inline">
      <label className="field-label" title={hint}>{label}</label>
      <button type="button" className={`toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)} aria-pressed={value}>
        <span />
      </button>
    </div>
  );
}

export function SelectField({ label, value, options, onChange, hint }) {
  if (options.length <= 3 && options.every((o) => String(o.label).length <= 9)) {
    return (
      <div className="field">
        <label className="field-label" title={hint}>{label}</label>
        <div className="segmented">
          {options.map((o) => (
            <button key={o.value} type="button" className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="field">
      <label className="field-label" title={hint}>{label}</label>
      <select className="select" value={value ?? ''} onChange={(e) => {
        const o = options.find((x) => String(x.value) === e.target.value);
        onChange(o ? o.value : e.target.value);
      }}>
        {options.map((o) => (
          <option key={String(o.value)} value={o.value ?? ''}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
