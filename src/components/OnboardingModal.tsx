"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  SkipForward,
  Layers,
  List,
  Sparkles,
} from "lucide-react";
import { PieceItem, SuggestionsData } from "@/types";
import ScoreSelector from "./ScoreSelector";

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  pieces: PieceItem[];
  suggestions: SuggestionsData;
  currentUser: { id: string; name: string };
  onRefresh: () => Promise<void>;
}

const DIFFICULTY_LABELS: Record<string, string> = {
  EASY: "Leicht",
  MEDIUM: "Mittel",
  HARD: "Schwer",
};

const SKIPPED_STORAGE_PREFIX = "repertoire_skipped_pieces_v1_";

export default function OnboardingModal({
  isOpen,
  onClose,
  pieces,
  suggestions,
  currentUser,
  onRefresh,
}: OnboardingModalProps) {
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [scopeFilter, setScopeFilter] = useState<"unrated" | "all" | "skipped">(
    "unrated"
  );
  const [singerFilter, setSingerFilter] = useState<string>("");
  const [songTypeFilter, setSongTypeFilter] = useState<string>("");
  const [excludeRhythmOnly, setExcludeRhythmOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [skippedIds, setSkippedIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Local draft scores for the active card in "cards" mode
  const [draftLike, setDraftLike] = useState<number>(4);
  const [draftConfidence, setDraftConfidence] = useState<number>(3);
  const [draftPractice, setDraftPractice] = useState<number>(3);

  // Load skipped piece IDs for this user from localStorage
  useEffect(() => {
    if (!currentUser?.id) return;
    try {
      const raw = localStorage.getItem(
        `${SKIPPED_STORAGE_PREFIX}${currentUser.id}`
      );
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setSkippedIds(parsed);
      } else {
        setSkippedIds([]);
      }
    } catch {
      setSkippedIds([]);
    }
  }, [currentUser?.id]);

  const saveSkippedIds = (next: string[]) => {
    setSkippedIds(next);
    try {
      localStorage.setItem(
        `${SKIPPED_STORAGE_PREFIX}${currentUser.id}`,
        JSON.stringify(next)
      );
    } catch {
      // ignore storage errors
    }
  };

  // Overall stats for this user
  const stats = useMemo(() => {
    const total = pieces.length;
    const rated = pieces.filter((p) => Boolean(p.myVote)).length;
    const skipped = pieces.filter(
      (p) => !p.myVote && skippedIds.includes(p.id)
    ).length;
    const open = Math.max(0, total - rated - skipped);
    return { total, rated, skipped, open };
  }, [pieces, skippedIds]);

  // Filtered list of pieces for onboarding
  const filteredPieces = useMemo(() => {
    return pieces.filter((p) => {
      const isRated = Boolean(p.myVote);
      const isSkipped = skippedIds.includes(p.id);

      if (scopeFilter === "unrated" && (isRated || isSkipped)) {
        return false;
      }
      if (scopeFilter === "skipped" && !isSkipped) {
        return false;
      }

      if (singerFilter === "__INSTRUMENTAL__") {
        if (p.singers && p.singers.trim() !== "") return false;
      } else if (singerFilter) {
        const list = p.singers
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        if (!list.includes(singerFilter.toLowerCase())) return false;
      }

      if (songTypeFilter) {
        const list = p.songType
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        if (!list.includes(songTypeFilter.toLowerCase())) return false;
      }

      if (excludeRhythmOnly) {
        if (p.notes.toLowerCase().includes("ohne bläser")) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${p.folderNumber || ""} ${p.title} ${p.singers} ${
          p.soloists
        } ${p.songType} ${p.notes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [
    pieces,
    skippedIds,
    scopeFilter,
    singerFilter,
    songTypeFilter,
    excludeRhythmOnly,
    searchQuery,
  ]);

  // Keep currentIndex within bounds when filteredPieces changes
  const safeIndex =
    filteredPieces.length === 0
      ? 0
      : Math.min(currentIndex, filteredPieces.length - 1);

  const currentPiece = filteredPieces[safeIndex] || null;

  // Sync draft scores whenever currentPiece changes
  useEffect(() => {
    if (!currentPiece) return;
    if (currentPiece.myVote) {
      setDraftLike(currentPiece.myVote.likeScore);
      setDraftConfidence(currentPiece.myVote.confidenceScore);
      setDraftPractice(currentPiece.myVote.practiceNeededScore);
    } else {
      setDraftLike(4);
      setDraftConfidence(3);
      setDraftPractice(3);
    }
  }, [currentPiece?.id]);

  if (!isOpen) return null;

  const submitVoteAndAdvance = async (
    piece: PieceItem,
    likeScore: number,
    confidenceScore: number,
    practiceNeededScore: number,
    autoAdvance = true
  ) => {
    setSavingId(piece.id);
    try {
      // Remove from skipped if previously skipped
      if (skippedIds.includes(piece.id)) {
        saveSkippedIds(skippedIds.filter((id) => id !== piece.id));
      }

      await fetch("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          pieceId: piece.id,
          likeScore,
          confidenceScore,
          practiceNeededScore,
        }),
      });
      await onRefresh();

      if (autoAdvance && scopeFilter !== "unrated") {
        // In "all" or "skipped" mode, advance index manually since item stays in list
        setCurrentIndex((prev) =>
          Math.min(prev + 1, Math.max(0, filteredPieces.length - 1))
        );
      }
      // Note: in "unrated" mode, once rated, the piece is removed from filteredPieces,
      // so the next piece naturally slides into safeIndex!
    } finally {
      setSavingId(null);
    }
  };

  const handleSkipPiece = (piece: PieceItem) => {
    if (!skippedIds.includes(piece.id)) {
      saveSkippedIds([...skippedIds, piece.id]);
    } else {
      setCurrentIndex((prev) =>
        Math.min(prev + 1, Math.max(0, filteredPieces.length - 1))
      );
    }
  };

  const handleUnskipAll = () => {
    saveSkippedIds([]);
    setScopeFilter("unrated");
    setCurrentIndex(0);
  };

  const progressPercent =
    stats.total > 0
      ? Math.round(((stats.rated + stats.skipped) / stats.total) * 100)
      : 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4 overflow-y-auto">
      <div className="my-auto flex max-h-[94vh] w-full max-w-5xl flex-col border-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] text-[var(--ink-primary)]">
        {/* Top Modal Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[var(--rule-heavy)] bg-[var(--bg-recessed)] px-4 py-4 sm:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="type-kicker bg-[var(--ink-primary)] px-2 py-0.5 text-[var(--bg-surface)]">
                INITIALES REPERTOIRE-ONBOARDING
              </span>
              <span className="type-kicker text-[var(--ink-secondary)]">
                SPIELER: {currentUser.name.toUpperCase()}
              </span>
            </div>
            <h2 className="type-section-h2 mt-1 text-[var(--ink-primary)]">
              Stücke einschätzen & bewerten
            </h2>
            <p className="mt-0.5 text-xs text-[var(--ink-secondary)]">
              Deine Einschätzung fließt direkt in den Probeplan-Algorithmus ein.
              Du kannst jederzeit pausieren und später fortfahren.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Switcher */}
            <div className="inline-flex border border-[var(--ink-primary)] bg-[var(--bg-surface)]">
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`type-kicker inline-flex items-center gap-1.5 px-3 py-2 cursor-pointer ${
                  viewMode === "cards"
                    ? "bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                    : "text-[var(--ink-secondary)] hover:bg-[var(--bg-paper)]"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                KARTEIKARTEN
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`type-kicker inline-flex items-center gap-1.5 border-l border-[var(--ink-primary)] px-3 py-2 cursor-pointer ${
                  viewMode === "table"
                    ? "bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                    : "text-[var(--ink-secondary)] hover:bg-[var(--bg-paper)]"
                }`}
              >
                <List className="h-3.5 w-3.5" />
                SCHNELL-TABELLE
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              title="Pausieren & Schließen"
              className="type-kicker inline-flex items-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-3 py-2 text-[var(--ink-primary)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] hover:border-[var(--accent)] cursor-pointer"
            >
              PAUSIEREN / SCHLIESSEN <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Progress & Filter Strip */}
        <div className="border-b border-[var(--rule-border)] bg-[var(--bg-paper)] px-4 py-3 sm:px-6">
          {/* Progress Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="font-mono-tabular flex flex-wrap items-center gap-3">
              <span>
                <strong className="text-[var(--ink-primary)]">
                  {stats.rated}
                </strong>{" "}
                / {stats.total} BEWERTET
              </span>
              <span className="text-[var(--ink-muted)]">•</span>
              <span>
                <strong className="text-[var(--accent)]">{stats.open}</strong>{" "}
                OFFEN
              </span>
              {stats.skipped > 0 && (
                <>
                  <span className="text-[var(--ink-muted)]">•</span>
                  <span>
                    <strong>{stats.skipped}</strong> ÜBERSPRUNGEN
                  </span>
                </>
              )}
            </div>
            <span className="font-mono-tabular font-semibold text-[var(--ink-primary)]">
              {progressPercent}% ERLEDIGT
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full border border-[var(--rule-border)] bg-[var(--bg-surface)]">
            <div
              className="h-full bg-[var(--ink-primary)] transition-all duration-200"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Filter Controls */}
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-12">
            {/* Scope Filter */}
            <div className="flex border border-[var(--rule-border)] bg-[var(--bg-surface)] sm:col-span-5">
              <button
                type="button"
                onClick={() => {
                  setScopeFilter("unrated");
                  setCurrentIndex(0);
                }}
                className={`type-kicker flex-1 px-2 py-1.5 text-center cursor-pointer ${
                  scopeFilter === "unrated"
                    ? "bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                    : "text-[var(--ink-secondary)]"
                }`}
              >
                OFFEN ({stats.open})
              </button>
              <button
                type="button"
                onClick={() => {
                  setScopeFilter("all");
                  setCurrentIndex(0);
                }}
                className={`type-kicker flex-1 border-l border-[var(--rule-border)] px-2 py-1.5 text-center cursor-pointer ${
                  scopeFilter === "all"
                    ? "bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                    : "text-[var(--ink-secondary)]"
                }`}
              >
                ALLE ({stats.total})
              </button>
              <button
                type="button"
                onClick={() => {
                  setScopeFilter("skipped");
                  setCurrentIndex(0);
                }}
                className={`type-kicker flex-1 border-l border-[var(--rule-border)] px-2 py-1.5 text-center cursor-pointer ${
                  scopeFilter === "skipped"
                    ? "bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                    : "text-[var(--ink-secondary)]"
                }`}
              >
                ÜBERSPRUNGEN ({stats.skipped})
              </button>
            </div>

            {/* Singer Filter */}
            <div className="sm:col-span-3">
              <select
                value={singerFilter}
                onChange={(e) => {
                  setSingerFilter(e.target.value);
                  setCurrentIndex(0);
                }}
                className="w-full border border-[var(--rule-border)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
              >
                <option value="">Alle Sänger / Besetzungen</option>
                <option value="__INSTRUMENTAL__">Nur Instrumentalstücke</option>
                {suggestions.singers.map((s) => (
                  <option key={s} value={s}>
                    Sänger: {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Song Type Filter */}
            <div className="sm:col-span-2">
              <select
                value={songTypeFilter}
                onChange={(e) => {
                  setSongTypeFilter(e.target.value);
                  setCurrentIndex(0);
                }}
                className="w-full border border-[var(--rule-border)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
              >
                <option value="">Alle Tanz-/Song-Typen</option>
                {suggestions.songTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div className="sm:col-span-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentIndex(0);
                }}
                placeholder="Stück suchen..."
                className="w-full border border-[var(--rule-border)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:border-[var(--ink-primary)] focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex items-center gap-2 text-xs text-[var(--ink-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={excludeRhythmOnly}
                onChange={(e) => {
                  setExcludeRhythmOnly(e.target.checked);
                  setCurrentIndex(0);
                }}
                className="accent-[var(--accent)]"
              />
              <span>
                Stücke mit „Rhythmusgruppe ohne Bläser“ ausblenden (für Bläser)
              </span>
            </label>

            {stats.skipped > 0 && (
              <button
                type="button"
                onClick={handleUnskipAll}
                className="type-kicker text-[var(--ink-secondary)] underline hover:text-[var(--ink-primary)] cursor-pointer"
              >
                ÜBERSPRUNGENE ZURÜCKSETZEN ({stats.skipped})
              </button>
            )}
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {filteredPieces.length === 0 ? (
            <div className="border border-[var(--rule-border)] bg-[var(--bg-paper)] p-10 text-center">
              <div className="type-kicker text-[var(--accent)]">
                BEWERTUNGS-DURCHLAUF ABGESCHLOSSEN
              </div>
              <h3 className="type-section-h2 mt-1 text-[var(--ink-primary)]">
                Keine weiteren Stücke in dieser Ansicht!
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-[var(--ink-secondary)]">
                Du hast{" "}
                <strong className="text-[var(--ink-primary)]">
                  {stats.rated} von {stats.total} Stücken
                </strong>{" "}
                bewertet
                {stats.skipped > 0
                  ? ` und ${stats.skipped} als „Spiele/Singe ich nicht“ übersprungen`
                  : ""}
                .
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {scopeFilter !== "all" && (
                  <button
                    type="button"
                    onClick={() => {
                      setScopeFilter("all");
                      setCurrentIndex(0);
                    }}
                    className="type-kicker border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-4 py-2.5 text-[var(--ink-primary)] cursor-pointer"
                  >
                    ALLE {stats.total} STÜCKE ANZEIGEN
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="type-kicker bg-[var(--accent)] px-6 py-2.5 text-[var(--accent-ink)] cursor-pointer"
                >
                  ZUM REPERTOIRE & PROBEPLAN →
                </button>
              </div>
            </div>
          ) : viewMode === "cards" && currentPiece ? (
            /* KARTEIKARTEN-MODUS */
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Left Column (Cols 1-6): Piece Metadata & Fast Presets */}
              <div className="flex flex-col justify-between border border-[var(--rule-border)] bg-[var(--bg-paper)] p-5 lg:col-span-6">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule-border)] pb-3">
                    <span className="font-mono-tabular text-xs font-semibold text-[var(--ink-secondary)]">
                      KARTE {safeIndex + 1} VON {filteredPieces.length}
                    </span>
                    <div className="flex items-center gap-2">
                      {currentPiece.folderNumber && (
                        <span className="font-mono-tabular border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-2 py-0.5 text-xs font-bold text-[var(--ink-primary)]">
                          MAPPE #{currentPiece.folderNumber}
                        </span>
                      )}
                      <span className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-surface)] px-2 py-0.5 text-[var(--ink-secondary)]">
                        {DIFFICULTY_LABELS[currentPiece.difficulty] || "Mittel"}
                      </span>
                      {currentPiece.myVote ? (
                        <span className="type-kicker border border-[var(--ink-primary)] bg-[var(--ink-primary)] px-2 py-0.5 text-[var(--bg-surface)]">
                          ✓ BEWERTET
                        </span>
                      ) : (
                        <span className="type-kicker border border-[var(--accent)] px-2 py-0.5 text-[var(--accent)]">
                          OFFEN
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="font-display mt-4 text-2xl font-semibold text-[var(--ink-primary)] sm:text-3xl">
                    {currentPiece.title}
                  </h3>
                  {currentPiece.artist && (
                    <p className="mt-1 text-xs text-[var(--ink-muted)]">
                      {currentPiece.artist}
                    </p>
                  )}

                  {/* Metadata Grid */}
                  <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-[var(--rule-border)] pt-4 text-xs">
                    <div className="border border-[var(--rule-border)] bg-[var(--bg-surface)] p-2.5">
                      <span className="type-kicker block text-[var(--ink-muted)]">
                        SÄNGER / VOKAL
                      </span>
                      <span className="mt-1 block font-semibold text-[var(--ink-primary)]">
                        {currentPiece.singers || "Instrumental"}
                      </span>
                    </div>
                    <div className="border border-[var(--rule-border)] bg-[var(--bg-surface)] p-2.5">
                      <span className="type-kicker block text-[var(--ink-muted)]">
                        TANZ- / SONG-TYP
                      </span>
                      <span className="mt-1 block font-semibold text-[var(--ink-primary)]">
                        {currentPiece.songType || "—"}
                      </span>
                    </div>
                    <div className="border border-[var(--rule-border)] bg-[var(--bg-surface)] p-2.5">
                      <span className="type-kicker block text-[var(--ink-muted)]">
                        SOLIST(EN)
                      </span>
                      <span className="mt-1 block font-semibold text-[var(--ink-primary)]">
                        {currentPiece.soloists || "—"}
                      </span>
                    </div>
                    <div className="border border-[var(--rule-border)] bg-[var(--bg-surface)] p-2.5">
                      <span className="type-kicker block text-[var(--ink-muted)]">
                        SET / HINWEISE
                      </span>
                      <span className="mt-1 block font-semibold text-[var(--ink-primary)]">
                        {currentPiece.notes || "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 1-Click Fast Presets */}
                <div className="mt-6 border-t-2 border-[var(--rule-heavy)] pt-4">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
                    <span className="type-kicker text-[var(--ink-primary)]">
                      1-KLICK SCHNELL-EINSCHÄTZUNG (SPEICHERT & WEITER)
                    </span>
                  </div>
                  <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={savingId === currentPiece.id}
                      onClick={() =>
                        submitVoteAndAdvance(currentPiece, 4, 5, 1, true)
                      }
                      className="ui-transition flex flex-col items-start border border-[var(--ink-primary)] bg-[var(--bg-surface)] p-2.5 text-left hover:bg-[var(--ink-primary)] hover:text-[var(--bg-surface)] cursor-pointer"
                    >
                      <span className="type-kicker font-bold">
                        ✓ SITZT SICHER
                      </span>
                      <span className="font-mono-tabular mt-0.5 text-[11px] opacity-80">
                        Sicherheit 5 • Übungsbedarf 1 • Beliebtheit 4
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={savingId === currentPiece.id}
                      onClick={() =>
                        submitVoteAndAdvance(currentPiece, 3, 3, 3, true)
                      }
                      className="ui-transition flex flex-col items-start border border-[var(--ink-primary)] bg-[var(--bg-surface)] p-2.5 text-left hover:bg-[var(--ink-primary)] hover:text-[var(--bg-surface)] cursor-pointer"
                    >
                      <span className="type-kicker font-bold">
                        ~ SOLIDE / GEHT SO
                      </span>
                      <span className="font-mono-tabular mt-0.5 text-[11px] opacity-80">
                        Sicherheit 3 • Übungsbedarf 3 • Beliebtheit 3
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={savingId === currentPiece.id}
                      onClick={() =>
                        submitVoteAndAdvance(currentPiece, 4, 2, 5, true)
                      }
                      className="ui-transition flex flex-col items-start border border-[var(--accent)] bg-[var(--bg-surface)] p-2.5 text-left text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] cursor-pointer"
                    >
                      <span className="type-kicker font-bold">
                        ! BRAUCHT DRINGEND PROBE
                      </span>
                      <span className="font-mono-tabular mt-0.5 text-[11px] opacity-85">
                        Sicherheit 2 • Übungsbedarf 5 • Beliebtheit 4
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={savingId === currentPiece.id}
                      onClick={() => handleSkipPiece(currentPiece)}
                      className="ui-transition flex flex-col items-start border border-[var(--rule-border)] bg-[var(--bg-recessed)] p-2.5 text-left text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)] cursor-pointer"
                    >
                      <span className="type-kicker font-bold">
                        ⏭ SPIELE / SINGE ICH NICHT
                      </span>
                      <span className="font-mono-tabular mt-0.5 text-[11px]">
                        Kenne ich nicht / Pausieren & Überspringen
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column (Cols 7-12): Custom 1-5 Sliders & Navigation */}
              <div className="flex flex-col justify-between border border-[var(--rule-border)] bg-[var(--bg-surface)] p-5 lg:col-span-6">
                <div>
                  <div className="border-b border-[var(--rule-border)] pb-3">
                    <span className="type-kicker text-[var(--ink-muted)]">
                      FEINABSTIMMUNG (SKALA 1 BIS 5)
                    </span>
                    <h4 className="font-display mt-0.5 text-lg font-semibold text-[var(--ink-primary)]">
                      Individuelle Bewertung für „{currentPiece.title}“
                    </h4>
                  </div>

                  <div className="mt-5 space-y-5">
                    <ScoreSelector
                      label="1. Beliebtheit (Wie gerne spielst/singst du es?)"
                      hint="1 = Wenig • 5 = absoluter Favorit"
                      value={draftLike}
                      onChange={setDraftLike}
                      disabled={savingId === currentPiece.id}
                    />

                    <ScoreSelector
                      label="2. Eigene Sicherheit (Wie gut sitzt deine Stimme?)"
                      hint="1 = Sehr unsicher • 5 = Sitzt fehlerfrei"
                      value={draftConfidence}
                      onChange={setDraftConfidence}
                      disabled={savingId === currentPiece.id}
                    />

                    <ScoreSelector
                      label="3. Übungsbedarf (Wie dringend müssen wir es proben?)"
                      hint="1 = Kaum nötig • 5 = Hoher Probenbedarf"
                      value={draftPractice}
                      onChange={setDraftPractice}
                      disabled={savingId === currentPiece.id}
                    />
                  </div>
                </div>

                {/* Bottom Navigation & Save Action */}
                <div className="mt-6 space-y-3 border-t border-[var(--rule-border)] pt-4">
                  <button
                    type="button"
                    disabled={savingId === currentPiece.id}
                    onClick={() =>
                      submitVoteAndAdvance(
                        currentPiece,
                        draftLike,
                        draftConfidence,
                        draftPractice,
                        true
                      )
                    }
                    className="type-kicker ui-transition flex w-full items-center justify-center gap-2 bg-[var(--accent)] px-5 py-3.5 text-[var(--accent-ink)] disabled:opacity-50 cursor-pointer"
                  >
                    <Check className="h-4 w-4" />
                    {savingId === currentPiece.id
                      ? "SPEICHERT BEWERTUNG..."
                      : "BEWERTUNG SPEICHERN & NÄCHSTES STÜCK →"}
                  </button>

                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={safeIndex <= 0}
                      onClick={() =>
                        setCurrentIndex((prev) => Math.max(0, prev - 1))
                      }
                      className="type-kicker inline-flex items-center gap-1 border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      VORHERIGES
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSkipPiece(currentPiece)}
                      className="type-kicker inline-flex items-center gap-1 border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] cursor-pointer"
                    >
                      ÜBERSPRINGEN
                      <SkipForward className="h-3.5 w-3.5" />
                    </button>

                    <button
                      type="button"
                      disabled={safeIndex >= filteredPieces.length - 1}
                      onClick={() =>
                        setCurrentIndex((prev) =>
                          Math.min(filteredPieces.length - 1, prev + 1)
                        )
                      }
                      className="type-kicker inline-flex items-center gap-1 border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] disabled:opacity-40 cursor-pointer"
                    >
                      WEITER BLÄTTERN
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* KOMPAKTE TABELLENANSICHT (SCHNELL-LISTE) */
            <div className="overflow-x-auto border border-[var(--rule-border)] bg-[var(--bg-surface)]">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b-2 border-[var(--rule-heavy)] bg-[var(--bg-recessed)]">
                    <th className="type-kicker px-3 py-2.5 text-[var(--ink-secondary)]">
                      STÜCK & BESETZUNG
                    </th>
                    <th className="type-kicker px-3 py-2.5 text-[var(--ink-secondary)]">
                      SCHNELL-PRESET
                    </th>
                    <th className="type-kicker px-3 py-2.5 text-[var(--ink-secondary)]">
                      BELIEBTHEIT (1–5)
                    </th>
                    <th className="type-kicker px-3 py-2.5 text-[var(--ink-secondary)]">
                      SICHERHEIT (1–5)
                    </th>
                    <th className="type-kicker px-3 py-2.5 text-[var(--ink-secondary)]">
                      ÜBUNGSBEDARF (1–5)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--rule-border)]">
                  {filteredPieces.map((piece) => {
                    const vote = piece.myVote;
                    const curLike = vote?.likeScore ?? 4;
                    const curConf = vote?.confidenceScore ?? 3;
                    const curPrac = vote?.practiceNeededScore ?? 3;
                    const isSaving = savingId === piece.id;

                    return (
                      <tr
                        key={piece.id}
                        className={
                          vote ? "bg-[var(--bg-surface)]" : "bg-[var(--bg-paper)]"
                        }
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            {piece.folderNumber && (
                              <span className="font-mono-tabular border border-[var(--ink-primary)] px-1.5 py-0.5 text-[10px] font-bold">
                                #{piece.folderNumber}
                              </span>
                            )}
                            <span className="font-display text-sm font-semibold text-[var(--ink-primary)]">
                              {piece.title}
                            </span>
                            {vote && (
                              <span className="font-mono-tabular bg-[var(--ink-primary)] px-1.5 py-0.5 text-[10px] text-[var(--bg-surface)]">
                                ✓
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[11px] text-[var(--ink-secondary)]">
                            {piece.singers || "Instrumental"}
                            {piece.songType ? ` • ${piece.songType}` : ""}
                            {piece.notes ? ` • ${piece.notes}` : ""}
                          </div>
                        </td>

                        {/* Presets */}
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() =>
                                submitVoteAndAdvance(piece, 4, 5, 1, false)
                              }
                              className="type-kicker border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-2 py-1 text-[10px] hover:bg-[var(--ink-primary)] hover:text-[var(--bg-surface)] cursor-pointer"
                            >
                              SITZT
                            </button>
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() =>
                                submitVoteAndAdvance(piece, 4, 2, 5, false)
                              }
                              className="type-kicker border border-[var(--accent)] bg-[var(--bg-surface)] px-2 py-1 text-[10px] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] cursor-pointer"
                            >
                              PROBE!
                            </button>
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleSkipPiece(piece)}
                              className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-recessed)] px-2 py-1 text-[10px] text-[var(--ink-secondary)] cursor-pointer"
                            >
                              SKIP
                            </button>
                          </div>
                        </td>

                        {/* Like 1-5 */}
                        <td className="px-3 py-2.5">
                          <div className="inline-grid grid-cols-5 border border-[var(--rule-border)]">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={n}
                                type="button"
                                disabled={isSaving}
                                onClick={() =>
                                  submitVoteAndAdvance(
                                    piece,
                                    n,
                                    curConf,
                                    curPrac,
                                    false
                                  )
                                }
                                className={`font-mono-tabular h-7 w-7 border-r border-[var(--rule-border)] last:border-r-0 text-[11px] font-semibold cursor-pointer ${
                                  vote && vote.likeScore === n
                                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                                    : "bg-[var(--bg-surface)] hover:bg-[var(--bg-recessed)]"
                                }`}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </td>

                        {/* Confidence 1-5 */}
                        <td className="px-3 py-2.5">
                          <div className="inline-grid grid-cols-5 border border-[var(--rule-border)]">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={n}
                                type="button"
                                disabled={isSaving}
                                onClick={() =>
                                  submitVoteAndAdvance(
                                    piece,
                                    curLike,
                                    n,
                                    curPrac,
                                    false
                                  )
                                }
                                className={`font-mono-tabular h-7 w-7 border-r border-[var(--rule-border)] last:border-r-0 text-[11px] font-semibold cursor-pointer ${
                                  vote && vote.confidenceScore === n
                                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                                    : "bg-[var(--bg-surface)] hover:bg-[var(--bg-recessed)]"
                                }`}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </td>

                        {/* Practice Needed 1-5 */}
                        <td className="px-3 py-2.5">
                          <div className="inline-grid grid-cols-5 border border-[var(--rule-border)]">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={n}
                                type="button"
                                disabled={isSaving}
                                onClick={() =>
                                  submitVoteAndAdvance(
                                    piece,
                                    curLike,
                                    curConf,
                                    n,
                                    false
                                  )
                                }
                                className={`font-mono-tabular h-7 w-7 border-r border-[var(--rule-border)] last:border-r-0 text-[11px] font-semibold cursor-pointer ${
                                  vote && vote.practiceNeededScore === n
                                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                                    : "bg-[var(--bg-surface)] hover:bg-[var(--bg-recessed)]"
                                }`}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
