"use client";

import React, { useState, useMemo } from "react";
import {
  Plus,
  Search,
  Mic,
  Guitar,
  Heart,
  ShieldCheck,
  Flame,
  Calendar,
  Edit3,
  Trash2,
  ArrowUpDown,
  Users,
  Music2,
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

const DIFFICULTY_COLORS: Record<string, string> = {
  EASY: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  MEDIUM: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  HARD: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export default function RepertoireTab({
  pieces,
  suggestions,
  currentUser,
  onRefresh,
  onRequireLogin,
}: RepertoireTabProps) {
  const [search, setSearch] = useState("");
  const [filterSinger, setFilterSinger] = useState("");
  const [filterSoloist, setFilterSoloist] = useState("");
  const [filterSongType, setFilterSongType] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState("");

  const [sortBy, setSortBy] = useState<
    | "priority"
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
      !window.confirm(`Möchtest du „${piece.title}“ wirklich aus dem Repertoire löschen?`)
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
          `${p.title} ${p.artist} ${p.singers} ${p.soloists} ${p.songType} ${p.notes}`.toLowerCase();
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
    <div className="space-y-6">
      {/* Top Action & Filter Bar */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Repertoire durchsuchen (Titel, Sänger, Solist, Song-Typ, Notizen)..."
              className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-md shadow-amber-500/10 transition hover:bg-amber-400 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Neues Stück hinzufügen
          </button>
        </div>

        {/* Filter & Sort Controls */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Sortieren nach
            </label>
            <div className="flex gap-1">
              <select
                value={sortBy}
                onChange={(e) => {
                  const val = e.target.value as typeof sortBy;
                  setSortBy(val);
                  if (
                    ["title", "singer", "soloist", "songType"].includes(val)
                  ) {
                    setSortDir("asc");
                  } else {
                    setSortDir("desc");
                  }
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
              >
                <option value="priority">Proben-Priorität</option>
                <option value="like">Beliebtheit (Favoriten)</option>
                <option value="practice">Übungsbedarf</option>
                <option value="confidence">Sicherheit</option>
                <option value="difficulty">Schwierigkeit</option>
                <option value="singer">Sänger</option>
                <option value="soloist">Solist</option>
                <option value="songType">Song-Typ</option>
                <option value="lastPracticed">Zuletzt geprobt</option>
                <option value="title">Titel (A–Z)</option>
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
                className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-950 px-2 text-slate-300 hover:border-amber-500 hover:text-amber-400 cursor-pointer"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Filter: Sänger
            </label>
            <select
              value={filterSinger}
              onChange={(e) => setFilterSinger(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
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
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Filter: Solist
            </label>
            <select
              value={filterSoloist}
              onChange={(e) => setFilterSoloist(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
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
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Filter: Song-Typ
            </label>
            <select
              value={filterSongType}
              onChange={(e) => setFilterSongType(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
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
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Filter: Schwierigkeit
            </label>
            <select
              value={filterDifficulty}
              onChange={(e) => setFilterDifficulty(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
            >
              <option value="">Alle Stufen</option>
              <option value="EASY">Leicht</option>
              <option value="MEDIUM">Mittel</option>
              <option value="HARD">Schwer</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setFilterSinger("");
                setFilterSoloist("");
                setFilterSongType("");
                setFilterDifficulty("");
              }}
              className="w-full rounded-lg border border-slate-700/80 bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 cursor-pointer"
            >
              Filter zurücksetzen ({filteredAndSortedPieces.length}/
              {pieces.length})
            </button>
          </div>
        </div>
      </div>

      {/* Piece List */}
      {filteredAndSortedPieces.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
          <Music2 className="mx-auto h-10 w-10 text-slate-600" />
          <h3 className="mt-3 text-base font-semibold text-slate-200">
            Keine Stücke gefunden
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Füge das erste Stück zum Repertoire hinzu oder passe deine
            Filterkriterien an.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Stück hinzufügen
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredAndSortedPieces.map((piece) => {
            const myVote = piece.myVote;
            const isExpanded = expandedVotesPieceId === piece.id;

            return (
              <div
                key={piece.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-800/90 bg-slate-900/75 p-5 shadow-md transition hover:border-slate-700"
              >
                <div>
                  {/* Header Row */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-bold text-slate-100">
                          {piece.title}
                        </h3>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                            DIFFICULTY_COLORS[piece.difficulty] ||
                            DIFFICULTY_COLORS.MEDIUM
                          }`}
                        >
                          {DIFFICULTY_LABELS[piece.difficulty] || "Mittel"}
                        </span>
                        {piece.songType && (
                          <span className="rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-0.5 text-[11px] font-medium text-indigo-300">
                            {piece.songType}
                          </span>
                        )}
                      </div>
                      {piece.artist && (
                        <p className="mt-0.5 text-xs text-slate-400">
                          {piece.artist}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span
                        title="Berechneter Proben-Prioritätswert"
                        className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-amber-400"
                      >
                        Prio {piece.priorityScore.toFixed(1)}
                      </span>
                      <button
                        type="button"
                        onClick={() => openEditModal(piece)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 cursor-pointer"
                        title="Stück bearbeiten"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePiece(piece)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/15 hover:text-rose-400 cursor-pointer"
                        title="Stück löschen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Singers, Soloists & Last Practiced */}
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-300">
                    <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950/70 px-2.5 py-1 border border-slate-800">
                      <Mic className="h-3.5 w-3.5 text-amber-400" />
                      <span className="text-slate-400">Sänger:</span>
                      <span className="font-medium text-slate-200">
                        {piece.singers || "Instrumental / Keine"}
                      </span>
                    </div>

                    <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950/70 px-2.5 py-1 border border-slate-800">
                      <Guitar className="h-3.5 w-3.5 text-cyan-400" />
                      <span className="text-slate-400">Solist:</span>
                      <span className="font-medium text-slate-200">
                        {piece.soloists || "–"}
                      </span>
                    </div>

                    <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950/70 px-2.5 py-1 border border-slate-800">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-slate-400">Zuletzt geprobt:</span>
                      <span className="font-medium text-slate-200">
                        {piece.lastPracticedAt
                          ? new Date(piece.lastPracticedAt).toLocaleDateString(
                              "de-DE"
                            )
                          : "Noch nie"}
                      </span>
                    </div>
                  </div>

                  {piece.notes && (
                    <p className="mt-2.5 rounded-lg bg-slate-950/50 px-3 py-1.5 text-xs text-slate-300 border border-slate-800/60">
                      {piece.notes}
                    </p>
                  )}

                  {/* Band Averages */}
                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-950/80 p-3 border border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <Heart className="h-4 w-4 text-amber-400 shrink-0" />
                      <div>
                        <div className="text-[11px] text-slate-400">
                          Ø Beliebtheit
                        </div>
                        <div className="text-sm font-bold text-slate-100">
                          {piece.avgLike.toFixed(1)}{" "}
                          <span className="text-xs font-normal text-slate-500">
                            / 5
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                      <div>
                        <div className="text-[11px] text-slate-400">
                          Ø Sicherheit
                        </div>
                        <div className="text-sm font-bold text-slate-100">
                          {piece.avgConfidence.toFixed(1)}{" "}
                          <span className="text-xs font-normal text-slate-500">
                            / 5
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Flame className="h-4 w-4 text-rose-400 shrink-0" />
                      <div>
                        <div className="text-[11px] text-slate-400">
                          Ø Übungsbedarf
                        </div>
                        <div className="text-sm font-bold text-slate-100">
                          {piece.avgPracticeNeeded.toFixed(1)}{" "}
                          <span className="text-xs font-normal text-slate-500">
                            / 5
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Personal Voting Section */}
                <div className="mt-4 border-t border-slate-800/80 pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">
                      {currentUser
                        ? `Deine Bewertung (${currentUser.name}):`
                        : "Deine Bewertung (bitte oben Namen eingeben):"}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedVotesPieceId(isExpanded ? null : piece.id)
                      }
                      className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-amber-400 cursor-pointer"
                    >
                      <Users className="h-3.5 w-3.5" />
                      {piece.voteCount}{" "}
                      {piece.voteCount === 1 ? "Stimme" : "Stimmen"}
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <ScoreSelector
                      label="Gefällt mir"
                      value={myVote?.likeScore ?? 0}
                      onChange={(val) => handleVote(piece, "likeScore", val)}
                      colorScheme="amber"
                      disabled={savingVoteId === piece.id}
                    />
                    <ScoreSelector
                      label="Sicherheit"
                      value={myVote?.confidenceScore ?? 0}
                      onChange={(val) =>
                        handleVote(piece, "confidenceScore", val)
                      }
                      colorScheme="emerald"
                      disabled={savingVoteId === piece.id}
                    />
                    <ScoreSelector
                      label="Übungsbedarf"
                      value={myVote?.practiceNeededScore ?? 0}
                      onChange={(val) =>
                        handleVote(piece, "practiceNeededScore", val)
                      }
                      colorScheme="rose"
                      disabled={savingVoteId === piece.id}
                    />
                  </div>

                  {/* Expanded Individual Votes */}
                  {isExpanded && (
                    <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/90 p-3">
                      <div className="mb-2 text-xs font-semibold text-slate-400">
                        Einzelbewertungen der Spieler:
                      </div>
                      {piece.votes.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          Noch keine Bewertungen abgegeben.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {piece.votes.map((v) => (
                            <div
                              key={v.userId}
                              className="flex items-center justify-between text-xs text-slate-300"
                            >
                              <span className="font-medium text-slate-200">
                                {v.userName}
                              </span>
                              <div className="flex items-center gap-3">
                                <span className="text-amber-300">
                                  ♥ {v.likeScore}/5
                                </span>
                                <span className="text-emerald-300">
                                  Sicherheit {v.confidenceScore}/5
                                </span>
                                <span className="text-rose-300">
                                  Übung {v.practiceNeededScore}/5
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create / Edit Piece */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-100">
              {editingPiece ? "Stück bearbeiten" : "Neues Stück zum Repertoire"}
            </h2>
            <form onSubmit={handleSavePiece} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Titel *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="z.B. Valerie"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Interpret / Komponist
                  </label>
                  <input
                    type="text"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    placeholder="z.B. Amy Winehouse"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Schwierigkeit
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) =>
                      setDifficulty(
                        e.target.value as "EASY" | "MEDIUM" | "HARD"
                      )
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                  >
                    <option value="EASY">Leicht</option>
                    <option value="MEDIUM">Mittel</option>
                    <option value="HARD">Schwer</option>
                  </select>
                </div>

                <TagInput
                  label="Song-Typ / Stil"
                  placeholder="z.B. Funk, Ballade, Rock, Opener..."
                  value={songType}
                  onChange={setSongType}
                  suggestions={suggestions.songTypes}
                  singleValue
                />
              </div>

              <TagInput
                label="Sänger (Mehrfachauswahl möglich)"
                placeholder="Name eingeben + Enter (oder Vorschlag anklicken)"
                value={singers}
                onChange={setSingers}
                suggestions={suggestions.singers}
              />

              <TagInput
                label="Solist (Mehrfachauswahl möglich)"
                placeholder="Name/Instrument eingeben + Enter"
                value={soloists}
                onChange={setSoloists}
                suggestions={suggestions.soloists}
              />

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Notizen / Tonart / Ablauf
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optionale Hinweise (z.B. Tonart Eb-Dur, kurzes Intro, Tempo 120 BPM)..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              {!editingPiece && currentUser && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
                  <div className="mb-2 text-xs font-semibold text-slate-300">
                    Deine Start-Bewertung ({currentUser.name}):
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <ScoreSelector
                      label="Gefällt mir"
                      value={initLike}
                      onChange={setInitLike}
                      colorScheme="amber"
                    />
                    <ScoreSelector
                      label="Sicherheit"
                      value={initConfidence}
                      onChange={setInitConfidence}
                      colorScheme="emerald"
                    />
                    <ScoreSelector
                      label="Übungsbedarf"
                      value={initPractice}
                      onChange={setInitPractice}
                      colorScheme="rose"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? "Speichert..." : "Speichern"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

