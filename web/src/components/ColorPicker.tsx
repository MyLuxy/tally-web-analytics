import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { hexToHsv, hsvToHex, isHex } from "../lib/color.js";
import { useLockBodyScroll } from "../hooks/useLockBodyScroll.js";

// same colors as BarChart's palette, just real hex here instead of color-mix()
const PRESETS = ["#6c8cff", "#ff8c6c", "#6cffb0", "#e06cff", "#ffd66c", "#6cd6ff", "#ff6c8c", "#a3ff6c"];

export function ColorPicker({
  value,
  onChange,
  label,
  className,
}: {
  value: string;
  onChange: (hex: string) => void;
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [hexInput, setHexInput] = useState(value);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  useLockBodyScroll(open);

  function openAt() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const spillsRight = rect.left + 232 > window.innerWidth - 12;
      setPos({
        top: rect.bottom + 8,
        left: spillsRight ? rect.right - 232 : rect.left,
      });
    }
    setHsv(hexToHsv(value));
    setHexInput(value);
    setOpen(true);
  }

  // just closes on scroll instead of repositioning every frame, it's a quick pick not a stuck panel
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (popRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function commit(h: number, s: number, v: number) {
    const hex = hsvToHex(h, s, v);
    setHsv({ h, s, v });
    setHexInput(hex);
    onChange(hex);
  }

  function updateFromPointer(e: { clientX: number; clientY: number }) {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
    commit(hsv.h, x / rect.width, 1 - y / rect.height);
  }

  function commitHex(raw: string) {
    if (!isHex(raw)) return;
    const hex = raw.startsWith("#") ? raw : `#${raw}`;
    setHexInput(hex);
    setHsv(hexToHsv(hex));
    onChange(hex);
  }

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className={className}
        style={{ background: value }}
        onClick={() => (open ? setOpen(false) : openAt())}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
      />
      {open &&
        createPortal(
          <div
            ref={popRef}
            className="color-picker-pop"
            role="dialog"
            aria-label={label}
            style={{ top: pos.top, left: pos.left }}
          >
            <div
              ref={svRef}
              className="color-picker-sv"
              style={{ background: `hsl(${hsv.h}, 100%, 50%)` }}
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture(e.pointerId);
                updateFromPointer(e);
              }}
              onPointerMove={(e) => {
                if (e.buttons !== 1) return;
                updateFromPointer(e);
              }}
            >
              <div className="color-picker-sv-white" />
              <div className="color-picker-sv-black" />
              <div
                className="color-picker-sv-thumb"
                style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
              />
            </div>

            <input
              type="range"
              className="color-picker-hue"
              min={0}
              max={360}
              value={hsv.h}
              onChange={(e) => commit(Number(e.target.value), hsv.s, hsv.v)}
              aria-label="Hue"
            />

            <div className="color-picker-footer">
              <span className="color-picker-preview" style={{ background: hexInput }} />
              <input
                type="text"
                className="color-picker-hex"
                value={hexInput}
                onChange={(e) => setHexInput(e.target.value)}
                onBlur={(e) => commitHex(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && commitHex(hexInput)}
                spellCheck={false}
                aria-label="Hex color"
              />
            </div>

            <div className="color-picker-presets">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="color-picker-preset"
                  style={{ background: p }}
                  onClick={() => commit(hexToHsv(p).h, hexToHsv(p).s, hexToHsv(p).v)}
                  aria-label={`Use ${p}`}
                  title={p}
                />
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
