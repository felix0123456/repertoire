"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Layers,
  List,
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
const RATING_MODE_STORAGE_KEY = "repertoire_onboarding_rating_mode_v1";

export default function OnboardingModal({
  isOpen,
  onClose,
  pieces,
  suggestions,
  currentUser,
  onRefresh,
}: OnboardingModalProps) {
  // 2-stage flow: "setup" first, then "cards" (or "table")
  const [step, setStep] = useState<"setup" | "cards" | "table">("setup");
  const [ratingMode, setRatingMode] = useState<"simple" | "full">("simple");

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

  // Local draft scores for the active card in "full" mode
  const [draftLike, setDraftLike] = useState<number>(4);
  const [draftConfidence, setDraftConfidence] = useState<number>(3);
  const [draftPractice, setDraftPractice] = useState<number>(3);

  // Reset to setup screen whenever modal is freshly opened
  useEffect(() => {
    if (isOpen) {
      setStep("setup");
      setCurrentIndex(0);
    }
  }, [isOpen]);

  // Load saved ratingMode & skipped piece IDs from localStorage
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem(RATING_MODE_STORAGE_KEY);
      if (savedMode === "simple" || savedMode === "full") {
        setRatingMode(savedMode);
      }
    } catch {
      // ignore
    }
  }, []);

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

  const handleSetRatingMode = (mode: "simple" | "full") => {
    setRatingMode(mode);
    try {
      localStorage.setItem(RATING_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  };

  const saveSkippedIds = (next: string[]) => {
    setSkippedIds(next);
    try {
      localStorage.setItem(
        `${SKIPPED_STORAGE_PREFIX}${currentUser.id}`,
        JSON.stringify(next)
      );
    } catch {
      // ignore
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

  const safeIndex =
    filteredPieces.length === 0
      ? 0
      : Math.min(currentIndex, filteredPieces.length - 1);

  const currentPiece = filteredPieces[safeIndex] || null;

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
      if (skippedIds.includes(piece.id)) {
        saveSkippedIds(skippedIds.filter((id) => id !== piece.id));
      }

      await fetch("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          userName: currentUser.name,
          pieceId: piece.id,
          likeScore,
          confidenceScore,
          practiceNeededScore,
        }),
      });
      await onRefresh();

      if (autoAdvance && scopeFilter !== "unrated") {
        setCurrentIndex((prev) =>
          Math.min(prev + 1, Math.max(0, filteredPieces.length - 1))
        );
      }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 sm:p-4">
      <div className="flex h-[100dvh] w-full flex-col border-0 border-[var(--rule-heavy)] bg-[var(--bg-surface)] text-[var(--ink-primary)] sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:border-2">
        {/* =========================================================
            STUFE 1: SETUP-SCREEN (NUR ZU BEGINN ODER ÜBER ⚙ FILTER)
           ========================================================= */}
        {step === "setup" && (
          <>
            {/* Compact Top Header */}
            <div className="flex items-center justify-between border-b-2 border-[var(--rule-heavy)] bg-[var(--bg-recessed)] px-4 py-3 sm:px-6">
              <div>
                <div className="type-kicker text-[var(--ink-secondary)]">
                  BEWERTUNGS-ONBOARDING • {currentUser.name.toUpperCase()}
                </div>
                <h2 className="font-display text-lg font-semibold leading-tight text-[var(--ink-primary)] sm:text-xl">
                  Einstellungen für deinen Durchlauf
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="type-kicker inline-flex items-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[var(--ink-primary)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] cursor-pointer"
              >
                SCHLIESSEN <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Setup Body — Fits cleanly on mobile without scrolling */}
            <div className="flex flex-1 flex-col justify-between overflow-y-auto p-4 sm:p-6">
              <div className="space-y-4">
                {/* Progress Strip */}
                <div className="border border-[var(--rule-border)] bg-[var(--bg-paper)] p-3">
                  <div className="font-mono-tabular flex items-center justify-between text-xs">
                    <span>
                      <strong>{stats.rated}</strong>/{stats.total} BEWERTET •{" "}
                      <strong className="text-[var(--accent)]">
                        {stats.open} OFFEN
                      </strong>
                      {stats.skipped > 0
                        ? ` • ${stats.skipped} ÜBERSPRUNGEN`
                        : ""}
                    </span>
                    <span className="font-bold">{progressPercent}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full bg-[var(--bg-surface)]">
                    <div
                      className="h-full bg-[var(--ink-primary)] transition-all duration-200"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* 1. Rating Mode Switcher (Vereinfacht vs. Voll) */}
                <div>
                  <label className="type-kicker mb-1.5 block text-[var(--ink-primary)]">
                    1. BEWERTUNGS-MODUS WÄHLEN (SCHALTER)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleSetRatingMode("simple")}
                      className={`flex flex-col items-start border p-3 text-left cursor-pointer ${
                        ratingMode === "simple"
                          ? "border-2 border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                          : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-primary)]"
                      }`}
                    >
                      <span className="type-kicker font-bold">
                        ⚡ VEREINFACHTES RATING
                      </span>
                      <span className="mt-1 text-[11px] leading-snug opacity-85">
                        4 große 1-Tap-Buttons („Sitzt sicher“, „Solide“,
                        „Braucht Probe“, „Spiele ich nicht“)
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSetRatingMode("full")}
                      className={`flex flex-col items-start border p-3 text-left cursor-pointer ${
                        ratingMode === "full"
                          ? "border-2 border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                          : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-primary)]"
                      }`}
                    >
                      <span className="type-kicker font-bold">
                        🎚 VOLLES RATING (1–5)
                      </span>
                      <span className="mt-1 text-[11px] leading-snug opacity-85">
                        Einzelne Skalen (1–5) für Beliebtheit, Sicherheit &
                        Übungsbedarf pro Stück
                      </span>
                    </button>
                  </div>
                </div>

                {/* 2. Scope & Piece Filters */}
                <div className="space-y-2.5 border-t border-[var(--rule-border)] pt-3">
                  <label className="type-kicker block text-[var(--ink-primary)]">
                    2. WELCHE STÜCKE MÖCHTEST DU DURCHGEHEN?
                  </label>

                  <div className="grid grid-cols-3 border border-[var(--rule-border)] bg-[var(--bg-paper)]">
                    <button
                      type="button"
                      onClick={() => {
                        setScopeFilter("unrated");
                        setCurrentIndex(0);
                      }}
                      className={`type-kicker py-2 text-center cursor-pointer ${
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
                      className={`type-kicker border-x border-[var(--rule-border)] py-2 text-center cursor-pointer ${
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
                      className={`type-kicker py-2 text-center cursor-pointer ${
                        scopeFilter === "skipped"
                          ? "bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                          : "text-[var(--ink-secondary)]"
                      }`}
                    >
                      SKIP ({stats.skipped})
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={singerFilter}
                      onChange={(e) => {
                        setSingerFilter(e.target.value);
                        setCurrentIndex(0);
                      }}
                      className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2.5 py-2 text-xs text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                    >
                      <option value="">Alle Sänger / Besetzungen</option>
                      <option value="__INSTRUMENTAL__">
                        Nur Instrumentalstücke
                      </option>
                      {suggestions.singers.map((s) => (
                        <option key={s} value={s}>
                          Sänger: {s}
                        </option>
                      ))}
                    </select>

                    <select
                      value={songTypeFilter}
                      onChange={(e) => {
                        setSongTypeFilter(e.target.value);
                        setCurrentIndex(0);
                      }}
                      className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2.5 py-2 text-xs text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                    >
                      <option value="">Alle Tanz-/Song-Typen</option>
                      {suggestions.songTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <label className="flex items-center gap-2 border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-xs text-[var(--ink-primary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={excludeRhythmOnly}
                      onChange={(e) => {
                        setExcludeRhythmOnly(e.target.checked);
                        setCurrentIndex(0);
                      }}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <span>
                      Stücke mit „Rhythmusgruppe ohne Bläser“ ausblenden
                    </span>
                  </label>
                </div>
              </div>

              {/* Bottom Action Buttons */}
              <div className="mt-4 space-y-2 border-t-2 border-[var(--rule-heavy)] pt-3">
                <button
                  type="button"
                  onClick={() => setStep("cards")}
                  className="type-kicker ui-transition flex w-full items-center justify-center gap-2 bg-[var(--accent)] px-5 py-3.5 text-sm font-bold text-[var(--accent-ink)] cursor-pointer"
                >
                  <Layers className="h-4 w-4" />
                  KARTEN-DURCHLAUF STARTEN ({filteredPieces.length} STÜCKE) →
                </button>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setStep("table")}
                    className="type-kicker inline-flex items-center gap-1.5 border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] cursor-pointer"
                  >
                    <List className="h-3.5 w-3.5" />
                    ALS SCHNELL-TABELLE ÖFFNEN
                  </button>
                  {stats.skipped > 0 && (
                    <button
                      type="button"
                      onClick={handleUnskipAll}
                      className="type-kicker text-[var(--ink-secondary)] underline cursor-pointer"
                    >
                      ÜBERSPRUNGENE ZURÜCKSETZEN ({stats.skipped})
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* =========================================================
            STUFE 2: KARTEN-MODUS (100% VIEWPORT-FIT OHNE SCROLLEN)
           ========================================================= */}
        {step === "cards" && (
          <>
            {/* Ultra-Compact Single-Row Top Bar */}
            <div className="flex items-center justify-between gap-2 border-b-2 border-[var(--rule-heavy)] bg-[var(--bg-recessed)] px-3 py-2 sm:px-5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono-tabular text-xs font-bold text-[var(--ink-primary)]">
                  {filteredPieces.length > 0
                    ? `${safeIndex + 1} / ${filteredPieces.length}`
                    : "0 / 0"}
                </span>
                <div className="hidden h-1.5 w-16 bg-[var(--bg-surface)] xs:block sm:w-24">
                  <div
                    className="h-full bg-[var(--ink-primary)] transition-all duration-200"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Direct Toggle: Einfach vs. Voll + Filter Button + Close */}
              <div className="flex items-center gap-1.5">
                <div className="inline-flex border border-[var(--ink-primary)] bg-[var(--bg-surface)]">
                  <button
                    type="button"
                    onClick={() => handleSetRatingMode("simple")}
                    className={`type-kicker px-2 py-1 text-[10px] cursor-pointer ${
                      ratingMode === "simple"
                        ? "bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                        : "text-[var(--ink-secondary)]"
                    }`}
                  >
                    ⚡ EINFACH
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetRatingMode("full")}
                    className={`type-kicker border-l border-[var(--ink-primary)] px-2 py-1 text-[10px] cursor-pointer ${
                      ratingMode === "full"
                        ? "bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                        : "text-[var(--ink-secondary)]"
                    }`}
                  >
                    🎚 VOLL
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setStep("setup")}
                  title="Filter & Einstellungen"
                  className="type-kicker inline-flex items-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-2 py-1 text-[10px] text-[var(--ink-primary)] cursor-pointer"
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  FILTER
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  title="Pausieren & Schließen"
                  className="type-kicker inline-flex items-center border border-[var(--ink-primary)] bg-[var(--bg-surface)] p-1 text-[var(--ink-primary)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Card Body — Designed to fit 100% inside mobile screen without scrolling */}
            <div className="flex flex-1 flex-col justify-between overflow-hidden p-3.5 sm:p-6">
              {!currentPiece ? (
                <div className="my-auto border border-[var(--rule-border)] bg-[var(--bg-paper)] p-6 text-center">
                  <div className="type-kicker text-[var(--accent)]">
                    DURCHLAUF ABGESCHLOSSEN
                  </div>
                  <h3 className="font-display mt-1 text-xl font-semibold text-[var(--ink-primary)]">
                    Alle gewählten Stücke sind bewertet!
                  </h3>
                  <p className="mt-1.5 text-xs text-[var(--ink-secondary)]">
                    Du hast {stats.rated} von {stats.total} Stücken bewertet.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setStep("setup")}
                      className="type-kicker border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-4 py-2.5 text-[var(--ink-primary)] cursor-pointer"
                    >
                      ⚙ FILTER ÄNDERN
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="type-kicker bg-[var(--accent)] px-5 py-2.5 text-[var(--accent-ink)] cursor-pointer"
                    >
                      FERTIG & SCHLIESSEN →
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* TOP SECTION: Compact Piece Header & Metadata */}
                  <div className="border border-[var(--rule-border)] bg-[var(--bg-paper)] p-3 sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5">
                        {currentPiece.folderNumber && (
                          <span className="font-mono-tabular border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--ink-primary)]">
                            MAPPE #{currentPiece.folderNumber}
                          </span>
                        )}
                        <span className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[10px] text-[var(--ink-secondary)]">
                          {DIFFICULTY_LABELS[currentPiece.difficulty] ||
                            "Mittel"}
                        </span>
                      </div>
                      {currentPiece.myVote ? (
                        <span className="type-kicker bg-[var(--ink-primary)] px-1.5 py-0.5 text-[10px] text-[var(--bg-surface)]">
                          ✓ BEWERTET (♥{currentPiece.myVote.likeScore} • S
                          {currentPiece.myVote.confidenceScore} • Ü
                          {currentPiece.myVote.practiceNeededScore})
                        </span>
                      ) : (
                        <span className="type-kicker border border-[var(--accent)] px-1.5 py-0.5 text-[10px] text-[var(--accent)]">
                          NOCH OFFEN
                        </span>
                      )}
                    </div>

                    <h3 className="font-display mt-2 truncate text-xl font-semibold leading-tight text-[var(--ink-primary)] sm:text-2xl">
                      {currentPiece.title}
                    </h3>

                    <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-[var(--rule-border)] pt-2 text-[11px]">
                      <div className="truncate bg-[var(--bg-surface)] px-2 py-1 border border-[var(--rule-border)]">
                        <span className="text-[var(--ink-muted)]">Sänger: </span>
                        <strong className="text-[var(--ink-primary)]">
                          {currentPiece.singers || "Instrumental"}
                        </strong>
                      </div>
                      <div className="truncate bg-[var(--bg-surface)] px-2 py-1 border border-[var(--rule-border)]">
                        <span className="text-[var(--ink-muted)]">Typ: </span>
                        <strong className="text-[var(--ink-primary)]">
                          {currentPiece.songType || "—"}
                        </strong>
                      </div>
                      <div className="truncate bg-[var(--bg-surface)] px-2 py-1 border border-[var(--rule-border)]">
                        <span className="text-[var(--ink-muted)]">Solist: </span>
                        <strong className="text-[var(--ink-primary)]">
                          {currentPiece.soloists || "—"}
                        </strong>
                      </div>
                      <div className="truncate bg-[var(--bg-surface)] px-2 py-1 border border-[var(--rule-border)]">
                        <span className="text-[var(--ink-muted)]">Info: </span>
                        <strong className="text-[var(--ink-primary)]">
                          {currentPiece.notes || "—"}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* MIDDLE SECTION: Either SIMPLE (4 Big Buttons) OR FULL (3 Sliders) */}
                  {ratingMode === "simple" ? (
                    <div className="my-auto flex flex-col gap-2 py-2">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
                        <span className="type-kicker text-[var(--ink-secondary)]">
                          1-TAP BEWERTUNG (SPEICHERT & SPRINGT WEITER)
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          disabled={savingId === currentPiece.id}
                          onClick={() =>
                            submitVoteAndAdvance(currentPiece, 4, 5, 1, true)
                          }
                          className="ui-transition flex items-center justify-between border-2 border-[var(--ink-primary)] bg-[var(--bg-surface)] px-4 py-3.5 text-left hover:bg-[var(--ink-primary)] hover:text-[var(--bg-surface)] cursor-pointer"
                        >
                          <div>
                            <div className="type-kicker text-xs font-bold">
                              ✓ SITZT SICHER & GEFÄLLT MIR
                            </div>
                            <div className="font-mono-tabular mt-0.5 text-[11px] opacity-75">
                              Sicherheit 5 • Übungsbedarf 1 • Beliebtheit 4
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0" />
                        </button>

                        <button
                          type="button"
                          disabled={savingId === currentPiece.id}
                          onClick={() =>
                            submitVoteAndAdvance(currentPiece, 3, 3, 3, true)
                          }
                          className="ui-transition flex items-center justify-between border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-4 py-3.5 text-left hover:bg-[var(--ink-primary)] hover:text-[var(--bg-surface)] cursor-pointer"
                        >
                          <div>
                            <div className="type-kicker text-xs font-bold">
                              ~ SOLIDE / MITTELMASS
                            </div>
                            <div className="font-mono-tabular mt-0.5 text-[11px] opacity-75">
                              Sicherheit 3 • Übungsbedarf 3 • Beliebtheit 3
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0" />
                        </button>

                        <button
                          type="button"
                          disabled={savingId === currentPiece.id}
                          onClick={() =>
                            submitVoteAndAdvance(currentPiece, 4, 2, 5, true)
                          }
                          className="ui-transition flex items-center justify-between border-2 border-[var(--accent)] bg-[var(--bg-surface)] px-4 py-3.5 text-left text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] cursor-pointer"
                        >
                          <div>
                            <div className="type-kicker text-xs font-bold">
                              ! BRAUCHT DRINGEND PROBE
                            </div>
                            <div className="font-mono-tabular mt-0.5 text-[11px] opacity-85">
                              Sicherheit 2 • Übungsbedarf 5 • Beliebtheit 4
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0" />
                        </button>

                        <button
                          type="button"
                          disabled={savingId === currentPiece.id}
                          onClick={() => handleSkipPiece(currentPiece)}
                          className="ui-transition flex items-center justify-between border border-[var(--rule-border)] bg-[var(--bg-recessed)] px-4 py-3.5 text-left text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)] cursor-pointer"
                        >
                          <div>
                            <div className="type-kicker text-xs font-bold">
                              ⏭ SPIELE / SINGE ICH NICHT
                            </div>
                            <div className="font-mono-tabular mt-0.5 text-[11px]">
                              Stück überspringen / nicht relevant
                            </div>
                          </div>
                          <SkipForward className="h-4 w-4 shrink-0" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* FULL MODE: 3 Compact 1-5 Scales */
                    <div className="my-auto space-y-2.5 py-1">
                      <ScoreSelector
                        label="1. Beliebtheit (Gefällt mir)"
                        hint="1 = Wenig • 5 = Favorit"
                        value={draftLike}
                        onChange={setDraftLike}
                        disabled={savingId === currentPiece.id}
                      />
                      <ScoreSelector
                        label="2. Eigene Sicherheit"
                        hint="1 = Unsicher • 5 = Sitzt sicher"
                        value={draftConfidence}
                        onChange={setDraftConfidence}
                        disabled={savingId === currentPiece.id}
                      />
                      <ScoreSelector
                        label="3. Übungsbedarf"
                        hint="1 = Kaum • 5 = Dringend proben"
                        value={draftPractice}
                        onChange={setDraftPractice}
                        disabled={savingId === currentPiece.id}
                      />
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
                        className="type-kicker ui-transition mt-1 flex w-full items-center justify-center gap-2 bg-[var(--accent)] px-4 py-3 text-[var(--accent-ink)] disabled:opacity-50 cursor-pointer"
                      >
                        <Check className="h-4 w-4" />
                        {savingId === currentPiece.id
                          ? "SPEICHERT..."
                          : "SPEICHERN & NÄCHSTES STÜCK →"}
                      </button>
                    </div>
                  )}

                  {/* BOTTOM SECTION: Compact Prev / Skip / Next Bar */}
                  <div className="grid grid-cols-3 gap-2 border-t border-[var(--rule-border)] pt-2.5">
                    <button
                      type="button"
                      disabled={safeIndex <= 0}
                      onClick={() =>
                        setCurrentIndex((prev) => Math.max(0, prev - 1))
                      }
                      className="type-kicker inline-flex items-center justify-center gap-1 border border-[var(--rule-border)] bg-[var(--bg-paper)] py-2 text-[11px] text-[var(--ink-secondary)] disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      ZURÜCK
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSkipPiece(currentPiece)}
                      className="type-kicker inline-flex items-center justify-center gap-1 border border-[var(--rule-border)] bg-[var(--bg-paper)] py-2 text-[11px] text-[var(--ink-secondary)] cursor-pointer"
                    >
                      ÜBERSPRINGEN
                      <SkipForward className="h-3 w-3" />
                    </button>

                    <button
                      type="button"
                      disabled={safeIndex >= filteredPieces.length - 1}
                      onClick={() =>
                        setCurrentIndex((prev) =>
                          Math.min(filteredPieces.length - 1, prev + 1)
                        )
                      }
                      className="type-kicker inline-flex items-center justify-center gap-1 border border-[var(--rule-border)] bg-[var(--bg-paper)] py-2 text-[11px] text-[var(--ink-secondary)] disabled:opacity-40 cursor-pointer"
                    >
                      WEITER
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* =========================================================
            STUFE 3: KOMPAKTE SCHNELL-TABELLE (OPTIONAL)
           ========================================================= */}
        {step === "table" && (
          <>
            <div className="flex items-center justify-between gap-2 border-b-2 border-[var(--rule-heavy)] bg-[var(--bg-recessed)] px-3 py-2.5 sm:px-5">
              <span className="type-kicker font-bold text-[var(--ink-primary)]">
                SCHNELL-TABELLE ({filteredPieces.length} STÜCKE)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setStep("cards")}
                  className="type-kicker inline-flex items-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-2.5 py-1 text-[10px] text-[var(--ink-primary)] cursor-pointer"
                >
                  <Layers className="h-3 w-3" />
                  KARTEN
                </button>
                <button
                  type="button"
                  onClick={() => setStep("setup")}
                  className="type-kicker inline-flex items-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-2.5 py-1 text-[10px] text-[var(--ink-primary)] cursor-pointer"
                >
                  <SlidersHorizontal className="h-3 w-3" />
                  FILTER
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="type-kicker inline-flex items-center border border-[var(--ink-primary)] bg-[var(--bg-surface)] p-1 text-[var(--ink-primary)] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-5">
              <div className="overflow-x-auto border border-[var(--rule-border)] bg-[var(--bg-surface)]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b-2 border-[var(--rule-heavy)] bg-[var(--bg-recessed)]">
                      <th className="type-kicker px-2.5 py-2 text-[var(--ink-secondary)]">
                        STÜCK
                      </th>
                      <th className="type-kicker px-2.5 py-2 text-[var(--ink-secondary)]">
                        PRESET
                      </th>
                      <th className="type-kicker px-2.5 py-2 text-[var(--ink-secondary)]">
                        BELIEBT (1–5)
                      </th>
                      <th className="type-kicker px-2.5 py-2 text-[var(--ink-secondary)]">
                        SICHER (1–5)
                      </th>
                      <th className="type-kicker px-2.5 py-2 text-[var(--ink-secondary)]">
                        ÜBUNG (1–5)
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
                            vote
                              ? "bg-[var(--bg-surface)]"
                              : "bg-[var(--bg-paper)]"
                          }
                        >
                          <td className="px-2.5 py-2">
                            <div className="flex items-center gap-1.5">
                              {piece.folderNumber && (
                                <span className="font-mono-tabular border border-[var(--ink-primary)] px-1 py-0.5 text-[10px] font-bold">
                                  #{piece.folderNumber}
                                </span>
                              )}
                              <span className="font-display text-sm font-semibold">
                                {piece.title}
                              </span>
                            </div>
                            <div className="text-[10px] text-[var(--ink-secondary)]">
                              {piece.singers || "Instrumental"}
                              {piece.songType ? ` • ${piece.songType}` : ""}
                            </div>
                          </td>
                          <td className="px-2.5 py-2">
                            <div className="flex gap-1">
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() =>
                                  submitVoteAndAdvance(piece, 4, 5, 1, false)
                                }
                                className="type-kicker border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-1.5 py-1 text-[10px] cursor-pointer"
                              >
                                SITZT
                              </button>
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() =>
                                  submitVoteAndAdvance(piece, 4, 2, 5, false)
                                }
                                className="type-kicker border border-[var(--accent)] bg-[var(--bg-surface)] px-1.5 py-1 text-[10px] text-[var(--accent)] cursor-pointer"
                              >
                                PROBE!
                              </button>
                            </div>
                          </td>
                          <td className="px-2.5 py-2">
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
                                  className={`font-mono-tabular h-6 w-6 border-r border-[var(--rule-border)] last:border-r-0 text-[10px] font-semibold cursor-pointer ${
                                    vote && vote.likeScore === n
                                      ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                                      : "bg-[var(--bg-surface)]"
                                  }`}
                                >
                                  {n}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td className="px-2.5 py-2">
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
                                  className={`font-mono-tabular h-6 w-6 border-r border-[var(--rule-border)] last:border-r-0 text-[10px] font-semibold cursor-pointer ${
                                    vote && vote.confidenceScore === n
                                      ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                                      : "bg-[var(--bg-surface)]"
                                  }`}
                                >
                                  {n}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td className="px-2.5 py-2">
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
                                  className={`font-mono-tabular h-6 w-6 border-r border-[var(--rule-border)] last:border-r-0 text-[10px] font-semibold cursor-pointer ${
                                    vote && vote.practiceNeededScore === n
                                      ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                                      : "bg-[var(--bg-surface)]"
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
