"use client";

import { useState } from "react";

/**
 * Kuşak sayısı denetimi — kaydırma çubuğu yerine doğrudan sayı yazılabilen,
 * artı/eksi düğmeli alan (#1). Soy ve Yelpaze görünümleri paylaşır.
 */
export default function GenerationStepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const [text, setText] = useState(String(value));

  // Dışarıdan değer değişince (örn. +/- düğmesi) metni eşitle — render sırasında
  // türetme kalıbı (efekt yerine), böylece art arda render tetiklenmez.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(String(value));
  }

  const commit = (raw: string) => {
    const parsed = Math.round(Number(raw));
    const n = clamp(Number.isFinite(parsed) && raw.trim() !== "" ? parsed : value);
    onChange(n);
    setText(String(n));
  };

  const btn =
    "w-7 h-7 grid place-items-center text-base leading-none text-text-muted hover:text-text hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";

  return (
    <div className="flex items-center gap-2 text-xs text-text-muted">
      <span className="hidden sm:inline">{label}</span>
      <div className="flex items-center rounded-lg border border-border bg-surface overflow-hidden">
        <button
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          aria-label="−"
          className={btn}
        >
          −
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={text}
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            const n = Math.round(Number(raw));
            if (raw.trim() !== "" && Number.isFinite(n) && n >= min && n <= max) onChange(n);
          }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="w-11 h-7 text-center bg-transparent border-x border-border text-text font-medium tabular-nums outline-none focus:bg-surface-2 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          aria-label={label}
        />
        <button
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          aria-label="+"
          className={btn}
        >
          +
        </button>
      </div>
    </div>
  );
}
