"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Share2,
  Check,
  Play,
  ExternalLink,
} from "lucide-react";
import {
  BIGBAND_INSTRUMENTS,
  BIGBAND_REGISTER_FAMILIES,
  getRegisterFamily,
  InstrumentPracticeStat,
  PieceItem,
  SuggestionsData,
} from "@/types";
import TagInput from "./TagInput";
import ScoreSelector from "./ScoreSelector";
import { buildAppShareUrl, shareOrCopyLink } from "@/lib/share";

interface RepertoireTabProps {
  pieces: PieceItem[];
  suggestions: SuggestionsData;
  currentUser: { id: string; name: string; instrument?: string } | null;
  onRefresh: () => Promise<void>;
  onRequireLogin: () => void;
  onOpenOnboarding?: () => void;
  focusedPieceId?: string | null;
  onClearFocusedPiece?: () => void;
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

function getInstrumentMatchingStat(
  piece: PieceItem,
  instrumentFilter: string
): InstrumentPracticeStat | null {
  if (!instrumentFilter) return null;
  const low = instrumentFilter.toLowerCase();
  const fam = getRegisterFamily(instrumentFilter).toLowerCase();
  const exactMatches = piece.instrumentStats.filter(
    (st) => st.instrument.toLowerCase() === low
  );
  const candidates =
    exactMatches.length > 0
      ? exactMatches
      : piece.instrumentStats.filter(
          (st) =>
            st.registerFamily.toLowerCase() === low ||
            (fam && st.registerFamily.toLowerCase() === fam)
        );
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const scoreA =
      (a.avgPracticeNeeded >= 3.5 || a.isFlaggedFocus ? 100 : 0) +
      (a.isFlaggedFocus ? 10 : 0) +
      a.avgPracticeNeeded;
    const scoreB =
      (b.avgPracticeNeeded >= 3.5 || b.isFlaggedFocus ? 100 : 0) +
      (b.isFlaggedFocus ? 10 : 0) +
      b.avgPracticeNeeded;
    return scoreB - scoreA;
  })[0];
}

function buildInlineEmbedUrl(url: string): string | null {
  const clean = (url || "").trim();
  if (!clean) return null;
  const ytMatch = clean.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/i
  );
  if (ytMatch) {
    return `https://www.youtube.com/embed/${ytMatch[1]}`;
  }
  const spMatch = clean.match(/spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]+)/i);
  if (spMatch) {
    return `https://open.spotify.com/embed/track/${spMatch[1]}?utm_source=generator`;
  }
  return null;
}

export default function RepertoireTab({
  pieces,
  suggestions,
  currentUser,
  onRefresh,
  onRequireLogin,
  onOpenOnboarding,
  focusedPieceId,
  onClearFocusedPiece,
}: RepertoireTabProps) {
  const [search, setSearch] = useState("");
  const [filterSinger, setFilterSinger] = useState("");
  const [filterSoloist, setFilterSoloist] = useState("");
  const [filterSongType, setFilterSongType] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState("");
  const [filterInstrument, setFilterInstrument] = useState("");
  const [filterHighPractice, setFilterHighPractice] = useState(false);
  const [filterHasReference, setFilterHasReference] = useState(false);

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
    | "instrumentPractice"
  >("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [showModal, setShowModal] = useState(false);
  const [editingPiece, setEditingPiece] = useState<PieceItem | null>(null);
  const [expandedVotesPieceId, setExpandedVotesPieceId] = useState<
    string | null
  >(null);
  const [expandedNotesPieceId, setExpandedNotesPieceId] = useState<
    string | null
  >(null);
  const [expandedReferencePieceId, setExpandedReferencePieceId] = useState<
    string | null
  >(null);
  const [focusEditorPieceId, setFocusEditorPieceId] = useState<string | null>(
    null
  );
  const [measureInput, setMeasureInput] = useState("");
  const [measureInstrumentInput, setMeasureInstrumentInput] = useState(
    currentUser?.instrument || "Tutti"
  );
  const [measureNoteText, setMeasureNoteText] = useState("");
  const [savingMeasureNoteId, setSavingMeasureNoteId] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (currentUser?.instrument) {
      setMeasureInstrumentInput(currentUser.instrument);
    }
  }, [currentUser?.instrument]);

  const [savingVoteId, setSavingVoteId] = useState<string | null>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [openMobileVotePieceId, setOpenMobileVotePieceId] = useState<
    string | null
  >(null);
  const [copiedShareKey, setCopiedShareKey] = useState<string | null>(null);
  const [highlightedPieceId, setHighlightedPieceId] = useState<string | null>(
    null
  );
  const lastHandledPieceRef = useRef<string | null>(null);

  // Sync deep-linked piece (?tab=repertoire&piece=...)
  useEffect(() => {
    if (!focusedPieceId) {
      lastHandledPieceRef.current = null;
      return;
    }
    if (lastHandledPieceRef.current === focusedPieceId || pieces.length === 0) {
      return;
    }
    const matched = pieces.find((p) => p.id === focusedPieceId);
    if (!matched) return;

    lastHandledPieceRef.current = focusedPieceId;
    setSearch("");
    setFilterSinger("");
    setFilterSoloist("");
    setFilterSongType("");
    setFilterDifficulty("");
    setHighlightedPieceId(matched.id);
    setOpenMobileVotePieceId(matched.id);

    const timer = setTimeout(() => {
      const el = document.getElementById(`repertoire-piece-${matched.id}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      onClearFocusedPiece?.();
    }, 100);
    return () => clearTimeout(timer);
  }, [focusedPieceId, pieces, onClearFocusedPiece]);

  const handleShareOnboardingLink = async () => {
    const url = buildAppShareUrl({
      tab: "repertoire",
      onboarding: "1",
    });
    const res = await shareOrCopyLink({
      url,
      title: "Repertoire-Abstimmung & Bewertungs-Onboarding",
      text: "Bewerte hier unser Repertoire (Schwierigkeit, Übungsbedarf & Beliebtheit):",
    });
    if (res === "copied" || res === "shared") {
      setCopiedShareKey("__ONBOARDING__");
      setTimeout(() => {
        setCopiedShareKey((prev) => (prev === "__ONBOARDING__" ? null : prev));
      }, 2400);
    }
  };

  const handleSharePieceLink = async (piece: PieceItem) => {
    const url = buildAppShareUrl({
      tab: "repertoire",
      piece: piece.id,
    });
    const res = await shareOrCopyLink({
      url,
      title: `Repertoire-Abstimmung: ${piece.title}`,
      text: `Stimme im Repertoire über „${piece.title}“${
        piece.folderNumber ? ` (Mappe #${piece.folderNumber})` : ""
      } ab:`,
    });
    if (res === "copied" || res === "shared") {
      setCopiedShareKey(piece.id);
      setTimeout(() => {
        setCopiedShareKey((prev) => (prev === piece.id ? null : prev));
      }, 2400);
    }
  };

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
  const [bpmInput, setBpmInput] = useState<string>("");
  const [referenceUrlInput, setReferenceUrlInput] = useState<string>("");
  const [focusInstrumentsInput, setFocusInstrumentsInput] =
    useState<string>("");
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
    setBpmInput("");
    setReferenceUrlInput("");
    setFocusInstrumentsInput("");
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
    setBpmInput(p.bpm > 0 ? String(p.bpm) : "");
    setReferenceUrlInput(p.referenceUrl || "");
    setFocusInstrumentsInput(p.focusInstruments || "");
    setNotes(p.notes);
    setShowModal(true);
  };

  const handleSavePiece = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const parsedBpm = Math.max(
        0,
        Math.min(400, Math.round(Number(bpmInput) || 0))
      );
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
            bpm: parsedBpm,
            referenceUrl: referenceUrlInput.trim(),
            focusInstruments: focusInstrumentsInput.trim(),
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
            bpm: parsedBpm,
            referenceUrl: referenceUrlInput.trim(),
            focusInstruments: focusInstrumentsInput.trim(),
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

  const handleToggleFocusInstrument = async (
    piece: PieceItem,
    instrument: string
  ) => {
    const current = piece.focusInstrumentList;
    const exists = current.some(
      (i) => i.toLowerCase() === instrument.toLowerCase()
    );
    const next = exists
      ? current.filter((i) => i.toLowerCase() !== instrument.toLowerCase())
      : [...current, instrument];
    await fetch(`/api/pieces/${piece.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        focusInstruments: next.join(", "),
      }),
    });
    await onRefresh();
  };

  const handleAddMeasureNote = async (piece: PieceItem) => {
    const cleanNote = measureNoteText.trim();
    if (!cleanNote) return;
    setSavingMeasureNoteId(piece.id);
    try {
      await fetch(`/api/pieces/${piece.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addMeasureNote: {
            measure: measureInput.trim() || "Allgemein",
            instrument: measureInstrumentInput,
            note: cleanNote,
            author: currentUser?.name || "Ensemble",
          },
        }),
      });
      setMeasureInput("");
      setMeasureNoteText("");
      await onRefresh();
    } finally {
      setSavingMeasureNoteId(null);
    }
  };

  const handleRemoveMeasureNote = async (piece: PieceItem, noteId: string) => {
    setSavingMeasureNoteId(piece.id);
    try {
      await fetch(`/api/pieces/${piece.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          removeMeasureNoteId: noteId,
        }),
      });
      await onRefresh();
    } finally {
      setSavingMeasureNoteId(null);
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
          userName: currentUser.name,
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

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (search.trim()) count++;
    if (filterSinger) count++;
    if (filterSoloist) count++;
    if (filterSongType) count++;
    if (filterDifficulty) count++;
    if (filterInstrument) count++;
    if (filterHighPractice) count++;
    if (filterHasReference) count++;
    return count;
  }, [
    search,
    filterSinger,
    filterSoloist,
    filterSongType,
    filterDifficulty,
    filterInstrument,
    filterHighPractice,
    filterHasReference,
  ]);

  const filteredAndSortedPieces = useMemo(() => {
    const q = search.trim().toLowerCase();
    const lowInst = filterInstrument.trim().toLowerCase();
    const famInst = filterInstrument
      ? getRegisterFamily(filterInstrument).toLowerCase()
      : "";

    const isPieceHighNeedForInstrument = (p: PieceItem): boolean => {
      if (!lowInst) return false;
      const st = getInstrumentMatchingStat(p, filterInstrument);
      if (st && (st.avgPracticeNeeded >= 3.5 || st.isFlaggedFocus)) {
        return true;
      }
      return p.focusInstrumentList.some(
        (fi) =>
          fi.toLowerCase() === lowInst ||
          getRegisterFamily(fi).toLowerCase() === lowInst ||
          (famInst && getRegisterFamily(fi).toLowerCase() === famInst)
      );
    };

    const isPieceRelevantForInstrument = (p: PieceItem): boolean => {
      if (!lowInst) return true;
      if (isPieceHighNeedForInstrument(p)) return true;
      const st = getInstrumentMatchingStat(p, filterInstrument);
      const hasMeasureNote = p.measureNotes.some(
        (mn) =>
          mn.instrument.toLowerCase() === lowInst ||
          getRegisterFamily(mn.instrument).toLowerCase() === lowInst ||
          (famInst && getRegisterFamily(mn.instrument).toLowerCase() === famInst)
      );
      const isSoloist = p.soloistList.some(
        (sol) =>
          sol.toLowerCase().includes(lowInst) ||
          (famInst && sol.toLowerCase().includes(famInst))
      );
      return Boolean(st || hasMeasureNote || isSoloist);
    };

    const hasAnyHighNeedMatches = lowInst
      ? pieces.some((p) => isPieceHighNeedForInstrument(p))
      : false;
    const hasAnyRelevantMatches = lowInst
      ? pieces.some((p) => isPieceRelevantForInstrument(p))
      : false;

    const list = pieces.filter((p) => {
      if (q) {
        const measureHay = p.measureNotes
          .map((m) => `${m.measure} ${m.instrument} ${m.note}`)
          .join(" ");
        const hay =
          `${p.title} ${p.folderNumber} ${p.artist} ${p.singers} ${p.soloists} ${p.songType} ${p.notes} ${p.focusInstruments} ${measureHay}`.toLowerCase();
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
      if (filterHighPractice && p.avgPracticeNeeded < 3.5) {
        return false;
      }
      if (filterHasReference && !p.referenceUrl?.trim()) {
        return false;
      }
      if (lowInst) {
        if (hasAnyHighNeedMatches) {
          if (!isPieceHighNeedForInstrument(p)) return false;
        } else if (hasAnyRelevantMatches) {
          if (!isPieceRelevantForInstrument(p)) return false;
        }
      }
      return true;
    });

    list.sort((a, b) => {
      if (lowInst) {
        const stA = getInstrumentMatchingStat(a, filterInstrument);
        const stB = getInstrumentMatchingStat(b, filterInstrument);
        const highA = isPieceHighNeedForInstrument(a) ? 100 : 0;
        const highB = isPieceHighNeedForInstrument(b) ? 100 : 0;
        const scoreA =
          highA + (stA?.isFlaggedFocus ? 10 : 0) + (stA?.avgPracticeNeeded || 0);
        const scoreB =
          highB + (stB?.isFlaggedFocus ? 10 : 0) + (stB?.avgPracticeNeeded || 0);
        if (Math.abs(scoreB - scoreA) > 0.05) {
          return scoreB - scoreA;
        }
      }

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
        case "instrumentPractice":
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
    filterInstrument,
    filterHighPractice,
    filterHasReference,
    sortBy,
    sortDir,
  ]);

  return (
    /* Asymmetric 12-Column Grid: Columns 1–4 Sticky Filter Rail, Columns 5–12 Score Ledger */
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-8">
      {/* Left Rail: Columns 1–4 */}
      <aside className="lg:col-span-4">
        {/* MOBILE COMPACT ACTION & SEARCH BAR (< 768px) */}
        <div className="mb-2 space-y-2 border border-[var(--ink-primary)] bg-[var(--bg-surface)] p-2 md:hidden">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1 min-w-0">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-muted)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Stück, Sänger, Typ, Takt..."
                className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] py-1.5 pl-8 pr-2 text-xs text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:border-[var(--ink-primary)] focus:outline-none"
              />
            </div>

            {onOpenOnboarding && pieces.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={onOpenOnboarding}
                  title="Bewertungs-Onboarding"
                  className="type-kicker shrink-0 border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-2 py-1.5 text-[10px] font-bold text-[var(--ink-primary)] cursor-pointer"
                >
                  ★{" "}
                  {currentUser
                    ? pieces.filter((p) => !p.myVote).length
                    : pieces.length}
                </button>
                <button
                  type="button"
                  onClick={handleShareOnboardingLink}
                  title="Direktlink zur Repertoire-Abstimmung kopieren"
                  className={`type-kicker inline-flex shrink-0 items-center gap-1 border px-2 py-1.5 text-[10px] cursor-pointer ${
                    copiedShareKey === "__ONBOARDING__"
                      ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] font-bold text-[var(--bg-surface)]"
                      : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-primary)]"
                  }`}
                >
                  {copiedShareKey === "__ONBOARDING__" ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Share2 className="h-3 w-3" />
                  )}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={openCreateModal}
              className="type-kicker inline-flex shrink-0 items-center gap-1 bg-[var(--accent)] px-2.5 py-1.5 text-[10px] text-[var(--accent-ink)] cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              NEU
            </button>
          </div>

          {/* Horizontal Scrollable Row of 1-Tap Quick-Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => {
                setFilterInstrument("");
                setFilterHighPractice(false);
                setFilterHasReference(false);
                setSortBy("priority");
                setSortDir("desc");
              }}
              className={`type-kicker shrink-0 border px-2.5 py-1 text-[10px] cursor-pointer ${
                !filterInstrument &&
                !filterHighPractice &&
                !filterHasReference &&
                sortBy === "priority"
                  ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] font-bold text-[var(--bg-surface)]"
                  : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-secondary)]"
              }`}
            >
              Alle ({pieces.length})
            </button>

            {currentUser?.instrument && (
              <button
                type="button"
                onClick={() => {
                  const target = currentUser.instrument!;
                  setFilterInstrument((prev) =>
                    prev === target ? "" : target
                  );
                }}
                className={`type-kicker shrink-0 border px-2.5 py-1 text-[10px] cursor-pointer ${
                  filterInstrument === currentUser.instrument
                    ? "border-[var(--accent)] bg-[var(--accent)] font-bold text-[var(--accent-ink)]"
                    : "border-[var(--ink-primary)] bg-[var(--bg-paper)] text-[var(--ink-primary)]"
                }`}
              >
                🎺 Probebedarf: {currentUser.instrument}
              </button>
            )}

            <button
              type="button"
              onClick={() => setFilterHighPractice((v) => !v)}
              className={`type-kicker shrink-0 border px-2.5 py-1 text-[10px] cursor-pointer ${
                filterHighPractice
                  ? "border-[var(--accent)] bg-[var(--accent)] font-bold text-[var(--accent-ink)]"
                  : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-primary)]"
              }`}
            >
              🔥 Hoher Übungsbedarf
            </button>

            <button
              type="button"
              onClick={() => {
                setSortBy("folderNumber");
                setSortDir("asc");
              }}
              className={`type-kicker shrink-0 border px-2.5 py-1 text-[10px] cursor-pointer ${
                sortBy === "folderNumber"
                  ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] font-bold text-[var(--bg-surface)]"
                  : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-primary)]"
              }`}
            >
              📁 Mappen-Nr. ↑
            </button>

            <button
              type="button"
              onClick={() => setFilterHasReference((v) => !v)}
              className={`type-kicker shrink-0 border px-2.5 py-1 text-[10px] cursor-pointer ${
                filterHasReference
                  ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] font-bold text-[var(--bg-surface)]"
                  : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-primary)]"
              }`}
            >
              🎧 Mit Referenz-Audio
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowMobileFilters((v) => !v)}
            className={`type-kicker flex w-full items-center justify-between border px-3 py-1.5 text-[10px] cursor-pointer ${
              showMobileFilters
                ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                : "border-[var(--rule-border)] bg-[var(--bg-recessed)] text-[var(--ink-primary)]"
            }`}
          >
            <span>
              ⚙ FILTER & SORTIERUNG ({activeFilterCount} aktiv)
            </span>
            {showMobileFilters ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        {/* FULL FILTER PANEL (Collapsible on Mobile, Sticky on Desktop) */}
        <div
          className={`${
            showMobileFilters ? "block" : "hidden"
          } md:block sticky top-36 space-y-5 border-t-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-4 sm:p-5 border-x border-b border-x-[var(--rule-border)] border-b-[var(--rule-border)]`}
        >
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

          <div className="hidden space-y-2 md:block">
            <button
              type="button"
              onClick={openCreateModal}
              className="type-kicker ui-transition flex w-full items-center justify-center gap-2 bg-[var(--accent)] px-4 py-3 text-[var(--accent-ink)] cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              NEUES STÜCK ANLEGEN
            </button>

            {onOpenOnboarding && pieces.length > 0 && (
              <div className="space-y-1.5">
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
                <button
                  type="button"
                  onClick={handleShareOnboardingLink}
                  className={`type-kicker ui-transition flex w-full items-center justify-center gap-1.5 border px-3 py-2 cursor-pointer ${
                    copiedShareKey === "__ONBOARDING__"
                      ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] font-bold text-[var(--bg-surface)]"
                      : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)]"
                  }`}
                >
                  {copiedShareKey === "__ONBOARDING__" ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>ABSTIMMUNGS-LINK KOPIERT!</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="h-3.5 w-3.5" />
                      <span>REPERTOIRE-ABSTIMMUNG TEILEN</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Search (Desktop) */}
          <div className="hidden md:block">
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
                <option value="confidence">Schwierigkeit (Bewertung 1–5)</option>
                <option value="difficulty">Schwierigkeitsstufe (Leicht–Schwer)</option>
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
              <label className="type-kicker mb-1 block text-[var(--accent)]">
                🎺 Probebedarf nach Instrument / Register
              </label>
              <select
                value={filterInstrument}
                onChange={(e) => setFilterInstrument(e.target.value)}
                className="w-full border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-3 py-2 text-sm font-medium text-[var(--ink-primary)] focus:outline-none"
              >
                <option value="">Alle Instrumente & Register</option>
                <optgroup label="Register-Familien">
                  {BIGBAND_REGISTER_FAMILIES.map((reg) => (
                    <option key={`reg-${reg}`} value={reg}>
                      Register: {reg}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Einzelne Instrumente">
                  {BIGBAND_INSTRUMENTS.map((inst) => (
                    <option key={`inst-${inst}`} value={inst}>
                      {inst}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

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
              setFilterInstrument("");
              setFilterHighPractice(false);
              setFilterHasReference(false);
            }}
            className="type-kicker w-full border border-[var(--rule-border)] bg-[var(--bg-recessed)] py-2 text-center text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)] cursor-pointer"
          >
            FILTER ZURÜCKSETZEN
          </button>
        </div>
      </aside>

      {/* Right Main Ledger: Columns 5–12 */}
      <section className="lg:col-span-8">
        {/* Desktop Quick-Filter Chips Row */}
        <div className="mb-3 hidden flex-wrap items-center gap-1.5 border border-[var(--rule-border)] bg-[var(--bg-surface)] px-3 py-2 md:flex">
          <span className="type-kicker mr-1 text-[10px] text-[var(--ink-muted)]">
            SCHNELLFILTER:
          </span>
          <button
            type="button"
            onClick={() => {
              setFilterInstrument("");
              setFilterHighPractice(false);
              setFilterHasReference(false);
              setSortBy("priority");
              setSortDir("desc");
            }}
            className={`type-kicker border px-2.5 py-1 text-[10px] cursor-pointer ${
              !filterInstrument &&
              !filterHighPractice &&
              !filterHasReference &&
              sortBy === "priority"
                ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] font-bold text-[var(--bg-surface)]"
                : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-secondary)]"
            }`}
          >
            Alle ({pieces.length})
          </button>

          {currentUser?.instrument && (
            <button
              type="button"
              onClick={() => {
                const target = currentUser.instrument!;
                setFilterInstrument((prev) =>
                  prev === target ? "" : target
                );
              }}
              className={`type-kicker border px-2.5 py-1 text-[10px] cursor-pointer ${
                filterInstrument === currentUser.instrument
                  ? "border-[var(--accent)] bg-[var(--accent)] font-bold text-[var(--accent-ink)]"
                  : "border-[var(--ink-primary)] bg-[var(--bg-paper)] text-[var(--ink-primary)]"
              }`}
            >
              🎺 Probebedarf: {currentUser.instrument}
            </button>
          )}

          <button
            type="button"
            onClick={() => setFilterHighPractice((v) => !v)}
            className={`type-kicker border px-2.5 py-1 text-[10px] cursor-pointer ${
              filterHighPractice
                ? "border-[var(--accent)] bg-[var(--accent)] font-bold text-[var(--accent-ink)]"
                : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-primary)]"
            }`}
          >
            🔥 Hoher Übungsbedarf
          </button>

          <button
            type="button"
            onClick={() => {
              setSortBy("folderNumber");
              setSortDir("asc");
            }}
            className={`type-kicker border px-2.5 py-1 text-[10px] cursor-pointer ${
              sortBy === "folderNumber"
                ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] font-bold text-[var(--bg-surface)]"
                : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-primary)]"
            }`}
          >
            📁 Mappen-Nr. ↑
          </button>

          <button
            type="button"
            onClick={() => setFilterHasReference((v) => !v)}
            className={`type-kicker border px-2.5 py-1 text-[10px] cursor-pointer ${
              filterHasReference
                ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] font-bold text-[var(--bg-surface)]"
                : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-primary)]"
            }`}
          >
            🎧 Mit Referenz-Audio
          </button>
        </div>

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
              const isMobileVoteOpen = openMobileVotePieceId === piece.id;
              const isHighlighted = highlightedPieceId === piece.id;
              const staggerIdx = Math.min(idx, 8);

              return (
                <article
                  id={`repertoire-piece-${piece.id}`}
                  key={piece.id}
                  style={
                    { "--stagger-index": staggerIdx } as React.CSSProperties
                  }
                  className={`stagger-item border-b border-[var(--rule-border)] last:border-b-0 p-3 sm:p-6 ${
                    isHighlighted ? "bg-[var(--bg-recessed)]/40" : ""
                  }`}
                >
                  {isHighlighted && (
                    <div className="mb-3 flex items-center justify-between gap-2 border border-[var(--accent)] bg-[var(--bg-recessed)] px-3 py-1.5">
                      <span className="type-kicker font-bold text-[var(--accent)]">
                        ● DIREKT-LINK ZUR STÜCK-ABSTIMMUNG: „{piece.title}“
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setHighlightedPieceId(null);
                          onClearFocusedPiece?.();
                        }}
                        className="type-kicker text-[10px] text-[var(--ink-secondary)] underline cursor-pointer"
                      >
                        SCHLIESSEN
                      </button>
                    </div>
                  )}
                  {/* Top Row: Index Number, Title, Tags, Actions */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-baseline gap-2.5 min-w-0">
                      <span className="font-mono-tabular text-xs font-semibold text-[var(--ink-muted)]">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <h3 className="type-piece-h3 text-[var(--ink-primary)]">
                            {piece.title}
                          </h3>
                          {piece.artist && (
                            <span className="hidden text-xs text-[var(--ink-secondary)] sm:inline">
                              — {piece.artist}
                            </span>
                          )}
                        </div>

                        {/* Compact Mobile Inline Meta (< 640px) */}
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--ink-secondary)] sm:hidden">
                          {piece.folderNumber && (
                            <span className="font-mono-tabular border border-[var(--ink-primary)] bg-[var(--ink-primary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--bg-surface)]">
                              #{piece.folderNumber}
                            </span>
                          )}
                          {piece.bpm > 0 && (
                            <span className="font-mono-tabular border border-[var(--ink-primary)] bg-[var(--bg-recessed)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--ink-primary)]">
                              ♩ {piece.bpm} BPM
                            </span>
                          )}
                          <span className="font-semibold text-[var(--ink-primary)]">
                            {piece.singers || "Instr."}
                          </span>
                          {piece.songType && <span>• {piece.songType}</span>}
                          {piece.soloists && (
                            <span>• Solo: {piece.soloists}</span>
                          )}
                          <span className="font-mono-tabular text-[10px] text-[var(--ink-muted)]">
                            • Prio {piece.priorityScore.toFixed(1)}
                          </span>
                        </div>

                        {/* Desktop Tags (>= 640px) */}
                        <div className="mt-1.5 hidden flex-wrap items-center gap-2 sm:flex">
                          {piece.folderNumber && (
                            <span className="type-kicker border border-[var(--ink-primary)] bg-[var(--ink-primary)] px-2 py-0.5 text-[var(--bg-surface)]">
                              MAPPE NR. {piece.folderNumber}
                            </span>
                          )}
                          {piece.bpm > 0 && (
                            <span className="font-mono-tabular border border-[var(--ink-primary)] bg-[var(--bg-recessed)] px-2 py-0.5 text-xs font-bold text-[var(--ink-primary)]">
                              ♩ {piece.bpm} BPM
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

                    <div className="flex shrink-0 items-center gap-1">
                      {/* Mobile Toggle Vote Button (< 768px) */}
                      <button
                        type="button"
                        onClick={() =>
                          setOpenMobileVotePieceId(
                            isMobileVoteOpen ? null : piece.id
                          )
                        }
                        className={`type-kicker inline-flex items-center gap-1 border px-2 py-1 text-[10px] md:hidden cursor-pointer ${
                          myVote
                            ? "border-[var(--ink-primary)] bg-[var(--bg-recessed)] text-[var(--ink-primary)]"
                            : "border-[var(--accent)] bg-[var(--bg-surface)] text-[var(--accent)]"
                        }`}
                      >
                        {myVote
                          ? `♥${myVote.likeScore} Schw.${myVote.confidenceScore} Ü${myVote.practiceNeededScore}`
                          : "BEWERTEN"}
                        {isMobileVoteOpen ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSharePieceLink(piece)}
                        className={`type-kicker inline-flex items-center gap-1 border px-2 py-1 cursor-pointer ${
                          copiedShareKey === piece.id
                            ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] font-bold text-[var(--bg-surface)]"
                            : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)]"
                        }`}
                        title="Direktlink zur Abstimmung für dieses Stück kopieren"
                      >
                        {copiedShareKey === piece.id ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">KOPIERT!</span>
                          </>
                        ) : (
                          <>
                            <Share2 className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">TEILEN</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditModal(piece)}
                        className="type-kicker inline-flex items-center gap-1 border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2 py-1 text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)] cursor-pointer"
                        title="Stück bearbeiten"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">BEARBEITEN</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePiece(piece)}
                        className="border border-[var(--rule-border)] bg-[var(--bg-paper)] p-1 text-[var(--ink-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer"
                        title="Stück löschen"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Metadata Grid: Hidden on mobile unless expanded, visible on >= 640px */}
                  <div className="mt-4 hidden grid-cols-2 gap-px border border-[var(--rule-border)] bg-[var(--rule-border)] sm:grid sm:grid-cols-4">
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
                    <div className="mt-2 hidden border-l-2 border-[var(--ink-primary)] pl-3 text-sm text-[var(--ink-secondary)] sm:block">
                      {piece.notes}
                    </div>
                  )}

                  {/* Instrument Practice Need Badges + Reference Audio + Measure Notes Bar */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--rule-border)] pt-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="type-kicker text-[10px] text-[var(--ink-muted)]">
                        REGISTER-BEDARF:
                      </span>
                      {piece.instrumentStats.map((st) => {
                        const isFilteredMatch =
                          Boolean(filterInstrument) &&
                          (st.instrument.toLowerCase() ===
                            filterInstrument.toLowerCase() ||
                            st.registerFamily.toLowerCase() ===
                              filterInstrument.toLowerCase() ||
                            st.registerFamily.toLowerCase() ===
                              getRegisterFamily(filterInstrument).toLowerCase());
                        const isHighNeed =
                          st.avgPracticeNeeded >= 3.5 || st.isFlaggedFocus;

                        return (
                          <button
                            key={st.instrument}
                            type="button"
                            onClick={() =>
                              setFilterInstrument((prev) =>
                                prev === st.instrument ? "" : st.instrument
                              )
                            }
                            title={`Nach ${st.instrument} filtern`}
                            className={`font-mono-tabular inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] cursor-pointer ${
                              isFilteredMatch
                                ? "border-2 border-[var(--accent)] bg-[var(--accent)] font-bold text-[var(--accent-ink)]"
                                : isHighNeed
                                ? "border-[var(--accent)] bg-[var(--bg-paper)] font-semibold text-[var(--accent)]"
                                : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-secondary)]"
                            }`}
                          >
                            <span>🎺 {st.instrument}:</span>
                            {st.voteCount > 0 ? (
                              <span>
                                Ø {st.avgPracticeNeeded.toFixed(1)} (
                                {st.voteCount})
                              </span>
                            ) : (
                              <span>Fokus</span>
                            )}
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() =>
                          setFocusEditorPieceId(
                            focusEditorPieceId === piece.id ? null : piece.id
                          )
                        }
                        className="type-kicker border border-dashed border-[var(--rule-border)] bg-[var(--bg-paper)] px-2 py-0.5 text-[10px] text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)] cursor-pointer"
                      >
                        + Instrumenten-Fokus
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {piece.referenceUrl && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedReferencePieceId(
                                expandedReferencePieceId === piece.id
                                  ? null
                                  : piece.id
                              )
                            }
                            className={`type-kicker inline-flex items-center gap-1 border px-2.5 py-1 text-[10px] cursor-pointer ${
                              expandedReferencePieceId === piece.id
                                ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] font-bold text-[var(--bg-surface)]"
                                : "border-[var(--ink-primary)] bg-[var(--bg-recessed)] font-semibold text-[var(--ink-primary)]"
                            }`}
                          >
                            <Play className="h-3 w-3" />
                            <span>▶ REFERENZ-AUFNAHME</span>
                          </button>
                          <a
                            href={piece.referenceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Referenz-Link in neuem Tab öffnen"
                            className="type-kicker inline-flex items-center border border-[var(--rule-border)] bg-[var(--bg-paper)] p-1 text-[var(--ink-secondary)] hover:border-[var(--ink-primary)]"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedNotesPieceId(
                            expandedNotesPieceId === piece.id ? null : piece.id
                          )
                        }
                        className={`type-kicker inline-flex items-center gap-1 border px-2.5 py-1 text-[10px] cursor-pointer ${
                          expandedNotesPieceId === piece.id ||
                          piece.measureNotes.length > 0
                            ? "border-[var(--ink-primary)] bg-[var(--bg-paper)] font-semibold text-[var(--ink-primary)]"
                            : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-secondary)]"
                        }`}
                      >
                        <span>
                          📌 TAKT-NOTIZEN & STELLEN ({piece.measureNotes.length})
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Quick Inline Instrument Focus Toggle Popover */}
                  {focusEditorPieceId === piece.id && (
                    <div className="mt-2.5 border border-[var(--ink-primary)] bg-[var(--bg-recessed)] p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="type-kicker text-[10px] text-[var(--ink-primary)]">
                          REGISTER / INSTRUMENTE MIT BESONDEREM PROBEBEDARF MARKIEREN:
                        </span>
                        <button
                          type="button"
                          onClick={() => setFocusEditorPieceId(null)}
                          className="type-kicker text-[10px] text-[var(--ink-secondary)] underline cursor-pointer"
                        >
                          FERTIG
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          ...BIGBAND_REGISTER_FAMILIES,
                          ...BIGBAND_INSTRUMENTS.filter(
                            (i) =>
                              !(
                                BIGBAND_REGISTER_FAMILIES as readonly string[]
                              ).includes(i)
                          ),
                        ].map((inst) => {
                          const active = piece.focusInstrumentList.some(
                            (fi) => fi.toLowerCase() === inst.toLowerCase()
                          );
                          return (
                            <button
                              key={inst}
                              type="button"
                              onClick={() =>
                                handleToggleFocusInstrument(piece, inst)
                              }
                              className={`type-kicker border px-2 py-1 text-[10px] cursor-pointer ${
                                active
                                  ? "border-[var(--accent)] bg-[var(--accent)] font-bold text-[var(--accent-ink)]"
                                  : "border-[var(--rule-border)] bg-[var(--bg-surface)] text-[var(--ink-primary)]"
                              }`}
                            >
                              {active ? "✓ " : "+ "}
                              {inst}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Inline Reference Audio / Video Player */}
                  {expandedReferencePieceId === piece.id &&
                    piece.referenceUrl && (
                      <div className="mt-2.5 border border-[var(--ink-primary)] bg-[var(--bg-recessed)] p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="type-kicker text-[10px] text-[var(--ink-primary)]">
                            REFERENZ-AUFNAHME: {piece.title}
                          </span>
                          <a
                            href={piece.referenceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="type-kicker inline-flex items-center gap-1 text-[10px] text-[var(--accent)] underline"
                          >
                            DIREKTLINK ÖFFNEN <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        {buildInlineEmbedUrl(piece.referenceUrl) ? (
                          <div className="overflow-hidden border border-[var(--rule-heavy)] bg-black">
                            <iframe
                              src={buildInlineEmbedUrl(piece.referenceUrl)!}
                              title={`Referenz ${piece.title}`}
                              width="100%"
                              height={
                                piece.referenceUrl.includes("spotify")
                                  ? "152"
                                  : "240"
                              }
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              className="border-0"
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-[var(--ink-secondary)]">
                            Externer Link:{" "}
                            <a
                              href={piece.referenceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline"
                            >
                              {piece.referenceUrl}
                            </a>
                          </p>
                        )}
                      </div>
                    )}

                  {/* Expandable Section: Measure Notes & Stellen (Takt-Notizen) */}
                  {expandedNotesPieceId === piece.id && (
                    <div className="mt-2.5 border border-[var(--ink-primary)] bg-[var(--bg-paper)] p-3">
                      <div className="type-kicker mb-2 text-[var(--ink-primary)]">
                        📌 TAKT-NOTIZEN & SCHWIERIGE STELLEN ({piece.title})
                      </div>
                      {piece.measureNotes.length === 0 ? (
                        <p className="mb-2 text-xs text-[var(--ink-muted)]">
                          Noch keine Takt-Notizen hinterlegt (z. B. „Takt 48–64 ·
                          Posaune: Kurz absetzen auf 2+“).
                        </p>
                      ) : (
                        <div className="mb-3 divide-y divide-[var(--rule-border)] border border-[var(--rule-border)] bg-[var(--bg-surface)]">
                          {piece.measureNotes.map((mn) => (
                            <div
                              key={mn.id}
                              className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                            >
                              <div>
                                <span className="font-mono-tabular font-bold text-[var(--ink-primary)]">
                                  {mn.measure}
                                </span>
                                {mn.instrument && (
                                  <span className="type-kicker mx-1.5 border border-[var(--ink-primary)] bg-[var(--bg-recessed)] px-1.5 py-0.5 text-[10px] text-[var(--ink-primary)]">
                                    {mn.instrument}
                                  </span>
                                )}
                                <span className="text-[var(--ink-primary)]">
                                  {mn.note}
                                </span>
                                {mn.author && (
                                  <span className="ml-2 text-[10px] text-[var(--ink-muted)]">
                                    ({mn.author})
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                disabled={savingMeasureNoteId === piece.id}
                                onClick={() =>
                                  handleRemoveMeasureNote(piece, mn.id)
                                }
                                title="Takt-Notiz entfernen"
                                className="text-[var(--ink-muted)] hover:text-[var(--accent)] cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleAddMeasureNote(piece);
                        }}
                        className="grid grid-cols-1 gap-2 sm:grid-cols-12"
                      >
                        <input
                          type="text"
                          value={measureInput}
                          onChange={(e) => setMeasureInput(e.target.value)}
                          placeholder="Takt / Stelle (z.B. Takt 48–64)"
                          className="border border-[var(--rule-border)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--ink-primary)] sm:col-span-3"
                        />
                        <select
                          value={measureInstrumentInput}
                          onChange={(e) =>
                            setMeasureInstrumentInput(e.target.value)
                          }
                          className="border border-[var(--rule-border)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--ink-primary)] sm:col-span-3"
                        >
                          <option value="Tutti">Tutti (Alle)</option>
                          {BIGBAND_REGISTER_FAMILIES.map((reg) => (
                            <option key={`mreg-${reg}`} value={reg}>
                              Register: {reg}
                            </option>
                          ))}
                          {BIGBAND_INSTRUMENTS.map((inst) => (
                            <option key={`minst-${inst}`} value={inst}>
                              {inst}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={measureNoteText}
                          onChange={(e) => setMeasureNoteText(e.target.value)}
                          placeholder="Hinweis (z.B. Kurz absetzen auf 2+, Phrasierung)..."
                          className="border border-[var(--rule-border)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--ink-primary)] sm:col-span-4"
                        />
                        <button
                          type="submit"
                          disabled={
                            savingMeasureNoteId === piece.id ||
                            !measureNoteText.trim()
                          }
                          className="type-kicker bg-[var(--ink-primary)] px-3 py-1.5 text-[10px] font-bold text-[var(--bg-surface)] disabled:opacity-40 sm:col-span-2 cursor-pointer"
                        >
                          + STELLE
                        </button>
                      </form>
                    </div>
                  )}

                  {/* Ensemble Averages vs Personal 1–5 Voting (Collapsible on Mobile, Visible on Desktop) */}
                  <div
                    className={`${
                      isMobileVoteOpen ? "grid" : "hidden"
                    } mt-3 grid-cols-1 gap-3 border-t border-[var(--rule-border)] pt-3 md:mt-4 md:grid md:grid-cols-12 md:gap-4 md:pt-4`}
                  >
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
                            SCHWIERIG
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
                          label="Schwierigkeit"
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
                                {v.userInstrument && (
                                  <span className="type-kicker ml-1.5 border border-[var(--rule-border)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[10px] text-[var(--ink-secondary)]">
                                    🎺 {v.userInstrument}
                                  </span>
                                )}
                              </span>
                              <div className="font-mono-tabular flex items-center gap-4 text-[var(--ink-secondary)]">
                                <span>Gefällt: {v.likeScore}/5</span>
                                <span>Schwierigkeit: {v.confidenceScore}/5</span>
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

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                <div className="sm:col-span-4">
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

                <div className="sm:col-span-3">
                  <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                    Ziel-Tempo (BPM)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={400}
                    value={bpmInput}
                    onChange={(e) => setBpmInput(e.target.value)}
                    placeholder="z.B. 160"
                    className="font-mono-tabular w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-5">
                  <TagInput
                    label="Song-Typ / Stil"
                    placeholder="z.B. Soul, Funk, Swing..."
                    value={songType}
                    onChange={setSongType}
                    suggestions={suggestions.songTypes}
                    singleValue
                  />
                </div>
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

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                    Referenz-Aufnahme (YouTube / Spotify Link)
                  </label>
                  <input
                    type="url"
                    value={referenceUrlInput}
                    onChange={(e) => setReferenceUrlInput(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                    Instrumenten-Fokus (Register mit Probebedarf)
                  </label>
                  <input
                    type="text"
                    value={focusInstrumentsInput}
                    onChange={(e) => setFocusInstrumentsInput(e.target.value)}
                    placeholder="z.B. Posaune, Saxophon"
                    className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                  />
                </div>
              </div>

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
                      label="Schwierigkeit"
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
