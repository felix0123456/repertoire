"use client";

import React, { useState, useMemo } from "react";
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { PieceItem, SuggestionsData } from "@/types";
import TagInput from "./TagInput";
import ScoreSelector from "./ScoreSelector";

interface RepertoireTabProps {
  pieces: PieceItem[];
  suggestions: SuggestionsData;
  currentUser: { id: string; name: string } | null;
  onRefresh: () => Promise<void>;
  onRequireLogin: () => void;
  onOpenOnboarding?: () => void;
}

const DIFFICULTY_LABELS: Record<string, string> = {
  EASY: "Leicht",
  MEDIUM: "Mittel",
  HARD: "Schwer",
};

const DIFFICULTY_ORDER: Record<string, number> = {
  EASY: 1,
  MEDIUM: 2,
  HARD: 3,
};

export default function RepertoireTab({
  pieces,
  suggestions,
  currentUser,
  onRefresh,
  onRequireLogin,
  onOpenOnboarding,
}: RepertoireTabProps) {
  const [search, setSearch] = useState("");
  const [filterSinger, setFilterSinger] = useState("");
  const [filterSoloist, setFilterSoloist] = useState("");
  const [filterSongType, setFilterSongType] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState("");

  const [sortBy, setSortBy] = useState<
    | "priority"
    | "folderNumber"
    | "like"
    | "practice"
    | "confidence"
    | "difficulty"
    | "singer"
    | "soloist"
    | "songType"
    | "lastPracticed"
    | "title"
  >("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [showModal, setShowModal] = useState(false);
  const [editingPiece, setEditingPiece] = useState<PieceItem | null>(null);
  const [expandedVotesPieceId, setExpandedVotesPieceId] = useState<
    string | null
  >(null);
  const [savingVoteId, setSavingVoteId] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState("");
  const [folderNumber, setFolderNumber] = useState("");
  const [artist, setArtist] = useState("");
  const [singers, setSingers] = useState("");
  const [soloists, setSoloists] = useState("");
  const [songType, setSongType] = useState("");
  const [difficulty, setDifficulty] = useState<"EASY" | "MEDIUM" | "HARD">(
    "MEDIUM"
  );
  const [notes, setNotes] = useState("");
  const [initLike, setInitLike] = useState(4);
  const [initConfidence, setInitConfidence] = useState(3);
  const [initPractice, setInitPractice] = useState(3);
  const [submitting, setSubmitting] = useState(false);

  const openCreateModal = () => {
    setEditingPiece(null);
    setTitle("");
    setFolderNumber("");
    setArtist("");
    setSingers("");
    setSoloists("");
    setSongType("");
    setDifficulty("MEDIUM");
    setNotes("");
    setInitLike(4);
    setInitConfidence(3);
    setInitPractice(3);
    setShowModal(true);
  };

  const openEditModal = (p: PieceItem) => {
    setEditingPiece(p);
    setTitle(p.title);
    setFolderNumber(p.folderNumber || "");
    setArtist(p.artist);
    setSingers(p.singers);
    setSoloists(p.soloists);
    setSongType(p.songType);
    setDifficulty(p.difficulty);
    setNotes(p.notes);
    setShowModal(true);
  };

  const handleSavePiece = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      if (editingPiece) {
        await fetch(`/api/pieces/${editingPiece.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            folderNumber,
            artist,
            singers,
            soloists,
            songType,
            difficulty,
            notes,
          }),
        });
      } else {
        await fetch("/api/pieces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            folderNumber,
            artist,
            singers,
            soloists,
            songType,
            difficulty,
            notes,
            createdBy: currentUser?.name || "",
            userId: currentUser?.id,
            likeScore: initLike,
            confidenceScore: initConfidence,
            practiceNeededScore: initPractice,
          }),
        });
      }
      setShowModal(false);
      await onRefresh();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePiece = async (piece: PieceItem) => {
    if (
      !window.confirm(
        `Möchtest du „${piece.title}“ wirklich aus dem Repertoire löschen?`
      )
    ) {
      return;
    }
    await fetch(`/api/pieces/${piece.id}`, { method: "DELETE" });
    await onRefresh();
  };

  const handleVote = async (
    piece: PieceItem,
    field: "likeScore" | "confidenceScore" | "practiceNeededScore",
    value: number
  ) => {
    if (!currentUser) {
      onRequireLogin();
      return;
    }
    setSavingVoteId(piece.id);
    try {
      const current = piece.myVote || {
        likeScore: 3,
        confidenceScore: 3,
        practiceNeededScore: 3,
      };
      await fetch("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          pieceId: piece.id,
          ...current,
          [field]: value,
        }),
      });
      await onRefresh();
    } finally {
      setSavingVoteId(null);
    }
  };

  const filteredAndSortedPieces = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = pieces.filter((p) => {
      if (q) {
        const hay =
          `${p.title} ${p.folderNumber} ${p.artist} ${p.singers} ${p.soloists} ${p.songType} ${p.notes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (
        filterSinger &&
        !p.singerList.some(
          (s) => s.toLowerCase() === filterSinger.toLowerCase()
        )
      ) {
        return false;
      }
      if (
        filterSoloist &&
        !p.soloistList.some(
          (s) => s.toLowerCase() === filterSoloist.toLowerCase()
        )
      ) {
        return false;
      }
      if (
        filterSongType &&
        p.songType.toLowerCase() !== filterSongType.toLowerCase()
      ) {
        return false;
      }
      if (filterDifficulty && p.difficulty !== filterDifficulty) {
        return false;
      }
      return true;
    });

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "priority":
          cmp = a.priorityScore - b.priorityScore;
          break;
        case "folderNumber":
          cmp = (a.folderNumber || "999999").localeCompare(
            b.folderNumber || "999999",
            "de",
            { numeric: true }
          );
          break;
        case "like":
          cmp = a.avgLike - b.avgLike;
          break;
        case "practice":
          cmp = a.avgPracticeNeeded - b.avgPracticeNeeded;
          break;
        case "confidence":
          cmp = a.avgConfidence - b.avgConfidence;
          break;
        case "difficulty":
          cmp =
            (DIFFICULTY_ORDER[a.difficulty] || 2) -
            (DIFFICULTY_ORDER[b.difficulty] || 2);
          break;
        case "singer":
          cmp = (a.singers || "zzz").localeCompare(b.singers || "zzz", "de");
          break;
        case "soloist":
          cmp = (a.soloists || "zzz").localeCompare(b.soloists || "zzz", "de");
          break;
        case "songType":
          cmp = (a.songType || "zzz").localeCompare(b.songType || "zzz", "de");
          break;
        case "lastPracticed": {
          const tA = a.lastPracticedAt
            ? new Date(a.lastPracticedAt).getTime()
            : 0;
          const tB = b.lastPracticedAt
            ? new Date(b.lastPracticedAt).getTime()
            : 0;
          cmp = tA - tB;
          break;
        }
        case "title":
        default:
          cmp = a.title.localeCompare(b.title, "de");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [
    pieces,
    search,
    filterSinger,
    filterSoloist,
    filterSongType,
    filterDifficulty,
    sortBy,
    sortDir,
  ]);

  return (
    /* Asymmetric 12-Column Grid: Columns 1–4 Sticky Filter Rail, Columns 5–12 Score Ledger */
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      {/* Left Rail: Columns 1–4 */}
      <aside className="lg:col-span-4">
        <div className="sticky top-36 space-y-5 border-t-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-5 border-x border-b border-x-[var(--rule-border)] border-b-[var(--rule-border)]">
          <div className="flex items-baseline justify-between border-b border-[var(--rule-border)] pb-3">
            <div>
              <div className="type-kicker text-[var(--ink-muted)]">
                KATALOG-STEUERUNG
              </div>
              <h2 className="type-section-h2 mt-0.5 text-[var(--ink-primary)]">
                Repertoire-Filter
              </h2>
            </div>
            <span className="font-mono-tabular text-xs font-semibold text-[var(--ink-secondary)]">
              {filteredAndSortedPieces.length} / {pieces.length}
            </span>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={openCreateModal}
              className="type-kicker ui-transition flex w-full items-center justify-center gap-2 bg-[var(--accent)] px-4 py-3 text-[var(--accent-ink)] cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              NEUES STÜCK ANLEGEN
            </button>

            {onOpenOnboarding && pieces.length > 0 && (
              <button
                type="button"
                onClick={onOpenOnboarding}
                className="type-kicker ui-transition flex w-full items-center justify-between border border-[var(--ink-primary)] bg-[var(--bg-recessed)] px-3.5 py-2.5 text-[var(--ink-primary)] hover:bg-[var(--ink-primary)] hover:text-[var(--bg-surface)] cursor-pointer"
              >
                <span>BEWERTUNGS-ONBOARDING</span>
                <span className="font-mono-tabular">
                  {currentUser
                    ? `${pieces.filter((p) => !p.myVote).length} OFFEN`
                    : `${pieces.length} STÜCKE`}
                </span>
              </button>
            )}
          </div>

          {/* Search */}
          <div>
            <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
              Volltextsuche
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Titel, Sänger, Solist, Typ..."
                className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] py-2 pl-9 pr-3 text-sm text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:border-[var(--ink-primary)] focus:outline-none"
              />
            </div>
          </div>

          {/* Sort */}
          <div>
            <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
              Sortierkriterium
            </label>
            <div className="flex gap-1.5">
              <select
                value={sortBy}
                onChange={(e) => {
                  const val = e.target.value as typeof sortBy;
                  setSortBy(val);
                  if (
                    [
                      "title",
                      "folderNumber",
                      "singer",
                      "soloist",
                      "songType",
                    ].includes(val)
                  ) {
                    setSortDir("asc");
                  } else {
                    setSortDir("desc");
                  }
                }}
                className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
              >
                <option value="priority">Proben-Dringlichkeit (Score)</option>
                <option value="folderNumber">Nummer in der Mappe</option>
                <option value="like">Beliebtheit (Favoriten)</option>
                <option value="practice">Übungsbedarf</option>
                <option value="confidence">Sicherheit</option>
                <option value="difficulty">Schwierigkeit</option>
                <option value="singer">Sänger (A–Z)</option>
                <option value="soloist">Solist (A–Z)</option>
                <option value="songType">Song-Typ (A–Z)</option>
                <option value="lastPracticed">Zuletzt geprobt</option>
                <option value="title">Alphabetisch (Titel)</option>
              </select>
              <button
                type="button"
                onClick={() =>
                  setSortDir((d) => (d === "asc" ? "desc" : "asc"))
                }
                title={
                  sortDir === "asc"
                    ? "Aufsteigend sortiert"
                    : "Absteigend sortiert"
                }
                className="font-mono-tabular inline-flex items-center justify-center border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 text-xs font-semibold text-[var(--ink-primary)] hover:border-[var(--ink-primary)] cursor-pointer"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Filter Dropdowns */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                Sänger
              </label>
              <select
                value={filterSinger}
                onChange={(e) => setFilterSinger(e.target.value)}
                className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
              >
                <option value="">Alle Sänger</option>
                {suggestions.singers.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                Solist
              </label>
              <select
                value={filterSoloist}
                onChange={(e) => setFilterSoloist(e.target.value)}
                className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
              >
                <option value="">Alle Solisten</option>
                {suggestions.soloists.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                Song-Typ
              </label>
              <select
                value={filterSongType}
                onChange={(e) => setFilterSongType(e.target.value)}
                className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
              >
                <option value="">Alle Song-Typen</option>
                {suggestions.songTypes.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                Schwierigkeitsgrad
              </label>
              <select
                value={filterDifficulty}
                onChange={(e) => setFilterDifficulty(e.target.value)}
                className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
              >
                <option value="">Alle Stufen</option>
                <option value="EASY">Leicht</option>
                <option value="MEDIUM">Mittel</option>
                <option value="HARD">Schwer</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setSearch("");
              setFilterSinger("");
              setFilterSoloist("");
              setFilterSongType("");
              setFilterDifficulty("");
            }}
            className="type-kicker w-full border border-[var(--rule-border)] bg-[var(--bg-recessed)] py-2 text-center text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)] cursor-pointer"
          >
            FILTER ZURÜCKSETZEN
          </button>
        </div>
      </aside>

      {/* Right Main Ledger: Columns 5–12 */}
      <section className="lg:col-span-8">
        {filteredAndSortedPieces.length === 0 ? (
          <div className="border-t-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-12 text-center border-x border-b border-x-[var(--rule-border)] border-b-[var(--rule-border)]">
            <div className="type-kicker text-[var(--ink-muted)]">
              VERZEICHNIS LEER
            </div>
            <h3 className="type-section-h2 mt-2 text-[var(--ink-primary)]">
              Keine Stücke für diese Auswahl
            </h3>
            <p className="mt-1 text-sm text-[var(--ink-secondary)]">
              Lege ein neues Stück an oder setze die aktiven Filter in der
              linken Spalte zurück.
            </p>
          </div>
        ) : (
          <div className="border-t-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] border-x border-b border-x-[var(--rule-border)] border-b-[var(--rule-border)]">
            {filteredAndSortedPieces.map((piece, idx) => {
              const myVote = piece.myVote;
              const isExpanded = expandedVotesPieceId === piece.id;
              const staggerIdx = Math.min(idx, 8);

              return (
                <article
                  key={piece.id}
                  style={
                    { "--stagger-index": staggerIdx } as React.CSSProperties
                  }
                  className="stagger-item border-b border-[var(--rule-border)] last:border-b-0 p-5 sm:p-6"
                >
                  {/* Top Row: Index Number, Title, Tags, Actions */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono-tabular text-xs font-semibold text-[var(--ink-muted)]">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-baseline gap-2.5">
                          <h3 className="type-piece-h3 text-[var(--ink-primary)]">
                            {piece.title}
                          </h3>
                          {piece.artist && (
                            <span className="text-sm text-[var(--ink-secondary)]">
                              — {piece.artist}
                            </span>
                          )}
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          {piece.folderNumber && (
                            <span className="type-kicker border border-[var(--ink-primary)] bg-[var(--ink-primary)] px-2 py-0.5 text-[var(--bg-surface)]">
                              MAPPE NR. {piece.folderNumber}
                            </span>
                          )}
                          <span className="type-kicker border border-[var(--ink-primary)] bg-[var(--bg-recessed)] px-2 py-0.5 text-[var(--ink-primary)]">
                            {DIFFICULTY_LABELS[piece.difficulty] || "Mittel"}
                          </span>
                          {piece.songType && (
                            <span className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2 py-0.5 text-[var(--ink-secondary)]">
                              TYP: {piece.songType}
                            </span>
                          )}
                          <span className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2 py-0.5 text-[var(--ink-secondary)]">
                            PRIO-SCORE: {piece.priorityScore.toFixed(1)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-start">
                      <button
                        type="button"
                        onClick={() => openEditModal(piece)}
                        className="type-kicker inline-flex items-center gap-1 border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2.5 py-1.5 text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)] cursor-pointer"
                      >
                        <Edit3 className="h-3.5 w-3.5" /> BEARBEITEN
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePiece(piece)}
                        className="border border-[var(--rule-border)] bg-[var(--bg-paper)] p-1.5 text-[var(--ink-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer"
                        title="Stück löschen"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Metadata Grid: Folder Number, Singers, Soloists, Last Practiced */}
                  <div className="mt-4 grid grid-cols-2 gap-px border border-[var(--rule-border)] bg-[var(--rule-border)] sm:grid-cols-4">
                    <div className="bg-[var(--bg-paper)] px-3 py-2">
                      <div className="type-kicker text-[var(--ink-muted)]">
                        NUMMER IN DER MAPPE
                      </div>
                      <div className="font-mono-tabular mt-0.5 text-sm font-semibold text-[var(--ink-primary)]">
                        {piece.folderNumber || "—"}
                      </div>
                    </div>
                    <div className="bg-[var(--bg-paper)] px-3 py-2">
                      <div className="type-kicker text-[var(--ink-muted)]">
                        SÄNGER
                      </div>
                      <div className="mt-0.5 text-sm font-medium text-[var(--ink-primary)]">
                        {piece.singers || "Instrumental / Keine"}
                      </div>
                    </div>
                    <div className="bg-[var(--bg-paper)] px-3 py-2">
                      <div className="type-kicker text-[var(--ink-muted)]">
                        SOLIST
                      </div>
                      <div className="mt-0.5 text-sm font-medium text-[var(--ink-primary)]">
                        {piece.soloists || "—"}
                      </div>
                    </div>
                    <div className="bg-[var(--bg-paper)] px-3 py-2">
                      <div className="type-kicker text-[var(--ink-muted)]">
                        ZULETZT GEPROBT
                      </div>
                      <div className="font-mono-tabular mt-0.5 text-sm font-medium text-[var(--ink-primary)]">
                        {piece.lastPracticedAt
                          ? new Date(piece.lastPracticedAt).toLocaleDateString(
                              "de-DE"
                            )
                          : "Noch nie"}
                      </div>
                    </div>
                  </div>

                  {piece.notes && (
                    <div className="mt-3 border-l-2 border-[var(--ink-primary)] pl-3 text-sm text-[var(--ink-secondary)]">
                      {piece.notes}
                    </div>
                  )}

                  {/* Ensemble Averages vs Personal 1–5 Voting */}
                  <div className="mt-4 grid grid-cols-1 gap-4 border-t border-[var(--rule-border)] pt-4 md:grid-cols-12">
                    {/* Band Averages (Cols 1-4) */}
                    <div className="flex flex-col justify-between border border-[var(--rule-border)] bg-[var(--bg-recessed)] p-3 md:col-span-4">
                      <div className="flex items-center justify-between">
                        <span className="type-kicker text-[var(--ink-secondary)]">
                          BAND-DURCHSCHNITT
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedVotesPieceId(
                              isExpanded ? null : piece.id
                            )
                          }
                          className="type-kicker inline-flex items-center gap-0.5 text-[var(--ink-primary)] underline cursor-pointer"
                        >
                          {piece.voteCount} STIMMEN
                          {isExpanded ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </button>
                      </div>

                      <div className="font-mono-tabular mt-2 grid grid-cols-3 gap-2 text-center">
                        <div className="bg-[var(--bg-surface)] p-1.5 border border-[var(--rule-border)]">
                          <div className="text-[10px] text-[var(--ink-muted)]">
                            GEFÄLLT
                          </div>
                          <div className="text-sm font-bold text-[var(--ink-primary)]">
                            {piece.avgLike.toFixed(1)}
                          </div>
                        </div>
                        <div className="bg-[var(--bg-surface)] p-1.5 border border-[var(--rule-border)]">
                          <div className="text-[10px] text-[var(--ink-muted)]">
                            SICHER
                          </div>
                          <div className="text-sm font-bold text-[var(--ink-primary)]">
                            {piece.avgConfidence.toFixed(1)}
                          </div>
                        </div>
                        <div className="bg-[var(--bg-surface)] p-1.5 border border-[var(--rule-border)]">
                          <div className="text-[10px] text-[var(--ink-muted)]">
                            ÜBUNG
                          </div>
                          <div className="text-sm font-bold text-[var(--ink-primary)]">
                            {piece.avgPracticeNeeded.toFixed(1)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Player's Own 1–5 Controls (Cols 5-12) */}
                    <div className="md:col-span-8">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="type-kicker text-[var(--ink-secondary)]">
                          {currentUser
                            ? `MEINE ABSTIMMUNG (${currentUser.name})`
                            : "MEINE ABSTIMMUNG (BITTE OBEN NAMEN EINGEBEN)"}
                        </span>
                        <span className="font-mono-tabular text-[11px] text-[var(--ink-muted)]">
                          Skala 1 (niedrig) bis 5 (hoch)
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <ScoreSelector
                          label="Gefällt mir"
                          value={myVote?.likeScore ?? 0}
                          onChange={(val) =>
                            handleVote(piece, "likeScore", val)
                          }
                          disabled={savingVoteId === piece.id}
                        />
                        <ScoreSelector
                          label="Sicherheit"
                          value={myVote?.confidenceScore ?? 0}
                          onChange={(val) =>
                            handleVote(piece, "confidenceScore", val)
                          }
                          disabled={savingVoteId === piece.id}
                        />
                        <ScoreSelector
                          label="Übungsbedarf"
                          value={myVote?.practiceNeededScore ?? 0}
                          onChange={(val) =>
                            handleVote(piece, "practiceNeededScore", val)
                          }
                          disabled={savingVoteId === piece.id}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Expanded Player Votes Table */}
                  {isExpanded && (
                    <div className="mt-4 border border-[var(--ink-primary)] bg-[var(--bg-paper)] p-3">
                      <div className="type-kicker mb-2 text-[var(--ink-secondary)]">
                        EINZELBEWERTUNGEN DER SPIELER
                      </div>
                      {piece.votes.length === 0 ? (
                        <p className="text-xs text-[var(--ink-muted)]">
                          Noch keine Einzelstimmen vorhanden.
                        </p>
                      ) : (
                        <div className="divide-y divide-[var(--rule-border)]">
                          {piece.votes.map((v) => (
                            <div
                              key={v.userId}
                              className="flex items-center justify-between py-1.5 text-xs"
                            >
                              <span className="font-semibold text-[var(--ink-primary)]">
                                {v.userName}
                              </span>
                              <div className="font-mono-tabular flex items-center gap-4 text-[var(--ink-secondary)]">
                                <span>Gefällt: {v.likeScore}/5</span>
                                <span>Sicherheit: {v.confidenceScore}/5</span>
                                <span>
                                  Übungsbedarf: {v.practiceNeededScore}/5
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal: Create / Edit Piece */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto border-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-6">
            <div className="type-kicker text-[var(--accent)]">
              REPERTOIRE-EINTRAG
            </div>
            <h2 className="type-section-h2 mt-1 text-[var(--ink-primary)]">
              {editingPiece ? "Stück bearbeiten" : "Neues Stück aufnehmen"}
            </h2>

            <form onSubmit={handleSavePiece} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                <div className="sm:col-span-5">
                  <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                    Titel des Stücks *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="z.B. Valerie"
                    className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                    Nummer in der Mappe
                  </label>
                  <input
                    type="text"
                    value={folderNumber}
                    onChange={(e) => setFolderNumber(e.target.value)}
                    placeholder="z.B. 14 oder A-3"
                    className="font-mono-tabular w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                    Interpret / Komponist
                  </label>
                  <input
                    type="text"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    placeholder="z.B. Amy Winehouse"
                    className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                    Schwierigkeit
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) =>
                      setDifficulty(
                        e.target.value as "EASY" | "MEDIUM" | "HARD"
                      )
                    }
                    className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                  >
                    <option value="EASY">Leicht</option>
                    <option value="MEDIUM">Mittel</option>
                    <option value="HARD">Schwer</option>
                  </select>
                </div>

                <TagInput
                  label="Song-Typ / Stil"
                  placeholder="z.B. Soul, Funk, Ballade, Opener..."
                  value={songType}
                  onChange={setSongType}
                  suggestions={suggestions.songTypes}
                  singleValue
                />
              </div>

              <TagInput
                label="Sänger (Mehrfachnennung möglich)"
                placeholder="Name eingeben + Enter (oder Vorschlag wählen)"
                value={singers}
                onChange={setSingers}
                suggestions={suggestions.singers}
              />

              <TagInput
                label="Solist (Mehrfachnennung möglich)"
                placeholder="Name / Instrument eingeben + Enter"
                value={soloists}
                onChange={setSoloists}
                suggestions={suggestions.soloists}
              />

              <div>
                <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                  Notizen / Tonart / Ablauf
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optionale Hinweise (Tonart, Tempo, Einsätze)..."
                  className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                />
              </div>

              {!editingPiece && currentUser && (
                <div className="border border-[var(--rule-border)] bg-[var(--bg-recessed)] p-3.5">
                  <div className="type-kicker mb-2 text-[var(--ink-secondary)]">
                    START-BEWERTUNG ({currentUser.name})
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <ScoreSelector
                      label="Gefällt mir"
                      value={initLike}
                      onChange={setInitLike}
                    />
                    <ScoreSelector
                      label="Sicherheit"
                      value={initConfidence}
                      onChange={setInitConfidence}
                    />
                    <ScoreSelector
                      label="Übungsbedarf"
                      value={initPractice}
                      onChange={setInitPractice}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-paper)] px-4 py-2.5 text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] cursor-pointer"
                >
                  ABBRECHEN
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="type-kicker bg-[var(--accent)] px-5 py-2.5 text-[var(--accent-ink)] disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? "SPEICHERT..." : "STÜCK SPEICHERN"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
