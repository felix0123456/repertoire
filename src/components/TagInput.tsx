"use client";

import React, { useState } from "react";
import { X, Plus } from "lucide-react";

interface TagInputProps {
  label: string;
  placeholder: string;
  value: string; // comma-separated
  onChange: (newVal: string) => void;
  suggestions: string[];
  singleValue?: boolean;
}

export default function TagInput({
  label,
  placeholder,
  value,
  onChange,
  suggestions,
  singleValue = false,
}: TagInputProps) {
  const [inputVal, setInputVal] = useState("");
  const [focused, setFocused] = useState(false);

  const tags = value
    ? value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const addTag = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (singleValue) {
      onChange(trimmed);
      setInputVal("");
      return;
    }
    const exists = tags.some((t) => t.toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      const next = [...tags, trimmed].join(", ");
      onChange(next);
    }
    setInputVal("");
  };

  const removeTag = (target: string) => {
    const next = tags.filter((t) => t !== target).join(", ");
    onChange(next);
  };

  const filteredSuggestions = suggestions.filter((s) => {
    const alreadySelected = tags.some(
      (t) => t.toLowerCase() === s.toLowerCase()
    );
    if (alreadySelected) return false;
    if (!inputVal.trim()) return true;
    return s.toLowerCase().includes(inputVal.trim().toLowerCase());
  });

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </label>

      {singleValue ? (
        <div className="relative">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 180)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
          />
          {focused && suggestions.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-1.5 shadow-xl">
              <div className="px-2 py-1 text-[11px] font-medium text-slate-400">
                Vorhandene Einträge:
              </div>
              <div className="flex flex-wrap gap-1 p-1">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(s);
                      setFocused(false);
                    }}
                    className="rounded-md bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-amber-500/20 hover:text-amber-300"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-700 bg-slate-900/90 p-2 focus-within:border-amber-500">
          {tags.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-300 border border-amber-500/30"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="text-amber-400/70 hover:text-amber-200"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setTimeout(() => {
                  if (inputVal.trim()) addTag(inputVal);
                  setFocused(false);
                }, 180);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag(inputVal);
                }
              }}
              placeholder={placeholder}
              className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
            />
            {inputVal.trim() && (
              <button
                type="button"
                onClick={() => addTag(inputVal)}
                className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-2 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/30"
              >
                <Plus className="h-3 w-3" /> Hinzufügen
              </button>
            )}
          </div>

          {(focused || filteredSuggestions.length > 0) &&
            filteredSuggestions.length > 0 && (
              <div className="mt-2 border-t border-slate-800 pt-2">
                <span className="mr-2 text-[11px] text-slate-400">
                  Vorschläge:
                </span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {filteredSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addTag(s);
                      }}
                      className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300 hover:bg-amber-500/20 hover:text-amber-300"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

