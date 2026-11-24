"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  Trash2,
  ExternalLink,
} from "lucide-react";
import {
  BIGBAND_INSTRUMENTS,
  BIGBAND_REGISTER_FAMILIES,
  RehearsalSessionItem,
} from "@/types";

interface MusicStandModalProps {
  session: RehearsalSessionItem | null;
  initialPieceIndex?: number;
  currentUser: { id: string; name: string; instrument?: string } | null;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

export default function MusicStandModal({
  session,
  initialPieceIndex = 0,
  currentUser,
  onClose,
  onRefresh,
}: MusicStandModalProps) {
  const [currentIndex, setCurrentIndex] = useState<number>(initialPieceIndex);
  const [bpmDraft, setBpmDraft] = useState<string>("");
  const [bpmCommentDraft, setBpmCommentDraft] = useState<string>("");
  const [savingBpm, setSavingBpm] = useState<boolean>(false);
  const [savedBpmToast, setSavedBpmToast] = useState<boolean>(false);

  // Quick Add Measure Note state
  const [measureInput, setMeasureInput] = useState<string>("");
  const [measureInstrument, setMeasureInstrument] = useState<string>(
    currentUser?.instrument || "Tutti"
  );
  const [measureNoteText, setMeasureNoteText] = useState<string>("");
  const [savingNote, setSavingNote] = useState<boolean>(false);

  useEffect(() => {
    setCurrentIndex(initialPieceIndex);
  }, [initialPieceIndex, session?.id]);

  const pieces = session?.pieces || [];
  const safeIndex =
    pieces.length === 0
      ? 0
      : Math.max(0, Math.min(currentIndex, pieces.length - 1));
  const currentSp = pieces[safeIndex] || null;
  const nextSp = pieces[safeIndex + 1] || null;

  useEffect(() => {
    if (!currentSp) return;
    const defaultBpm =
      currentSp.sessionBpm > 0
        ? currentSp.sessionBpm
        : currentSp.lastSessionBpm && currentSp.lastSessionBpm > 0
        ? currentSp.lastSessionBpm
        : currentSp.piece.bpm > 0
        ? currentSp.piece.bpm
        : 0;
    setBpmDraft(defaultBpm > 0 ? String(defaultBpm) : "");
    setBpmCommentDraft(currentSp.sessionBpmComment || "");
  }, [currentSp?.id]);

  // Keyboard navigation (Left / Right / Escape)
  useEffect(() => {
    if (!session) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentIndex((i) => Math.min(pieces.length - 1, i + 1));
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [session, pieces.length, onClose]);

  if (!session) return null;

  const handleSaveSessionBpm = async (
    overrideBpm?: number,
    alsoUpdatePieceTarget?: boolean
  ) => {
    if (!currentSp) return;
    setSavingBpm(true);
    try {
      const numericBpm =
        overrideBpm !== undefined
          ? overrideBpm
          : Math.max(0, Math.min(400, Math.round(Number(bpmDraft) || 0)));
      if (overrideBpm !== undefined) {
        setBpmDraft(numericBpm > 0 ? String(numericBpm) : "");
      }
      await fetch(`/api/rehearsals/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-piece-bpm",
          pieceId: currentSp.pieceId,
          sessionBpm: numericBpm,
          sessionBpmComment: bpmCommentDraft.trim(),
          updatePieceTargetBpm: Boolean(alsoUpdatePieceTarget),
        }),
      });
      await onRefresh();
      setSavedBpmToast(true);
      setTimeout(() => setSavedBpmToast(false), 1800);
    } finally {
      setSavingBpm(false);
    }
  };

  const handleAddMeasureNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSp || !measureNoteText.trim()) return;
    setSavingNote(true);
    try {
      await fetch(`/api/pieces/${currentSp.pieceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addMeasureNote: {
            measure: measureInput.trim() || "Allgemein",
            instrument: measureInstrument,
            note: measureNoteText.trim(),
            author: currentUser?.name || "Probe",
          },
        }),
      });
      setMeasureInput("");
      setMeasureNoteText("");
      await onRefresh();
    } finally {
      setSavingNote(false);
    }
  };

  const handleRemoveMeasureNote = async (noteId: string) => {
    if (!currentSp) return;
    setSavingNote(true);
    try {
      await fetch(`/api/pieces/${currentSp.pieceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          removeMeasureNoteId: noteId,
        }),
      });
      await onRefresh();
    } finally {
      setSavingNote(false);
    }
  };

  const clampedBreakIndex = Math.max(
    1,
    Math.min(pieces.length, session.breakAfterPieceIndex || 3)
  );
  const isBreakRightAfterThisPiece =
    session.hasBreak && clampedBreakIndex === safeIndex + 1;

  return (
    <div className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col bg-[var(--bg-paper)] text-[var(--ink-primary)]">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-2 border-b-2 border-[var(--rule-heavy)] bg-[var(--ink-primary)] px-4 py-2.5 text-[var(--bg-surface)] sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono-tabular bg-[var(--accent)] px-2 py-0.5 text-xs font-bold text-[var(--accent-ink)]">
            🎼 NOTENPULT-MODUS
          </span>
          <span className="truncate font-display text-sm font-semibold sm:text-base">
            Probe #{String(session.sessionNumber).padStart(2, "0")}:{" "}
            {session.title}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono-tabular text-xs">
            STÜCK{" "}
            <strong>
              {pieces.length > 0 ? safeIndex + 1 : 0} / {pieces.length}
            </strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="type-kicker inline-flex items-center gap-1 border border-[var(--bg-surface)] bg-[var(--ink-primary)] px-3 py-1.5 text-xs font-bold text-[var(--bg-surface)] hover:bg-[var(--accent)] cursor-pointer"
          >
            SCHLIESSEN <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Content Stage */}
      {!currentSp ? (
        <div className="m-auto p-8 text-center">
          <p className="type-section-h2">
            Keine Stücke in dieser Probe eingeplant.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto max-w-5xl space-y-5">
            {/* Hero Piece Banner with Giant Folder Number */}
            <div className="grid grid-cols-1 gap-4 border-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-4 sm:grid-cols-12 sm:p-6">
              <div className="flex flex-col items-center justify-center border-2 border-[var(--ink-primary)] bg-[var(--ink-primary)] p-4 text-center text-[var(--bg-surface)] sm:col-span-4">
                <span className="type-kicker text-[11px] opacity-80">
                  MAPPEN-NUMMER
                </span>
                <div className="font-mono-tabular mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
                  MAPPE #{currentSp.piece.folderNumber || "—"}
                </div>
                <span className="font-mono-tabular mt-2 border border-[var(--bg-surface)]/40 px-2.5 py-0.5 text-xs">
                  ⏱ ~{currentSp.effectiveMinutes} Min.
                </span>
              </div>

              <div className="flex flex-col justify-between sm:col-span-8">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {currentSp.piece.songType && (
                      <span className="type-kicker border border-[var(--ink-primary)] bg-[var(--bg-recessed)] px-2.5 py-0.5 text-xs font-bold text-[var(--ink-primary)]">
                        {currentSp.piece.songType}
                      </span>
                    )}
                    {currentSp.piece.bpm > 0 && (
                      <span className="font-mono-tabular border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-2.5 py-0.5 text-xs font-bold text-[var(--ink-primary)]">
                        ♩ Ziel: {currentSp.piece.bpm} BPM
                      </span>
                    )}
                    {currentSp.piece.referenceUrl && (
                      <a
                        href={currentSp.piece.referenceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="type-kicker inline-flex items-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-2.5 py-0.5 text-xs text-[var(--accent)] underline"
                      >
                        ▶ Referenz-Aufnahme <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>

                  <h1 className="font-display mt-2 text-2xl font-bold leading-tight text-[var(--ink-primary)] sm:text-4xl">
                    {currentSp.piece.title}
                  </h1>
                  {currentSp.piece.artist && (
                    <div className="mt-0.5 text-sm font-medium text-[var(--ink-secondary)]">
                      {currentSp.piece.artist}
                    </div>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 border-t border-[var(--rule-border)] pt-3 text-xs sm:grid-cols-2">
                  <div className="border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2">
                    <span className="type-kicker block text-[10px] text-[var(--ink-muted)]">
                      GESANG / BESETZUNG
                    </span>
                    <strong className="text-sm text-[var(--ink-primary)]">
                      {currentSp.piece.singers || "Instrumental"}
                    </strong>
                  </div>
                  <div className="border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2">
                    <span className="type-kicker block text-[10px] text-[var(--ink-muted)]">
                      SOLISTEN
                    </span>
                    <strong className="text-sm text-[var(--ink-primary)]">
                      {currentSp.piece.soloists || "—"}
                    </strong>
                  </div>
                </div>

                {currentSp.piece.notes && (
                  <div className="mt-3 border-l-2 border-[var(--accent)] bg-[var(--bg-paper)] px-3 py-2 text-xs text-[var(--ink-primary)]">
                    <span className="type-kicker mr-1.5 text-[10px] text-[var(--ink-muted)]">
                      HINWEIS:
                    </span>
                    {currentSp.piece.notes}
                  </div>
                )}
              </div>
            </div>

            {/* Panel 1: Live BPM & Tempo Tracking for this Rehearsal */}
            <div className="border-2 border-[var(--ink-primary)] bg-[var(--bg-surface)] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule-border)] pb-3">
                <div>
                  <span className="type-kicker text-[var(--accent)]">
                    TEMPO-DOKUMENTATION DIESER PROBE
                  </span>
                  <h2 className="font-display text-lg font-semibold text-[var(--ink-primary)]">
                    ♩ Proben-Tempo (BPM) & Tempo-Notiz
                  </h2>
                </div>
                <div className="font-mono-tabular flex flex-wrap items-center gap-3 text-xs">
                  <span className="border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2.5 py-1 font-semibold">
                    Ziel: {currentSp.piece.bpm || "—"} BPM
                  </span>
                  <span className="border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2.5 py-1 font-semibold">
                    Letzte Probe:{" "}
                    {currentSp.lastSessionBpm && currentSp.lastSessionBpm > 0
                      ? currentSp.lastSessionBpm
                      : "—"}{" "}
                    BPM
                    {currentSp.lastSessionBpmComment
                      ? ` (${currentSp.lastSessionBpmComment})`
                      : ""}
                  </span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-center">
                <div className="flex items-center gap-1.5 sm:col-span-4">
                  <button
                    type="button"
                    onClick={() => {
                      const cur =
                        Number(bpmDraft) || currentSp.piece.bpm || 120;
                      const next = Math.max(30, cur - 5);
                      handleSaveSessionBpm(next);
                    }}
                    className="font-mono-tabular border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-3 py-2 text-xs font-bold text-[var(--ink-primary)] hover:bg-[var(--bg-recessed)] cursor-pointer"
                  >
                    -5
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={400}
                    value={bpmDraft}
                    onChange={(e) => setBpmDraft(e.target.value)}
                    placeholder="BPM (z.B. 160)"
                    className="font-mono-tabular w-full border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-3 py-2 text-center text-sm font-bold text-[var(--ink-primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const cur =
                        Number(bpmDraft) || currentSp.piece.bpm || 120;
                      const next = Math.min(400, cur + 5);
                      handleSaveSessionBpm(next);
                    }}
                    className="font-mono-tabular border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-3 py-2 text-xs font-bold text-[var(--ink-primary)] hover:bg-[var(--bg-recessed)] cursor-pointer"
                  >
                    +5
                  </button>
                </div>

                <div className="sm:col-span-5">
                  <input
                    type="text"
                    value={bpmCommentDraft}
                    onChange={(e) => setBpmCommentDraft(e.target.value)}
                    placeholder="Tempo-Notiz (z.B. „160 BPM gespielt, nächstes Mal schneller“)..."
                    className="w-full border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-3 py-2 text-xs text-[var(--ink-primary)]"
                  />
                </div>

                <div className="flex items-center gap-1.5 sm:col-span-3">
                  <button
                    type="button"
                    disabled={savingBpm}
                    onClick={() => handleSaveSessionBpm()}
                    className="type-kicker flex-1 bg-[var(--accent)] px-3 py-2.5 text-center text-xs font-bold text-[var(--accent-ink)] cursor-pointer"
                  >
                    {savedBpmToast ? (
                      <span className="inline-flex items-center justify-center gap-1">
                        <Check className="h-3.5 w-3.5" /> GESPEICHERT
                      </span>
                    ) : savingBpm ? (
                      "SPEICHERT..."
                    ) : (
                      "TEMPO SPEICHERN"
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Panel 2: Instrumenten-Probebedarf & Takt-Notizen */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              {/* Register Practice Needs */}
              <div className="border border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-4 md:col-span-5">
                <div className="type-kicker text-[var(--ink-secondary)]">
                  REGISTER-PROBEBEDARF FÜR DIESES STÜCK
                </div>
                {currentSp.piece.instrumentStats.length === 0 ? (
                  <p className="mt-2 text-xs text-[var(--ink-muted)]">
                    Noch keine instrumentenspezifischen Bewertungen.
                  </p>
                ) : (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {currentSp.piece.instrumentStats.map((st) => {
                      const high =
                        st.avgPracticeNeeded >= 3.5 || st.isFlaggedFocus;
                      return (
                        <span
                          key={st.instrument}
                          className={`font-mono-tabular inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs ${
                            high
                              ? "border-[var(--accent)] bg-[var(--accent)] font-bold text-[var(--accent-ink)]"
                              : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-primary)]"
                          }`}
                        >
                          <span>🎺 {st.instrument}:</span>
                          {st.voteCount > 0 ? (
                            <span>
                              Ø {st.avgPracticeNeeded.toFixed(1)} ({st.voteCount}
                              )
                            </span>
                          ) : (
                            <span>Fokus</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Measure Notes & Live Quick-Add */}
              <div className="border border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-4 md:col-span-7">
                <div className="type-kicker mb-2 text-[var(--ink-primary)]">
                  📌 TAKT-NOTIZEN & SCHWIERIGE STELLEN (
                  {currentSp.piece.measureNotes.length})
                </div>

                {currentSp.piece.measureNotes.length === 0 ? (
                  <p className="mb-3 text-xs text-[var(--ink-muted)]">
                    Noch keine Takt-Marker für dieses Stück. Trage unten direkt
                    während der Probe Stellen ein!
                  </p>
                ) : (
                  <div className="mb-3 divide-y divide-[var(--rule-border)] border border-[var(--rule-border)] bg-[var(--bg-paper)]">
                    {currentSp.piece.measureNotes.map((mn) => (
                      <div
                        key={mn.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                      >
                        <div>
                          <strong className="font-mono-tabular text-[var(--ink-primary)]">
                            {mn.measure}
                          </strong>
                          {mn.instrument && (
                            <span className="type-kicker mx-1.5 border border-[var(--ink-primary)] bg-[var(--bg-recessed)] px-1.5 py-0.5 text-[10px]">
                              {mn.instrument}
                            </span>
                          )}
                          <span>{mn.note}</span>
                        </div>
                        <button
                          type="button"
                          disabled={savingNote}
                          onClick={() => handleRemoveMeasureNote(mn.id)}
                          className="text-[var(--ink-muted)] hover:text-[var(--accent)] cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <form
                  onSubmit={handleAddMeasureNote}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-12"
                >
                  <input
                    type="text"
                    value={measureInput}
                    onChange={(e) => setMeasureInput(e.target.value)}
                    placeholder="Takt (z.B. Takt 32–40)"
                    className="border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-2.5 py-1.5 text-xs sm:col-span-3"
                  />
                  <select
                    value={measureInstrument}
                    onChange={(e) => setMeasureInstrument(e.target.value)}
                    className="border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-2 py-1.5 text-xs sm:col-span-3"
                  >
                    <option value="Tutti">Tutti (Alle)</option>
                    {BIGBAND_REGISTER_FAMILIES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                    {BIGBAND_INSTRUMENTS.map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={measureNoteText}
                    onChange={(e) => setMeasureNoteText(e.target.value)}
                    placeholder="Notiz für nächste Probe..."
                    className="border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-2.5 py-1.5 text-xs sm:col-span-4"
                  />
                  <button
                    type="submit"
                    disabled={savingNote || !measureNoteText.trim()}
                    className="type-kicker bg-[var(--ink-primary)] px-3 py-1.5 text-[10px] font-bold text-[var(--bg-surface)] disabled:opacity-40 sm:col-span-2 cursor-pointer"
                  >
                    + NOTIZ
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Next Up Banner & Bottom Navigation Bar */}
      <div className="border-t-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="font-mono-tabular text-xs font-bold text-[var(--ink-primary)]">
            {isBreakRightAfterThisPiece ? (
              <span className="bg-[var(--bg-recessed)] border border-[var(--ink-primary)] px-2.5 py-1">
                ALS NÄCHSTES: ☕ PAUSE ({session.breakDurationMinutes} MIN.) →
                DANACH:{" "}
                {nextSp
                  ? `#${nextSp.piece.folderNumber || "—"} ${nextSp.piece.title}`
                  : "ENDE"}
              </span>
            ) : nextSp ? (
              <span>
                ALS NÄCHSTES:{" "}
                <strong className="text-[var(--accent)]">
                  #{nextSp.piece.folderNumber || "—"} {nextSp.piece.title}
                </strong>
                {nextSp.piece.singers ? ` (${nextSp.piece.singers})` : ""}
              </span>
            ) : (
              <span className="text-[var(--ink-secondary)]">
                LETZTES STÜCK DER PROBE ERREICHT
              </span>
            )}
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button
              type="button"
              disabled={safeIndex <= 0}
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              className="type-kicker flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 border-2 border-[var(--ink-primary)] bg-[var(--bg-paper)] px-4 py-2.5 text-xs font-bold text-[var(--ink-primary)] disabled:opacity-35 cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
              ◀ VORHERIGES STÜCK
            </button>
            <button
              type="button"
              disabled={safeIndex >= pieces.length - 1}
              onClick={() =>
                setCurrentIndex((i) => Math.min(pieces.length - 1, i + 1))
              }
              className="type-kicker flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 bg-[var(--accent)] px-5 py-2.5 text-xs font-bold text-[var(--accent-ink)] disabled:opacity-35 cursor-pointer"
            >
              NÄCHSTES STÜCK ▶
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
