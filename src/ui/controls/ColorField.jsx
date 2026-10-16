import React, { useEffect, useRef, useState } from 'react';
import { HexColorPicker } from 'react-colorful';

export function ColorField({ label, value, onChange, onReset }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value);
  const ref = useRef(null);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div className="field field-inline" ref={ref}>
      <label className="field-label" onDoubleClick={onReset} title="Double-click to reset">{label}</label>
      <div className="color-wrap">
        <input
          className="color-hex"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value.toLowerCase());
          }}
        />
        <button type="button" className="swatch" style={{ background: value }} onClick={() => setOpen(!open)} />
        {open && (
          <div className="color-pop">
            <HexColorPicker color={value} onChange={onChange} />
          </div>
        )}
      </div>
    </div>
  );
}
