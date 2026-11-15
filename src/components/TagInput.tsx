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
      <label className="type-kicker block text-[var(--ink-secondary)]">
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
            className="ui-transition w-full border border-[var(--rule-border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:border-[var(--ink-primary)] focus:outline-none"
          />
          {focused && suggestions.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto border border-[var(--ink-primary)] bg-[var(--bg-surface)] p-2">
              <div className="type-kicker mb-1.5 text-[var(--ink-muted)]">
                Vorhandene Einträge:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(s);
                      setFocused(false);
                    }}
                    className="ui-transition border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2.5 py-1 text-xs font-medium text-[var(--ink-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="border border-[var(--rule-border)] bg-[var(--bg-surface)] p-2.5 focus-within:border-[var(--ink-primary)]">
          {tags.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 border border-[var(--ink-primary)] bg-[var(--bg-recessed)] px-2.5 py-0.5 text-xs font-medium text-[var(--ink-primary)]"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="text-[var(--ink-secondary)] hover:text-[var(--accent)] cursor-pointer"
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
              className="flex-1 bg-transparent text-sm text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none"
            />
            {inputVal.trim() && (
              <button
                type="button"
                onClick={() => addTag(inputVal)}
                className="inline-flex items-center gap-1 bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold text-[var(--accent-ink)] cursor-pointer"
              >
                <Plus className="h-3 w-3" /> Hinzufügen
              </button>
            )}
          </div>

          {(focused || filteredSuggestions.length > 0) &&
            filteredSuggestions.length > 0 && (
              <div className="mt-2.5 border-t border-[var(--rule-border)] pt-2">
                <span className="type-kicker text-[var(--ink-muted)]">
                  Vorschläge aus Repertoire:
                </span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {filteredSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addTag(s);
                      }}
                      className="ui-transition border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2 py-0.5 text-xs text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)] cursor-pointer"
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
