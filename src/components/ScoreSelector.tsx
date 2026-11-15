"use client";

import React from "react";

interface ScoreSelectorProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  disabled?: boolean;
  hint?: string;
}

export default function ScoreSelector({
  label,
  value,
  onChange,
  disabled = false,
  hint,
}: ScoreSelectorProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="type-kicker text-[var(--ink-secondary)]">{label}</span>
        {hint && (
          <span className="font-mono-tabular text-[11px] text-[var(--ink-muted)]">
            {hint}
          </span>
        )}
      </div>
      <div className="grid grid-cols-5 border border-[var(--rule-border)] bg-[var(--bg-paper)]">
        {[1, 2, 3, 4, 5].map((num) => {
          const active = value === num;
          return (
            <button
              key={num}
              type="button"
              disabled={disabled}
              onClick={() => onChange(num)}
              className={`font-mono-tabular ui-transition min-h-[36px] border-r border-[var(--rule-border)] last:border-r-0 text-xs font-semibold ${
                active
                  ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "bg-[var(--bg-surface)] text-[var(--ink-primary)] hover:bg-[var(--bg-recessed)]"
              } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              {num}
            </button>
          );
        })}
      </div>
    </div>
  );
}
