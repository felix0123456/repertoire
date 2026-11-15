"use client";

import React from "react";

interface ScoreSelectorProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  colorScheme?: "amber" | "emerald" | "rose";
  disabled?: boolean;
  hint?: string;
}

export default function ScoreSelector({
  label,
  value,
  onChange,
  colorScheme = "amber",
  disabled = false,
  hint,
}: ScoreSelectorProps) {
  const activeClasses = {
    amber: "bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-sm",
    emerald:
      "bg-emerald-500 text-slate-950 border-emerald-400 font-bold shadow-sm",
    rose: "bg-rose-500 text-white border-rose-400 font-bold shadow-sm",
  }[colorScheme];

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-300">{label}</span>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((num) => {
          const active = value === num;
          return (
            <button
              key={num}
              type="button"
              disabled={disabled}
              onClick={() => onChange(num)}
              className={`h-7 flex-1 rounded-md border text-xs transition-all ${
                active
                  ? activeClasses
                  : "border-slate-700/80 bg-slate-800/70 text-slate-300 hover:border-slate-600 hover:bg-slate-800"
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

