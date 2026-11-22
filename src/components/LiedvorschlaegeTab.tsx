"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import {
  Flame,
  ThumbsUp,
  ThumbsDown,
  SkipForward,
  RotateCcw,
  Plus,
  Play,
  Pause,
  Volume2,
  VolumeX,
  ExternalLink,
  Check,
  X,
  Search,
  BarChart3,
  Layers,
  Film,
  Image as ImageIcon,
  Sparkles,
  Trash2,
  Edit3,
  MessageSquare,
  ListMusic,
  ArrowRight,
  Music,
  RefreshCw,
} from "lucide-react";
import {
  ProposalDecision,
  ResolvedTrackMetadata,
  SongProposalItem,
  SuggestionsData,
} from "@/types";

interface LiedvorschlaegeTabProps {
  proposals: SongProposalItem[];
  suggestions: SuggestionsData;
  currentUser: { id: string; name: string } | null;
  onRefresh: () => Promise<void>;
  onRequireLogin: () => void;
}

function formatSecondsToMmSs(sec: number): string {
  const s = Math.max(0, Math.round(sec || 0));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem.toString().padStart(2, "0")}`;
}

function parseMmSsToSeconds(val: string): number {
  const trimmed = val.trim();
  if (!trimmed) return 0;
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":").map((p) => Number(p));
    if (parts.some((n) => Number.isNaN(n))) return 0;
    if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1]);
    if (parts.length === 3)
      return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }
  const n = Number(trimmed.replace(/[^\d]/g, ""));
  return Number.isNaN(n) ? 0 : Math.max(0, n);
}

export default function LiedvorschlaegeTab({
  proposals,
  suggestions,
  currentUser,
  onRefresh,
  onRequireLogin,
}: LiedvorschlaegeTabProps) {
  // Sub-view mode: "swipe" (Tinder card deck) or "results" (Leaderboard & Evaluation)
  const [subTab, setSubTab] = useState<"swipe" | "results">("swipe");

  // Deck filtering & session skip state
  const [deckScope, setDeckScope] = useState<"open" | "all">("open");
  const [platformFilter, setPlatformFilter] = useState<
    "ALL" | "YOUTUBE" | "SPOTIFY"
  >("ALL");
  const [skippedIds, setSkippedIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // Undo stack: stores proposalIds voted in this session
  const [voteHistory, setVoteHistory] = useState<
    Array<{
      proposalId: string;
      previousDecision: ProposalDecision | null;
      previousComment: string;
    }>
  >([]);

  // Card comment draft
  const [cardComment, setCardComment] = useState<string>("");
  const [submittingVote, setSubmittingVote] = useState<boolean>(false);

  // Drag / Swipe Gesture State
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [exitDirection, setExitDirection] = useState<
    "left" | "right" | "up" | null
  >(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  // Background Audio & Video Player State
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showVideoEmbed, setShowVideoEmbed] = useState<boolean>(false);
  const [playerReloadKey, setPlayerReloadKey] = useState<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytIframeRef = useRef<HTMLIFrameElement | null>(null);

  // Results / Evaluation Tab State
  const [sortBy, setSortBy] = useState<
    "score" | "approval" | "super" | "votes" | "newest"
  >("score");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "open" | "transferred"
  >("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [inlineCommentDraft, setInlineCommentDraft] = useState<string>("");

  // Add / Import Modal State
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [urlInput, setUrlInput] = useState<string>("");
  const [resolvingUrl, setResolvingUrl] = useState<boolean>(false);
  const [resolveError, setResolveError] = useState<string>("");
  const [importMode, setImportMode] = useState<"single" | "playlist">("single");
  const [hasPlaylistOption, setHasPlaylistOption] = useState<boolean>(false);
  const [playlistTitle, setPlaylistTitle] = useState<string>("");
  const [resolvedTracks, setResolvedTracks] = useState<ResolvedTrackMetadata[]>(
    []
  );
  const [selectedTrackIndices, setSelectedTrackIndices] = useState<number[]>(
    []
  );

  // Single-track editable fields in Add Modal
  const [draftTitle, setDraftTitle] = useState<string>("");
  const [draftArtist, setDraftArtist] = useState<string>("");
  const [draftPlatform, setDraftPlatform] = useState<"YOUTUBE" | "SPOTIFY">(
    "YOUTUBE"
  );
  const [draftExternalId, setDraftExternalId] = useState<string>("");
  const [draftSourceUrl, setDraftSourceUrl] = useState<string>("");
  const [draftEmbedUrl, setDraftEmbedUrl] = useState<string>("");
  const [draftThumbnailUrl, setDraftThumbnailUrl] = useState<string>("");
  const [draftPreviewAudioUrl, setDraftPreviewAudioUrl] = useState<string>("");
  const [draftStartTimeStr, setDraftStartTimeStr] = useState<string>("0:00");
  const [draftNotes, setDraftNotes] = useState<string>("");
  const [draftProposedBy, setDraftProposedBy] = useState<string>("");
  const [draftAutoVote, setDraftAutoVote] = useState<"SUPER" | "YES" | "NONE">(
    "YES"
  );
  const [savingProposal, setSavingProposal] = useState<boolean>(false);

  // Edit Existing Proposal Modal State
  const [editingProposal, setEditingProposal] =
    useState<SongProposalItem | null>(null);
  const [editTitle, setEditTitle] = useState<string>("");
  const [editArtist, setEditArtist] = useState<string>("");
  const [editStartTimeStr, setEditStartTimeStr] = useState<string>("0:00");
  const [editNotes, setEditNotes] = useState<string>("");

  // Promote to Repertoire Modal State
  const [promotingProposal, setPromotingProposal] =
    useState<SongProposalItem | null>(null);
  const [promoteFolderNumber, setPromoteFolderNumber] = useState<string>("");
  const [promoteSingers, setPromoteSingers] = useState<string>("");
  const [promoteSoloists, setPromoteSoloists] = useState<string>("");
  const [promoteSongType, setPromoteSongType] = useState<string>("");
  const [promoteDifficulty, setPromoteDifficulty] = useState<
    "EASY" | "MEDIUM" | "HARD"
  >("MEDIUM");
  const [promoteNotes, setPromoteNotes] = useState<string>("");
  const [promotingLoading, setPromotingLoading] = useState<boolean>(false);

  // Counts
  const unvotedCount = useMemo(
    () => proposals.filter((p) => !p.myVote && !p.transferredPieceId).length,
    [proposals]
  );

  // Filtered deck for Swipe mode
  const swipeDeck = useMemo(() => {
    return proposals.filter((p) => {
      if (platformFilter !== "ALL" && p.platform !== platformFilter) {
        return false;
      }
      if (deckScope === "open") {
        if (p.myVote) return false;
        if (skippedIds.includes(p.id)) return false;
      }
      return true;
    });
  }, [proposals, platformFilter, deckScope, skippedIds]);

  const safeIndex =
    swipeDeck.length === 0 ? 0 : Math.min(currentIndex, swipeDeck.length);
  const activeCard = swipeDeck[safeIndex] || null;
  const nextCard = swipeDeck[safeIndex + 1] || null;
  const isAnyModalOpen = Boolean(
    showAddModal || editingProposal || promotingProposal
  );

  // Sync comment field when activeCard changes
  useEffect(() => {
    if (!activeCard) {
      setCardComment("");
      return;
    }
    setCardComment(activeCard.myVote?.comment || "");
    setDragOffset({ x: 0, y: 0 });
    setExitDirection(null);
  }, [activeCard?.id]);

  // Control HTML5 Audio Preview when activeCard changes in Swipe tab
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (
      subTab !== "swipe" ||
      isAnyModalOpen ||
      showVideoEmbed ||
      !activeCard ||
      !activeCard.previewAudioUrl
    ) {
      audio.pause();
      audio.removeAttribute("src");
      return;
    }

    // If Spotify track with previewAudioUrl and video embed is not overriding
    audio.src = activeCard.previewAudioUrl;
    audio.muted = isMuted;
    audio.currentTime = Math.min(25, Math.max(0, activeCard.startSeconds || 0));

    if (isPlaying) {
      audio.play().catch(() => {
        // Browser autoplay policy fallback
      });
    } else {
      audio.pause();
    }
  }, [
    subTab,
    isAnyModalOpen,
    showVideoEmbed,
    activeCard?.id,
    activeCard?.previewAudioUrl,
    activeCard?.startSeconds,
    playerReloadKey,
  ]);

  // Sync Play/Pause & Mute to HTML5 audio OR YouTube IFrame postMessage
  useEffect(() => {
    const shouldPlay = isPlaying && subTab === "swipe" && !isAnyModalOpen;
    const audio = audioRef.current;
    if (
      audio &&
      activeCard?.previewAudioUrl &&
      subTab === "swipe" &&
      !showVideoEmbed
    ) {
      audio.muted = isMuted;
      if (shouldPlay) {
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    }

    const iframe = ytIframeRef.current;
    if (
      iframe &&
      iframe.contentWindow &&
      activeCard?.platform === "YOUTUBE" &&
      subTab === "swipe"
    ) {
      const cmd = shouldPlay ? "playVideo" : "pauseVideo";
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: cmd, args: [] }),
        "*"
      );
      const muteCmd = isMuted ? "mute" : "unMute";
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: muteCmd, args: [] }),
        "*"
      );
    }
  }, [
    isPlaying,
    isMuted,
    showVideoEmbed,
    isAnyModalOpen,
    activeCard?.id,
    activeCard?.platform,
    subTab,
  ]);

  const handleRestartFromStartSeconds = () => {
    if (!activeCard) return;
    setIsPlaying(true);
    if (activeCard.previewAudioUrl && !showVideoEmbed && audioRef.current) {
      audioRef.current.currentTime = Math.min(
        25,
        Math.max(0, activeCard.startSeconds || 0)
      );
      audioRef.current.play().catch(() => {});
    } else if (
      activeCard.platform === "YOUTUBE" &&
      ytIframeRef.current?.contentWindow
    ) {
      ytIframeRef.current.contentWindow.postMessage(
        JSON.stringify({
          event: "command",
          func: "seekTo",
          args: [activeCard.startSeconds || 0, true],
        }),
        "*"
      );
      ytIframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: "playVideo", args: [] }),
        "*"
      );
    } else {
      setPlayerReloadKey((k) => k + 1);
    }
  };

  // Cast vote from Swipe Card
  const handleCastSwipeVote = useCallback(
    async (decision: ProposalDecision) => {
      if (!activeCard || submittingVote) return;
      if (!currentUser) {
        onRequireLogin();
        return;
      }

      const direction =
        decision === "YES" ? "right" : decision === "NO" ? "left" : "up";
      setExitDirection(direction);
      setSubmittingVote(true);

      const prevDecision = activeCard.myVote?.decision || null;
      const prevComment = activeCard.myVote?.comment || "";
      const targetId = activeCard.id;
      const commentToSave = cardComment.trim();

      try {
        await fetch("/api/proposals/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposalId: targetId,
            userId: currentUser.id,
            userName: currentUser.name,
            decision,
            comment: commentToSave,
          }),
        });

        setVoteHistory((prev) => [
          ...prev,
          {
            proposalId: targetId,
            previousDecision: prevDecision,
            previousComment: prevComment,
          },
        ]);

        if (skippedIds.includes(targetId)) {
          setSkippedIds((prev) => prev.filter((id) => id !== targetId));
        }

        await onRefresh();

        if (deckScope === "all") {
          setCurrentIndex((prev) => Math.min(prev + 1, swipeDeck.length));
        }
      } finally {
        setSubmittingVote(false);
        setExitDirection(null);
        setDragOffset({ x: 0, y: 0 });
      }
    },
    [
      activeCard,
      submittingVote,
      currentUser,
      onRequireLogin,
      cardComment,
      skippedIds,
      onRefresh,
      deckScope,
      swipeDeck.length,
    ]
  );

  // Skip card without voting
  const handleSkipCard = useCallback(() => {
    if (!activeCard) return;
    if (deckScope === "open") {
      setSkippedIds((prev) =>
        prev.includes(activeCard.id) ? prev : [...prev, activeCard.id]
      );
    } else {
      setCurrentIndex((prev) => Math.min(prev + 1, swipeDeck.length));
    }
    setDragOffset({ x: 0, y: 0 });
  }, [activeCard, deckScope, swipeDeck.length]);

  // Undo last vote
  const handleUndoLastVote = useCallback(async () => {
    if (voteHistory.length === 0 || !currentUser || submittingVote) return;
    const last = voteHistory[voteHistory.length - 1];
    setSubmittingVote(true);
    try {
      await fetch("/api/proposals/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalId: last.proposalId,
          userId: currentUser.id,
          userName: currentUser.name,
          decision: last.previousDecision ?? "UNDO",
          comment: last.previousComment,
        }),
      });
      setVoteHistory((prev) => prev.slice(0, -1));
      setSkippedIds((prev) => prev.filter((id) => id !== last.proposalId));
      await onRefresh();
      if (deckScope === "all") {
        const idx = swipeDeck.findIndex((p) => p.id === last.proposalId);
        setCurrentIndex((prev) => (idx >= 0 ? idx : Math.max(0, prev - 1)));
      } else {
        setCurrentIndex(0);
      }
    } finally {
      setSubmittingVote(false);
    }
  }, [
    voteHistory,
    currentUser,
    submittingVote,
    onRefresh,
    deckScope,
    swipeDeck,
  ]);

  // Keyboard shortcuts on Desktop when in Swipe view
  useEffect(() => {
    if (subTab !== "swipe" || showAddModal || editingProposal || promotingProposal)
      return;

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.key === "ArrowRight") {
        e.preventDefault();
        handleCastSwipeVote("YES");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleCastSwipeVote("NO");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        handleCastSwipeVote("SUPER");
      } else if (e.key === " ") {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === "Backspace" && voteHistory.length > 0) {
        e.preventDefault();
        handleUndoLastVote();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    subTab,
    showAddModal,
    editingProposal,
    promotingProposal,
    handleCastSwipeVote,
    handleUndoLastVote,
    voteHistory.length,
  ]);

  // Pointer Drag Handlers for Tinder Swipe Card
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (
      target.closest("button") ||
      target.closest("input") ||
      target.closest("textarea") ||
      target.closest("a") ||
      target.closest("iframe")
    ) {
      return;
    }
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setDragOffset({ x: dx, y: dy });
  };

  const handlePointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    dragStartRef.current = null;

    const { x, y } = dragOffset;
    const SWIPE_THRESHOLD = 75;

    if (y < -SWIPE_THRESHOLD && Math.abs(y) > Math.abs(x)) {
      handleCastSwipeVote("SUPER");
    } else if (x > SWIPE_THRESHOLD) {
      handleCastSwipeVote("YES");
    } else if (x < -SWIPE_THRESHOLD) {
      handleCastSwipeVote("NO");
    } else {
      setDragOffset({ x: 0, y: 0 });
    }
  };

  // Active Swipe Stamp calculation
  const swipeStamp = useMemo(() => {
    const { x, y } = dragOffset;
    if (y < -45 && Math.abs(y) > Math.abs(x)) {
      return {
        label: "FAVORIT! 🔥",
        colorClass:
          "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]",
      };
    }
    if (x > 45) {
      return {
        label: "JA — GEFÄLLT MIR 👍",
        colorClass:
          "border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-surface)]",
      };
    }
    if (x < -45) {
      return {
        label: "NEIN — PASST NICHT 👎",
        colorClass:
          "border-[var(--accent)] bg-[var(--bg-surface)] text-[var(--accent)]",
      };
    }
    return null;
  }, [dragOffset]);

  // ===========================================================================
  // ADD / RESOLVE URL LOGIC (SINGLE TRACK & PLAYLIST BULK IMPORT)
  // ===========================================================================
  const openAddProposalModal = () => {
    setUrlInput("");
    setResolveError("");
    setImportMode("single");
    setHasPlaylistOption(false);
    setPlaylistTitle("");
    setResolvedTracks([]);
    setSelectedTrackIndices([]);
    setDraftTitle("");
    setDraftArtist("");
    setDraftPlatform("YOUTUBE");
    setDraftExternalId("");
    setDraftSourceUrl("");
    setDraftEmbedUrl("");
    setDraftThumbnailUrl("");
    setDraftPreviewAudioUrl("");
    setDraftStartTimeStr("0:00");
    setDraftNotes("");
    setDraftProposedBy(currentUser?.name || "");
    setDraftAutoVote("YES");
    setShowAddModal(true);
  };

  const applySingleResolvedTrack = (track: ResolvedTrackMetadata) => {
    setDraftTitle(track.title || "");
    setDraftArtist(track.artist || "");
    setDraftPlatform(track.platform);
    setDraftExternalId(track.externalId || "");
    setDraftSourceUrl(track.sourceUrl || urlInput.trim());
    setDraftEmbedUrl(track.embedUrl || "");
    setDraftThumbnailUrl(track.thumbnailUrl || "");
    setDraftPreviewAudioUrl(track.previewAudioUrl || "");
    setDraftStartTimeStr(formatSecondsToMmSs(track.startSeconds || 0));
  };

  const handleResolveUrl = async (overrideUrl?: string) => {
    const targetUrl = (overrideUrl ?? urlInput).trim();
    if (!targetUrl) return;

    setResolvingUrl(true);
    setResolveError("");

    try {
      const res = await fetch("/api/proposals/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });

      const data = await res.json();
      if (!res.ok) {
        setResolveError(
          data.error || "Link konnte nicht automatisch ausgelesen werden."
        );
        return;
      }

      if (data.kind === "playlist" && Array.isArray(data.tracks)) {
        setImportMode("playlist");
        setPlaylistTitle(data.playlistTitle || "Playlist");
        setResolvedTracks(data.tracks);
        // Pre-select all tracks that don't already exist
        const newIndices = (data.tracks as ResolvedTrackMetadata[])
          .map((t, idx) => (!t.alreadyExists ? idx : -1))
          .filter((idx) => idx >= 0);
        setSelectedTrackIndices(
          newIndices.length > 0
            ? newIndices
            : data.tracks.map((_: unknown, idx: number) => idx)
        );
        setHasPlaylistOption(false);
      } else if (data.track) {
        setImportMode("single");
        applySingleResolvedTrack(data.track);
        if (data.hasPlaylistOption && Array.isArray(data.tracks)) {
          setHasPlaylistOption(true);
          setPlaylistTitle(data.playlistTitle || "YouTube Playlist");
          setResolvedTracks(data.tracks);
          const newIndices = (data.tracks as ResolvedTrackMetadata[])
            .map((t, idx) => (!t.alreadyExists ? idx : -1))
            .filter((idx) => idx >= 0);
          setSelectedTrackIndices(
            newIndices.length > 0
              ? newIndices
              : data.tracks.map((_: unknown, idx: number) => idx)
          );
        } else {
          setHasPlaylistOption(false);
        }
      }
    } catch {
      setResolveError("Netzwerkfehler beim Abrufen der Link-Vorschau.");
    } finally {
      setResolvingUrl(false);
    }
  };

  const handleSaveProposalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingProposal) return;

    if (importMode === "playlist") {
      const chosen = selectedTrackIndices
        .map((idx) => resolvedTracks[idx])
        .filter(Boolean);
      if (chosen.length === 0) return;

      setSavingProposal(true);
      try {
        const res = await fetch("/api/proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: chosen,
            notes: draftNotes.trim(),
            proposedBy:
              draftProposedBy.trim() || currentUser?.name || "Ensemble",
            userId: currentUser?.id,
            userName: currentUser?.name,
            autoVoteDecision:
              draftAutoVote === "NONE" ? undefined : draftAutoVote,
            skipDuplicates: true,
          }),
        });
        if (res.ok) {
          await onRefresh();
          setShowAddModal(false);
        }
      } finally {
        setSavingProposal(false);
      }
      return;
    }

    // Single mode
    const title = draftTitle.trim();
    const sourceUrl = (draftSourceUrl || urlInput).trim();
    if (!title || !sourceUrl) {
      setResolveError("Bitte gib einen Link und einen Liedtitel an.");
      return;
    }

    setSavingProposal(true);
    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          artist: draftArtist.trim(),
          platform: draftPlatform,
          externalId: draftExternalId,
          sourceUrl,
          embedUrl: draftEmbedUrl,
          thumbnailUrl: draftThumbnailUrl,
          previewAudioUrl: draftPreviewAudioUrl,
          startSeconds: parseMmSsToSeconds(draftStartTimeStr),
          notes: draftNotes.trim(),
          proposedBy:
            draftProposedBy.trim() || currentUser?.name || "Ensemble",
          userId: currentUser?.id,
          userName: currentUser?.name,
          autoVoteDecision:
            draftAutoVote === "NONE" ? undefined : draftAutoVote,
          skipDuplicates: false,
        }),
      });
      if (res.ok) {
        await onRefresh();
        setShowAddModal(false);
      }
    } finally {
      setSavingProposal(false);
    }
  };

  // ===========================================================================
  // LEADERBOARD / RESULTS ACTIONS
  // ===========================================================================
  const sortedResults = useMemo(() => {
    const filtered = proposals.filter((p) => {
      if (statusFilter === "open" && p.transferredPieceId) return false;
      if (statusFilter === "transferred" && !p.transferredPieceId) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const commentsText = p.votes.map((v) => v.comment).join(" ");
        const hay =
          `${p.title} ${p.artist} ${p.proposedBy} ${p.notes} ${commentsText}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "score") {
        if (b.popularityScore !== a.popularityScore)
          return b.popularityScore - a.popularityScore;
        if (b.approvalPercent !== a.approvalPercent)
          return b.approvalPercent - a.approvalPercent;
        return b.totalVotes - a.totalVotes;
      }
      if (sortBy === "approval") {
        if (b.approvalPercent !== a.approvalPercent)
          return b.approvalPercent - a.approvalPercent;
        return b.totalVotes - a.totalVotes;
      }
      if (sortBy === "super") {
        if (b.superCount !== a.superCount) return b.superCount - a.superCount;
        return b.popularityScore - a.popularityScore;
      }
      if (sortBy === "votes") {
        if (b.totalVotes !== a.totalVotes) return b.totalVotes - a.totalVotes;
        return b.popularityScore - a.popularityScore;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [proposals, statusFilter, searchQuery, sortBy]);

  const handleInlineVote = async (
    proposal: SongProposalItem,
    decision: ProposalDecision
  ) => {
    if (!currentUser) {
      onRequireLogin();
      return;
    }
    const isSame = proposal.myVote?.decision === decision;
    await fetch("/api/proposals/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposalId: proposal.id,
        userId: currentUser.id,
        userName: currentUser.name,
        decision: isSame ? "UNDO" : decision,
      }),
    });
    await onRefresh();
  };

  const handleSaveInlineComment = async (proposal: SongProposalItem) => {
    if (!currentUser) {
      onRequireLogin();
      return;
    }
    const decision = proposal.myVote?.decision || "YES";
    await fetch("/api/proposals/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposalId: proposal.id,
        userId: currentUser.id,
        userName: currentUser.name,
        decision,
        comment: inlineCommentDraft.trim(),
      }),
    });
    setEditingCommentId(null);
    await onRefresh();
  };

  const handleDeleteProposal = async (proposal: SongProposalItem) => {
    if (
      !window.confirm(`Liedvorschlag „${proposal.title}“ wirklich löschen?`)
    ) {
      return;
    }
    await fetch(`/api/proposals?id=${encodeURIComponent(proposal.id)}`, {
      method: "DELETE",
    });
    await onRefresh();
  };

  const openEditProposalModal = (proposal: SongProposalItem) => {
    setEditingProposal(proposal);
    setEditTitle(proposal.title);
    setEditArtist(proposal.artist);
    setEditStartTimeStr(formatSecondsToMmSs(proposal.startSeconds));
    setEditNotes(proposal.notes);
  };

  const handleSaveEditProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProposal) return;
    await fetch("/api/proposals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingProposal.id,
        title: editTitle.trim(),
        artist: editArtist.trim(),
        startSeconds: parseMmSsToSeconds(editStartTimeStr),
        notes: editNotes.trim(),
      }),
    });
    setEditingProposal(null);
    await onRefresh();
  };

  const openPromoteModal = (proposal: SongProposalItem) => {
    setPromotingProposal(proposal);
    setPromoteFolderNumber("");
    setPromoteSingers("");
    setPromoteSoloists("");
    setPromoteSongType("");
    setPromoteDifficulty("MEDIUM");
    setPromoteNotes(proposal.notes || "");
  };

  const handlePromoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promotingProposal || promotingLoading) return;
    setPromotingLoading(true);
    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "promoteToRepertoire",
          proposalId: promotingProposal.id,
          folderNumber: promoteFolderNumber.trim(),
          singers: promoteSingers.trim(),
          soloists: promoteSoloists.trim(),
          songType: promoteSongType.trim(),
          difficulty: promoteDifficulty,
          notes: promoteNotes.trim(),
          createdBy: currentUser?.name || promotingProposal.proposedBy,
        }),
      });
      if (res.ok) {
        setPromotingProposal(null);
        await onRefresh();
      }
    } finally {
      setPromotingLoading(false);
    }
  };

  // Build YouTube Embed URL for active card
  const activeYouTubeEmbedUrl = useMemo(() => {
    if (!activeCard || activeCard.platform !== "YOUTUBE") return "";
    const vid = activeCard.externalId;
    if (!vid) return activeCard.embedUrl;
    const params = new URLSearchParams({
      enablejsapi: "1",
      autoplay: isPlaying ? "1" : "0",
      mute: isMuted ? "1" : "0",
      playsinline: "1",
      rel: "0",
      start: String(Math.max(0, activeCard.startSeconds || 0)),
    });
    return `https://www.youtube.com/embed/${vid}?${params.toString()}`;
  }, [
    activeCard?.id,
    activeCard?.platform,
    activeCard?.externalId,
    activeCard?.embedUrl,
    activeCard?.startSeconds,
    playerReloadKey,
  ]);

  return (
    <div className="space-y-4">
      {/* Hidden HTML5 Audio Player for direct MP3 Previews (Spotify) */}
      <audio ref={audioRef} loop className="hidden" />

      {/* =====================================================================
          TOP SUB-NAVIGATION BAR (SWIPE DECK vs. LEADERBOARD + ADD BUTTON)
         ===================================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-2.5 sm:px-4 sm:py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setActivePreviewId(null);
              setSubTab("swipe");
            }}
            className={`type-kicker ui-transition inline-flex items-center gap-1.5 border px-3 py-2 text-xs cursor-pointer ${
              subTab === "swipe"
                ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] font-bold text-[var(--bg-surface)]"
                : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-secondary)] hover:border-[var(--ink-primary)]"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>SWIPE-ABSTIMMUNG</span>
            <span
              className={`font-mono-tabular px-1.5 py-0.5 text-[10px] ${
                subTab === "swipe"
                  ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "bg-[var(--bg-recessed)] text-[var(--ink-primary)]"
              }`}
            >
              {unvotedCount} OFFEN
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab("results")}
            className={`type-kicker ui-transition inline-flex items-center gap-1.5 border px-3 py-2 text-xs cursor-pointer ${
              subTab === "results"
                ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] font-bold text-[var(--bg-surface)]"
                : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-secondary)] hover:border-[var(--ink-primary)]"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>AUSWERTUNG & RANGLISTE</span>
            <span className="font-mono-tabular bg-[var(--bg-recessed)] px-1.5 py-0.5 text-[10px] text-[var(--ink-primary)]">
              {proposals.length}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={openAddProposalModal}
          className="type-kicker ui-transition inline-flex items-center gap-1.5 bg-[var(--accent)] px-3.5 py-2 text-xs font-bold text-[var(--accent-ink)] cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>LIED / PLAYLIST VORSCHLAGEN</span>
        </button>
      </div>

      {/* =====================================================================
          SUB-TAB 1: TINDER-STYLE SWIPE DECK (ZERO-SCROLL VIEWPORT LAYOUT)
         ===================================================================== */}
      {subTab === "swipe" && (
        <div className="mx-auto max-w-xl">
          {/* Deck Filter & Undo Status Bar */}
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border border-[var(--rule-border)] bg-[var(--bg-surface)] px-3 py-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setDeckScope("open");
                  setCurrentIndex(0);
                }}
                className={`type-kicker px-2 py-1 text-[10px] cursor-pointer ${
                  deckScope === "open"
                    ? "bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                    : "bg-[var(--bg-paper)] text-[var(--ink-secondary)]"
                }`}
              >
                OFFEN ({unvotedCount})
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeckScope("all");
                  setCurrentIndex(0);
                }}
                className={`type-kicker px-2 py-1 text-[10px] cursor-pointer ${
                  deckScope === "all"
                    ? "bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                    : "bg-[var(--bg-paper)] text-[var(--ink-secondary)]"
                }`}
              >
                ALLE ({proposals.length})
              </button>

              <span className="text-[var(--rule-border)]">|</span>

              {(["ALL", "YOUTUBE", "SPOTIFY"] as const).map((pf) => (
                <button
                  key={pf}
                  type="button"
                  onClick={() => {
                    setPlatformFilter(pf);
                    setCurrentIndex(0);
                  }}
                  className={`type-kicker px-2 py-1 text-[10px] cursor-pointer ${
                    platformFilter === pf
                      ? "border border-[var(--ink-primary)] bg-[var(--bg-recessed)] font-bold text-[var(--ink-primary)]"
                      : "text-[var(--ink-muted)]"
                  }`}
                >
                  {pf === "ALL" ? "ALLE" : pf}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {voteHistory.length > 0 && (
                <button
                  type="button"
                  onClick={handleUndoLastVote}
                  disabled={submittingVote}
                  title="Letzte Bewertung rückgängig machen"
                  className="type-kicker inline-flex items-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-2 py-1 text-[10px] text-[var(--ink-primary)] hover:bg-[var(--ink-primary)] hover:text-[var(--bg-surface)] cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  RÜCKGÄNGIG
                </button>
              )}
              <span className="font-mono-tabular text-xs font-bold text-[var(--ink-secondary)]">
                {swipeDeck.length > 0 && activeCard
                  ? `${safeIndex + 1} / ${swipeDeck.length}`
                  : "0 / 0"}
              </span>
            </div>
          </div>

          {/* Empty Deck State */}
          {!activeCard ? (
            <div className="border-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-8 text-center">
              <div className="type-kicker text-[var(--accent)]">
                {proposals.length === 0
                  ? "NOCH KEINE LIEDVORSCHLÄGE"
                  : "ALLE KARTEN DURCHGESEHEN"}
              </div>
              <h3 className="font-display mt-2 text-2xl font-semibold text-[var(--ink-primary)]">
                {proposals.length === 0
                  ? "Schlage das erste neue Lied vor!"
                  : "Du hast alle offenen Vorschläge bewertet!"}
              </h3>
              <p className="mx-auto mt-2 max-w-md text-xs text-[var(--ink-secondary)]">
                {proposals.length === 0
                  ? "Füge einen YouTube- oder Spotify-Link (oder eine ganze Playlist) ein, damit alle Mitspieler im Tinder-Stil darüber abstimmen können."
                  : "Schau dir jetzt die Live-Rangliste an oder füge weitere Lieder von YouTube oder Spotify hinzu."}
              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                {proposals.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSubTab("results")}
                    className="type-kicker inline-flex items-center gap-1.5 border-2 border-[var(--ink-primary)] bg-[var(--ink-primary)] px-4 py-2.5 text-xs font-bold text-[var(--bg-surface)] cursor-pointer"
                  >
                    <BarChart3 className="h-4 w-4" />
                    ZUR AUSWERTUNG & RANGLISTE →
                  </button>
                )}
                {skippedIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSkippedIds([]);
                      setCurrentIndex(0);
                    }}
                    className="type-kicker border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-4 py-2.5 text-xs text-[var(--ink-primary)] cursor-pointer"
                  >
                    ÜBERSPRUNGENE ZEIGEN ({skippedIds.length})
                  </button>
                )}
                {proposals.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeckScope("all");
                      setSkippedIds([]);
                      setCurrentIndex(0);
                    }}
                    className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-paper)] px-4 py-2.5 text-xs text-[var(--ink-secondary)] cursor-pointer"
                  >
                    NOCHMAL ALLE DURCHGEHEN ({proposals.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={openAddProposalModal}
                  className="type-kicker inline-flex items-center gap-1.5 bg-[var(--accent)] px-4 py-2.5 text-xs font-bold text-[var(--accent-ink)] cursor-pointer"
                >
                  <Plus className="h-4 w-4" />+ LIED / PLAYLIST VORSCHLAGEN
                </button>
              </div>
            </div>
          ) : (
            /* ACTIVE SWIPE CARD STACK */
            <div className="relative select-none">
              {/* Background Next Card Preview (Stack Depth Effect) */}
              {nextCard && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-3 top-2 bottom-0 -z-10 translate-y-2 border-2 border-[var(--rule-border)] bg-[var(--bg-recessed)] opacity-70"
                />
              )}

              {/* Foreground Draggable Card */}
              <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                style={{
                  transform: exitDirection
                    ? exitDirection === "right"
                      ? "translate3d(420px, 20px, 0) rotate(16deg)"
                      : exitDirection === "left"
                      ? "translate3d(-420px, 20px, 0) rotate(-16deg)"
                      : "translate3d(0, -420px, 0)"
                    : `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0) rotate(${
                        dragOffset.x * 0.045
                      }deg)`,
                  transition: isDragging
                    ? "none"
                    : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
                  touchAction: "pan-y",
                }}
                className="relative overflow-hidden border-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)]"
              >
                {/* Dynamic Swipe Stamp Overlay (JA / NEIN / FAVORIT) */}
                {swipeStamp && (
                  <div className="pointer-events-none absolute inset-x-0 top-6 z-30 flex justify-center">
                    <span
                      className={`type-kicker border-2 px-4 py-1.5 text-sm font-bold tracking-widest shadow-sm ${swipeStamp.colorClass}`}
                    >
                      {swipeStamp.label}
                    </span>
                  </div>
                )}

                {/* COVER / VIDEO STAGE */}
                <div className="relative aspect-[16/9] w-full overflow-hidden border-b border-[var(--rule-border)] bg-[var(--ink-primary)] sm:aspect-[16/9]">
                  {/* Top Badges on Cover */}
                  <div className="pointer-events-none absolute inset-x-2.5 top-2.5 z-20 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono-tabular border border-[var(--rule-heavy)] bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] font-bold text-[var(--ink-primary)]">
                        {activeCard.platform === "SPOTIFY"
                          ? "● SPOTIFY"
                          : "▶ YOUTUBE"}
                      </span>
                      {activeCard.startSeconds > 0 && (
                        <span className="font-mono-tabular bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold text-[var(--accent-ink)]">
                          START {formatSecondsToMmSs(activeCard.startSeconds)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {activeCard.myVote && (
                        <span className="type-kicker bg-[var(--ink-primary)] px-2 py-0.5 text-[10px] text-[var(--bg-surface)]">
                          DEINE STIMME:{" "}
                          {activeCard.myVote.decision === "SUPER"
                            ? "🔥 FAVORIT"
                            : activeCard.myVote.decision === "YES"
                            ? "👍 JA"
                            : "👎 NEIN"}
                        </span>
                      )}
                      <span className="font-mono-tabular border border-[var(--rule-heavy)] bg-[var(--bg-surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ink-primary)]">
                        {activeCard.totalVotes > 0
                          ? `${activeCard.approvalPercent}% (${activeCard.totalVotes} St.)`
                          : "NEU"}
                      </span>
                    </div>
                  </div>

                  {/* Cover Image (Default Swipable View) */}
                  {!showVideoEmbed && (
                    <div className="relative z-10 flex h-full w-full items-center justify-center bg-[var(--ink-primary)] cursor-grab active:cursor-grabbing">
                      {activeCard.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={activeCard.thumbnailUrl}
                          alt={activeCard.title}
                          draggable={false}
                          className="h-full w-full object-cover select-none"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-[var(--bg-surface)] opacity-60">
                          <Music className="h-12 w-12" />
                          <span className="type-kicker mt-2">
                            KEIN COVER VERFÜGBAR
                          </span>
                        </div>
                      )}

                      {/* Subtle swipe hint pill at bottom of cover */}
                      <div className="pointer-events-none absolute inset-x-2.5 bottom-2.5 flex items-center justify-between text-[10px]">
                        <span className="font-mono-tabular bg-black/75 px-2 py-0.5 text-white">
                          ← NEIN • ↑ FAVORIT • JA →
                        </span>
                        <span className="font-mono-tabular bg-black/75 px-2 py-0.5 text-white">
                          {activeCard.platform === "SPOTIFY" &&
                          !activeCard.previewAudioUrl
                            ? "🎬 FÜR AUDIO: PLAYER ZEIGEN"
                            : isPlaying && !isMuted
                            ? "♫ SPIELT IM HINTERGRUND"
                            : "⏸ PAUSIERT / STUMM"}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* YouTube IFrame: kept mounted at full size for background audio; visible when showVideoEmbed is true */}
                  {activeCard.platform === "YOUTUBE" && activeYouTubeEmbedUrl && (
                    <iframe
                      ref={ytIframeRef}
                      key={`${activeCard.id}-${playerReloadKey}`}
                      src={activeYouTubeEmbedUrl}
                      title={activeCard.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className={
                        showVideoEmbed
                          ? "relative z-10 h-full w-full border-0"
                          : "pointer-events-none absolute inset-0 z-0 h-full w-full border-0 opacity-0"
                      }
                    />
                  )}

                  {/* Spotify Embed IFrame: shown when showVideoEmbed is true */}
                  {activeCard.platform === "SPOTIFY" && showVideoEmbed && (
                    <div className="relative z-10 flex h-full w-full flex-col items-center justify-center bg-[#141311] p-3 pt-9">
                      <iframe
                        key={`${activeCard.id}-${playerReloadKey}`}
                        src={
                          activeCard.embedUrl ||
                          `https://open.spotify.com/embed/track/${activeCard.externalId}?utm_source=generator`
                        }
                        title={activeCard.title}
                        width="100%"
                        height="152"
                        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                        className="border-0"
                      />
                    </div>
                  )}
                </div>

                {/* COMPACT AUDIO / VIDEO PLAYER CONTROL BAR */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-[var(--rule-border)] bg-[var(--bg-recessed)] px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsPlaying((p) => !p)}
                      className="type-kicker inline-flex items-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-2.5 py-1 text-[10px] font-bold text-[var(--ink-primary)] cursor-pointer"
                    >
                      {isPlaying ? (
                        <>
                          <Pause className="h-3 w-3" /> PAUSE
                        </>
                      ) : (
                        <>
                          <Play className="h-3 w-3" /> PLAY
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsMuted((m) => !m)}
                      title={isMuted ? "Ton einschalten" : "Stummschalten"}
                      className="type-kicker inline-flex items-center gap-1 border border-[var(--rule-border)] bg-[var(--bg-surface)] px-2 py-1 text-[10px] text-[var(--ink-primary)] cursor-pointer"
                    >
                      {isMuted ? (
                        <VolumeX className="h-3 w-3 text-[var(--accent)]" />
                      ) : (
                        <Volume2 className="h-3 w-3" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleRestartFromStartSeconds}
                      title="Ab Start-Zeitpunkt neu abspielen"
                      className="type-kicker inline-flex items-center gap-1 border border-[var(--rule-border)] bg-[var(--bg-surface)] px-2 py-1 text-[10px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] cursor-pointer"
                    >
                      <RefreshCw className="h-3 w-3" />
                      AB {formatSecondsToMmSs(activeCard.startSeconds)}
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowVideoEmbed((v) => !v)}
                      className={`type-kicker inline-flex items-center gap-1 border px-2 py-1 text-[10px] cursor-pointer ${
                        showVideoEmbed
                          ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                          : "border-[var(--rule-border)] bg-[var(--bg-surface)] text-[var(--ink-primary)]"
                      }`}
                    >
                      {showVideoEmbed ? (
                        <>
                          <ImageIcon className="h-3 w-3" /> COVER ZEIGEN
                        </>
                      ) : (
                        <>
                          <Film className="h-3 w-3" />{" "}
                          {activeCard.platform === "SPOTIFY"
                            ? "PLAYER ZEIGEN"
                            : "VIDEO ZEIGEN"}
                        </>
                      )}
                    </button>

                    <a
                      href={activeCard.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Original-Link öffnen"
                      className="type-kicker inline-flex items-center gap-1 border border-[var(--rule-border)] bg-[var(--bg-surface)] px-2 py-1 text-[10px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                {/* SONG METADATA, PROPOSER INFO & INLINE COMMENT */}
                <div className="space-y-2.5 p-3.5 sm:p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="font-display truncate text-xl font-semibold leading-tight text-[var(--ink-primary)] sm:text-2xl">
                        {activeCard.title}
                      </h2>
                      <div className="mt-0.5 truncate text-sm font-medium text-[var(--ink-secondary)]">
                        {activeCard.artist || "Unbekannter Interpret"}
                      </div>
                    </div>

                    {activeCard.proposedBy && (
                      <span className="type-kicker shrink-0 border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2 py-0.5 text-[10px] text-[var(--ink-secondary)]">
                        VON {activeCard.proposedBy.toUpperCase()}
                      </span>
                    )}
                  </div>

                  {activeCard.notes && (
                    <div className="border-l-2 border-[var(--accent)] bg-[var(--bg-paper)] px-2.5 py-1.5 text-xs text-[var(--ink-primary)]">
                      <span className="type-kicker mr-1.5 text-[10px] text-[var(--ink-muted)]">
                        IDEE / NOTIZ:
                      </span>
                      {activeCard.notes}
                    </div>
                  )}

                  {/* Optional Quick Comment Field on Card */}
                  <div>
                    <input
                      type="text"
                      value={cardComment}
                      onChange={(e) => setCardComment(e.target.value)}
                      placeholder="Optionaler Kurz-Kommentar (z. B. „Super für Sängerin X“ oder „Starkes Solo“)..."
                      className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-1.5 text-xs text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:border-[var(--ink-primary)] focus:outline-none"
                    />
                  </div>

                  {/* TINDER ACTION BUTTONS (NEIN / SKIP / FAVORIT / JA) */}
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    <button
                      type="button"
                      disabled={submittingVote}
                      onClick={() => handleCastSwipeVote("NO")}
                      className="ui-transition flex flex-col items-center justify-center border-2 border-[var(--ink-primary)] bg-[var(--bg-surface)] py-2.5 text-[var(--ink-primary)] hover:bg-[var(--ink-primary)] hover:text-[var(--bg-surface)] cursor-pointer"
                    >
                      <ThumbsDown className="h-4 w-4" />
                      <span className="type-kicker mt-1 text-[10px] font-bold">
                        👎 NEIN
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={submittingVote}
                      onClick={handleSkipCard}
                      className="ui-transition flex flex-col items-center justify-center border border-[var(--rule-border)] bg-[var(--bg-paper)] py-2.5 text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)] cursor-pointer"
                    >
                      <SkipForward className="h-4 w-4" />
                      <span className="type-kicker mt-1 text-[10px] font-bold">
                        ⏭ SKIP
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={submittingVote}
                      onClick={() => handleCastSwipeVote("SUPER")}
                      className="ui-transition flex flex-col items-center justify-center border-2 border-[var(--accent)] bg-[var(--bg-surface)] py-2.5 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] cursor-pointer"
                    >
                      <Flame className="h-4 w-4" />
                      <span className="type-kicker mt-1 text-[10px] font-bold">
                        🔥 FAVORIT
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={submittingVote}
                      onClick={() => handleCastSwipeVote("YES")}
                      className="ui-transition flex flex-col items-center justify-center border-2 border-[var(--ink-primary)] bg-[var(--ink-primary)] py-2.5 text-[var(--bg-surface)] hover:bg-[var(--accent)] hover:border-[var(--accent)] cursor-pointer"
                    >
                      <ThumbsUp className="h-4 w-4" />
                      <span className="type-kicker mt-1 text-[10px] font-bold">
                        👍 JA
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 2: AUSWERTUNG & RANGLISTE (LIVE LEADERBOARD & PROMOTION)
         ===================================================================== */}
      {subTab === "results" && (
        <div className="space-y-4">
          {/* KPI Summary Bar */}
          <div className="grid grid-cols-2 gap-2 border border-[var(--rule-border)] bg-[var(--bg-surface)] p-3 sm:grid-cols-4">
            <div className="border-r border-[var(--rule-border)] pr-3">
              <div className="type-kicker text-[var(--ink-muted)]">
                LIEDVORSCHLÄGE
              </div>
              <div className="font-mono-tabular mt-0.5 text-xl font-bold text-[var(--ink-primary)]">
                {proposals.length}
              </div>
            </div>
            <div className="border-r-0 border-[var(--rule-border)] pr-3 sm:border-r">
              <div className="type-kicker text-[var(--ink-muted)]">
                ABGEGEBENE STIMMEN
              </div>
              <div className="font-mono-tabular mt-0.5 text-xl font-bold text-[var(--ink-primary)]">
                {proposals.reduce((acc, p) => acc + p.totalVotes, 0)}
              </div>
            </div>
            <div className="border-r border-[var(--rule-border)] pr-3">
              <div className="type-kicker text-[var(--ink-muted)]">
                TOP-FAVORITEN (≥ 75%)
              </div>
              <div className="font-mono-tabular mt-0.5 text-xl font-bold text-[var(--accent)]">
                {
                  proposals.filter(
                    (p) => p.totalVotes > 0 && p.approvalPercent >= 75
                  ).length
                }
              </div>
            </div>
            <div>
              <div className="type-kicker text-[var(--ink-muted)]">
                INS REPERTOIRE ÜBERNOMMEN
              </div>
              <div className="font-mono-tabular mt-0.5 text-xl font-bold text-[var(--ink-primary)]">
                {proposals.filter((p) => Boolean(p.transferredPieceId)).length}
              </div>
            </div>
          </div>

          {/* Filter & Sort Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 border border-[var(--rule-border)] bg-[var(--bg-surface)] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(
                    e.target.value as
                      | "score"
                      | "approval"
                      | "super"
                      | "votes"
                      | "newest"
                  )
                }
                className="border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink-primary)] focus:outline-none"
              >
                <option value="score">
                  Sortieren: Beliebtheits-Score (Standard)
                </option>
                <option value="approval">Sortieren: Zustimmung in %</option>
                <option value="super">Sortieren: Meiste 🔥 Favoriten</option>
                <option value="votes">Sortieren: Meiste Stimmen</option>
                <option value="newest">Sortieren: Neueste zuerst</option>
              </select>

              <div className="inline-flex border border-[var(--rule-border)] bg-[var(--bg-paper)]">
                {(
                  [
                    { id: "all", label: "ALLE" },
                    { id: "open", label: "NOCH OFFEN" },
                    { id: "transferred", label: "IM REPERTOIRE" },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setStatusFilter(st.id)}
                    className={`type-kicker px-2.5 py-1.5 text-[10px] cursor-pointer ${
                      statusFilter === st.id
                        ? "bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                        : "text-[var(--ink-secondary)]"
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Titel, Interpret, Kommentar suchen..."
                className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] py-1.5 pr-3 pl-8 text-xs text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:border-[var(--ink-primary)] focus:outline-none"
              />
            </div>
          </div>

          {/* Leaderboard List */}
          {sortedResults.length === 0 ? (
            <div className="border border-[var(--rule-border)] bg-[var(--bg-surface)] p-8 text-center">
              <span className="type-kicker text-[var(--ink-secondary)]">
                KEINE LIEDVORSCHLÄGE FÜR DIESEN FILTER GEFUNDEN.
              </span>
            </div>
          ) : (
            <div className="space-y-2.5">
              {sortedResults.map((proposal, index) => {
                const isPreviewActive = activePreviewId === proposal.id;
                const yesPct =
                  proposal.totalVotes > 0
                    ? Math.round((proposal.yesCount / proposal.totalVotes) * 100)
                    : 0;
                const superPct =
                  proposal.totalVotes > 0
                    ? Math.round(
                        (proposal.superCount / proposal.totalVotes) * 100
                      )
                    : 0;
                const noPct =
                  proposal.totalVotes > 0
                    ? Math.max(0, 100 - yesPct - superPct)
                    : 0;
                const commentsWithText = proposal.votes.filter(
                  (v) => v.comment && v.comment.trim() !== ""
                );

                return (
                  <div
                    key={proposal.id}
                    className="border border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-3.5 sm:p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      {/* Left: Rank + Cover + Metadata */}
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="font-mono-tabular flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--ink-primary)] bg-[var(--bg-recessed)] text-xs font-bold text-[var(--ink-primary)]">
                          #{String(index + 1).padStart(2, "0")}
                        </div>

                        {/* Thumbnail with Play Toggle */}
                        <button
                          type="button"
                          onClick={() =>
                            setActivePreviewId(
                              isPreviewActive ? null : proposal.id
                            )
                          }
                          title="Hörprobe / Player einblenden"
                          className="group relative h-16 w-24 shrink-0 overflow-hidden border border-[var(--rule-heavy)] bg-[var(--ink-primary)] cursor-pointer"
                        >
                          {proposal.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={proposal.thumbnailUrl}
                              alt={proposal.title}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-white">
                              <Music className="h-5 w-5" />
                            </div>
                          )}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-white transition-opacity group-hover:bg-black/65">
                            {isPreviewActive ? (
                              <Pause className="h-5 w-5" />
                            ) : (
                              <Play className="h-5 w-5" />
                            )}
                          </div>
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono-tabular border border-[var(--rule-border)] bg-[var(--bg-paper)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--ink-secondary)]">
                              {proposal.platform}
                            </span>
                            {proposal.proposedBy && (
                              <span className="type-kicker text-[10px] text-[var(--ink-muted)]">
                                VON {proposal.proposedBy.toUpperCase()}
                              </span>
                            )}
                            {proposal.transferredPieceId && (
                              <span className="type-kicker bg-[var(--ink-primary)] px-2 py-0.5 text-[10px] font-bold text-[var(--bg-surface)]">
                                ✓ IM REPERTOIRE
                              </span>
                            )}
                            <a
                              href={proposal.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-[11px] text-[var(--ink-secondary)] underline hover:text-[var(--accent)]"
                            >
                              Original <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>

                          <h3 className="font-display mt-1 truncate text-lg font-semibold leading-snug text-[var(--ink-primary)]">
                            {proposal.title}
                          </h3>
                          <div className="truncate text-xs font-medium text-[var(--ink-secondary)]">
                            {proposal.artist || "Unbekannter Interpret"}
                            {proposal.startSeconds > 0 && (
                              <span className="font-mono-tabular ml-2 text-[11px] text-[var(--ink-muted)]">
                                (Hörprobe ab{" "}
                                {formatSecondsToMmSs(proposal.startSeconds)})
                              </span>
                            )}
                          </div>

                          {proposal.notes && (
                            <div className="mt-1.5 border-l-2 border-[var(--rule-heavy)] bg-[var(--bg-paper)] px-2 py-1 text-xs text-[var(--ink-primary)]">
                              {proposal.notes}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Center: Popularity Bar & Vote Breakdown */}
                      <div className="w-full border-t border-[var(--rule-border)] pt-2.5 lg:w-72 lg:border-t-0 lg:pt-0">
                        <div className="flex items-baseline justify-between">
                          <span className="font-mono-tabular text-sm font-bold text-[var(--ink-primary)]">
                            {proposal.totalVotes > 0
                              ? `${proposal.approvalPercent}% ZUSTIMMUNG`
                              : "NOCH KEINE STIMMEN"}
                          </span>
                          <span className="font-mono-tabular text-xs text-[var(--ink-secondary)]">
                            Score:{" "}
                            <strong>
                              {proposal.popularityScore > 0
                                ? `+${proposal.popularityScore}`
                                : proposal.popularityScore}
                            </strong>{" "}
                            ({proposal.totalVotes} St.)
                          </span>
                        </div>

                        {/* Stacked Vote Bar */}
                        <div className="mt-1.5 flex h-2.5 w-full overflow-hidden border border-[var(--ink-primary)] bg-[var(--bg-paper)]">
                          {proposal.totalVotes > 0 && (
                            <>
                              {superPct > 0 && (
                                <div
                                  style={{ width: `${superPct}%` }}
                                  className="h-full bg-[var(--accent)]"
                                  title={`Favorit: ${proposal.superCount}`}
                                />
                              )}
                              {yesPct > 0 && (
                                <div
                                  style={{ width: `${yesPct}%` }}
                                  className="h-full bg-[var(--ink-primary)]"
                                  title={`Ja: ${proposal.yesCount}`}
                                />
                              )}
                              {noPct > 0 && (
                                <div
                                  style={{ width: `${noPct}%` }}
                                  className="h-full bg-[var(--bg-recessed)]"
                                  title={`Nein: ${proposal.noCount}`}
                                />
                              )}
                            </>
                          )}
                        </div>

                        <div className="font-mono-tabular mt-1 flex items-center justify-between text-[11px] text-[var(--ink-secondary)]">
                          <span>🔥 {proposal.superCount} Favorit</span>
                          <span>👍 {proposal.yesCount} Ja</span>
                          <span>👎 {proposal.noCount} Nein</span>
                        </div>
                      </div>

                      {/* Right: Inline Vote Change + Promote to Repertoire + Edit/Delete */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--rule-border)] pt-2.5 lg:flex-col lg:items-end lg:border-t-0 lg:pt-0">
                        {/* My Vote Quick Switcher */}
                        <div className="inline-flex items-center border border-[var(--ink-primary)] bg-[var(--bg-paper)]">
                          <button
                            type="button"
                            onClick={() => handleInlineVote(proposal, "NO")}
                            title="Mit Nein stimmen"
                            className={`type-kicker px-2 py-1 text-[10px] cursor-pointer ${
                              proposal.myVote?.decision === "NO"
                                ? "bg-[var(--ink-primary)] font-bold text-[var(--bg-surface)]"
                                : "text-[var(--ink-secondary)]"
                            }`}
                          >
                            👎
                          </button>
                          <button
                            type="button"
                            onClick={() => handleInlineVote(proposal, "YES")}
                            title="Mit Ja stimmen"
                            className={`type-kicker border-x border-[var(--ink-primary)] px-2 py-1 text-[10px] cursor-pointer ${
                              proposal.myVote?.decision === "YES"
                                ? "bg-[var(--ink-primary)] font-bold text-[var(--bg-surface)]"
                                : "text-[var(--ink-secondary)]"
                            }`}
                          >
                            👍 JA
                          </button>
                          <button
                            type="button"
                            onClick={() => handleInlineVote(proposal, "SUPER")}
                            title="Als Favorit markieren"
                            className={`type-kicker px-2 py-1 text-[10px] cursor-pointer ${
                              proposal.myVote?.decision === "SUPER"
                                ? "bg-[var(--accent)] font-bold text-[var(--accent-ink)]"
                                : "text-[var(--ink-secondary)]"
                            }`}
                          >
                            🔥 FAV
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCommentId(
                                editingCommentId === proposal.id
                                  ? null
                                  : proposal.id
                              );
                              setInlineCommentDraft(
                                proposal.myVote?.comment || ""
                              );
                            }}
                            title="Eigenen Kommentar hinzufügen / bearbeiten"
                            className="type-kicker inline-flex items-center gap-1 border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2 py-1 text-[10px] text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] cursor-pointer"
                          >
                            <MessageSquare className="h-3 w-3" />
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditProposalModal(proposal)}
                            title="Liedvorschlag bearbeiten"
                            className="type-kicker inline-flex items-center border border-[var(--rule-border)] bg-[var(--bg-paper)] p-1 text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] cursor-pointer"
                          >
                            <Edit3 className="h-3 w-3" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteProposal(proposal)}
                            title="Liedvorschlag löschen"
                            className="type-kicker inline-flex items-center border border-[var(--rule-border)] bg-[var(--bg-paper)] p-1 text-[var(--ink-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>

                          {!proposal.transferredPieceId ? (
                            <button
                              type="button"
                              onClick={() => openPromoteModal(proposal)}
                              className="type-kicker inline-flex items-center gap-1 bg-[var(--accent)] px-2.5 py-1 text-[10px] font-bold text-[var(--accent-ink)] cursor-pointer"
                            >
                              <span>INS REPERTOIRE</span>
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          ) : (
                            <span className="type-kicker border border-[var(--ink-primary)] bg-[var(--bg-recessed)] px-2 py-1 text-[10px] text-[var(--ink-primary)]">
                              ✓ ÜBERNOMMEN
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Inline Expandable Preview Player */}
                    {isPreviewActive && (
                      <div className="mt-3 border-t border-[var(--rule-border)] bg-[var(--bg-recessed)] p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="type-kicker text-[var(--ink-primary)]">
                            DIREKT-HÖRPROBE: {proposal.title}
                          </span>
                          <button
                            type="button"
                            onClick={() => setActivePreviewId(null)}
                            className="type-kicker text-[10px] text-[var(--ink-secondary)] underline cursor-pointer"
                          >
                            PLAYER SCHLIESSEN
                          </button>
                        </div>
                        {proposal.platform === "YOUTUBE" ? (
                          <div className="aspect-video max-h-64 w-full overflow-hidden border border-[var(--rule-heavy)] bg-black">
                            <iframe
                              src={`https://www.youtube.com/embed/${
                                proposal.externalId
                              }?autoplay=1&start=${Math.max(
                                0,
                                proposal.startSeconds || 0
                              )}`}
                              title={proposal.title}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              className="h-full w-full border-0"
                            />
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {proposal.previewAudioUrl && (
                              <audio
                                src={proposal.previewAudioUrl}
                                autoPlay
                                controls
                                className="h-9 w-full"
                              />
                            )}
                            <iframe
                              src={
                                proposal.embedUrl ||
                                `https://open.spotify.com/embed/track/${proposal.externalId}?utm_source=generator`
                              }
                              title={proposal.title}
                              width="100%"
                              height="80"
                              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                              className="border-0"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Inline Comment Editor */}
                    {editingCommentId === proposal.id && (
                      <div className="mt-3 flex items-center gap-2 border-t border-[var(--rule-border)] pt-2.5">
                        <input
                          type="text"
                          value={inlineCommentDraft}
                          onChange={(e) =>
                            setInlineCommentDraft(e.target.value)
                          }
                          placeholder="Dein Kommentar zu diesem Liedvorschlag..."
                          className="flex-1 border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-2.5 py-1.5 text-xs text-[var(--ink-primary)] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveInlineComment(proposal)}
                          className="type-kicker bg-[var(--ink-primary)] px-3 py-1.5 text-[10px] text-[var(--bg-surface)] cursor-pointer"
                        >
                          SPEICHERN
                        </button>
                      </div>
                    )}

                    {/* Voter Breakdown & Comments */}
                    {proposal.votes.length > 0 && (
                      <div className="mt-3 border-t border-[var(--rule-border)] pt-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {proposal.votes.map((v) => (
                            <span
                              key={v.id}
                              className={`font-mono-tabular inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] ${
                                v.decision === "SUPER"
                                  ? "border-[var(--accent)] bg-[var(--bg-paper)] font-bold text-[var(--accent)]"
                                  : v.decision === "YES"
                                  ? "border-[var(--ink-primary)] bg-[var(--bg-paper)] text-[var(--ink-primary)]"
                                  : "border-[var(--rule-border)] bg-[var(--bg-recessed)] text-[var(--ink-muted)]"
                              }`}
                            >
                              <span>
                                {v.decision === "SUPER"
                                  ? "🔥"
                                  : v.decision === "YES"
                                  ? "👍"
                                  : "👎"}
                              </span>
                              <span>{v.userName}</span>
                            </span>
                          ))}
                        </div>

                        {commentsWithText.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {commentsWithText.map((v) => (
                              <div
                                key={`c-${v.id}`}
                                className="bg-[var(--bg-paper)] px-2.5 py-1 text-xs text-[var(--ink-primary)]"
                              >
                                <strong className="font-mono-tabular mr-1.5 text-[11px] text-[var(--ink-secondary)]">
                                  💬 {v.userName}:
                                </strong>
                                <span>„{v.comment}“</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          MODAL 1: LIED ODER GANZE PLAYLIST VORSCHLAGEN (YOUTUBE & SPOTIFY)
         ===================================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col border-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] text-[var(--ink-primary)]">
            <div className="flex items-center justify-between border-b-2 border-[var(--rule-heavy)] bg-[var(--bg-recessed)] px-4 py-3 sm:px-6">
              <div>
                <div className="type-kicker text-[var(--accent)]">
                  YOUTUBE & SPOTIFY IMPORT (EINZEL-LINK ODER PLAYLIST)
                </div>
                <h2 className="font-display text-lg font-semibold text-[var(--ink-primary)] sm:text-xl">
                  Neues Lied oder Playlist vorschlagen
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="type-kicker inline-flex items-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[var(--ink-primary)] cursor-pointer"
              >
                SCHLIESSEN <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveProposalSubmit}
              className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6"
            >
              {/* Step 1: Paste YouTube or Spotify Link */}
              <div>
                <label className="type-kicker mb-1.5 block text-[var(--ink-primary)]">
                  1. YOUTUBE- ODER SPOTIFY-LINK EINFÜGEN (TRACK ODER PLAYLIST)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData("text");
                      if (
                        pasted &&
                        (pasted.includes("youtube.com") ||
                          pasted.includes("youtu.be") ||
                          pasted.includes("spotify.com") ||
                          pasted.startsWith("spotify:"))
                      ) {
                        setTimeout(() => handleResolveUrl(pasted), 50);
                      }
                    }}
                    placeholder="https://www.youtube.com/watch?v=... oder https://open.spotify.com/..."
                    className="flex-1 border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-3 py-2 text-xs text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={resolvingUrl || !urlInput.trim()}
                    onClick={() => handleResolveUrl()}
                    className="type-kicker shrink-0 bg-[var(--ink-primary)] px-4 py-2 text-xs font-bold text-[var(--bg-surface)] disabled:opacity-40 cursor-pointer"
                  >
                    {resolvingUrl ? "LÄDT..." : "LINK AUSLESEN"}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-[var(--ink-secondary)]">
                  Unterstützt einzelne Lieder sowie komplette{" "}
                  <strong>YouTube-Playlists</strong> und{" "}
                  <strong>Spotify-Playlists / Alben</strong>.
                </p>
                {resolveError && (
                  <div className="mt-2 border border-[var(--accent)] bg-[var(--bg-paper)] px-3 py-2 text-xs text-[var(--accent)]">
                    {resolveError}
                  </div>
                )}
              </div>

              {/* Optional switcher if link has both single track and playlist */}
              {hasPlaylistOption && (
                <div className="flex flex-wrap items-center justify-between gap-2 border border-[var(--ink-primary)] bg-[var(--bg-recessed)] p-3">
                  <div className="text-xs">
                    <strong>Playlist erkannt:</strong> „{playlistTitle}“ (
                    {resolvedTracks.length} Lieder)
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setImportMode("single")}
                      className={`type-kicker px-2.5 py-1 text-[10px] cursor-pointer ${
                        importMode === "single"
                          ? "bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                          : "bg-[var(--bg-surface)] text-[var(--ink-primary)]"
                      }`}
                    >
                      NUR DIESES LIED
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportMode("playlist")}
                      className={`type-kicker px-2.5 py-1 text-[10px] cursor-pointer ${
                        importMode === "playlist"
                          ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                          : "bg-[var(--bg-surface)] text-[var(--ink-primary)]"
                      }`}
                    >
                      GANZE PLAYLIST ({resolvedTracks.length})
                    </button>
                  </div>
                </div>
              )}

              {/* MODE B: PLAYLIST BULK IMPORT VIEW */}
              {importMode === "playlist" && resolvedTracks.length > 0 ? (
                <div className="space-y-3 border-t border-[var(--rule-border)] pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ListMusic className="h-4 w-4 text-[var(--accent)]" />
                      <span className="font-display text-base font-semibold">
                        {playlistTitle} ({selectedTrackIndices.length} /{" "}
                        {resolvedTracks.length} ausgewählt)
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedTrackIndices(
                            resolvedTracks.map((_, idx) => idx)
                          )
                        }
                        className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2 py-1 text-[10px] cursor-pointer"
                      >
                        ALLE
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedTrackIndices(
                            resolvedTracks
                              .map((t, idx) => (!t.alreadyExists ? idx : -1))
                              .filter((idx) => idx >= 0)
                          )
                        }
                        className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2 py-1 text-[10px] cursor-pointer"
                      >
                        NUR NEUE
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedTrackIndices([])}
                        className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2 py-1 text-[10px] cursor-pointer"
                      >
                        KEINE
                      </button>
                    </div>
                  </div>

                  <div className="max-h-60 divide-y divide-[var(--rule-border)] overflow-y-auto border border-[var(--ink-primary)] bg-[var(--bg-paper)]">
                    {resolvedTracks.map((tr, idx) => {
                      const checked = selectedTrackIndices.includes(idx);
                      return (
                        <label
                          key={`${tr.externalId}-${idx}`}
                          className="flex items-center justify-between gap-2.5 px-3 py-2 text-xs hover:bg-[var(--bg-recessed)] cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedTrackIndices((prev) => [
                                    ...prev,
                                    idx,
                                  ]);
                                } else {
                                  setSelectedTrackIndices((prev) =>
                                    prev.filter((i) => i !== idx)
                                  );
                                }
                              }}
                              className="h-4 w-4 accent-[var(--accent)]"
                            />
                            {tr.thumbnailUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={tr.thumbnailUrl}
                                alt=""
                                className="h-8 w-11 shrink-0 object-cover border border-[var(--rule-border)]"
                              />
                            )}
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-[var(--ink-primary)]">
                                {tr.title}
                              </div>
                              <div className="truncate text-[11px] text-[var(--ink-secondary)]">
                                {tr.artist || "—"}
                              </div>
                            </div>
                          </div>
                          {tr.alreadyExists && (
                            <span className="type-kicker shrink-0 border border-[var(--rule-border)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[9px] text-[var(--ink-muted)]">
                              BEREITS DRIN
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                        VORGESCHLAGEN VON
                      </label>
                      <input
                        type="text"
                        value={draftProposedBy}
                        onChange={(e) => setDraftProposedBy(e.target.value)}
                        placeholder="Dein Name..."
                        className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-xs text-[var(--ink-primary)]"
                      />
                    </div>
                    <div>
                      <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                        NOTIZ FÜR ALLE LIEDER (OPTIONAL)
                      </label>
                      <input
                        type="text"
                        value={draftNotes}
                        onChange={(e) => setDraftNotes(e.target.value)}
                        placeholder="z. B. Aus unserer Spotify-Ideenliste..."
                        className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-xs text-[var(--ink-primary)]"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* MODE A: SINGLE TRACK DETAILS & PREVIEW */
                <div className="space-y-3 border-t border-[var(--rule-border)] pt-3">
                  {draftThumbnailUrl && (
                    <div className="flex items-center gap-3 border border-[var(--rule-border)] bg-[var(--bg-paper)] p-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={draftThumbnailUrl}
                        alt={draftTitle}
                        className="h-16 w-24 shrink-0 border border-[var(--rule-heavy)] object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="type-kicker text-[10px] text-[var(--accent)]">
                          VORSCHAU GELADEN ({draftPlatform})
                        </span>
                        <div className="truncate font-display text-base font-semibold">
                          {draftTitle || "Unbenannt"}
                        </div>
                        <div className="truncate text-xs text-[var(--ink-secondary)]">
                          {draftArtist || "Interpret ergänzen..."}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="type-kicker mb-1 block text-[var(--ink-primary)]">
                        LIEDTITEL *
                      </label>
                      <input
                        type="text"
                        required
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        placeholder="z. B. September"
                        className="w-full border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-3 py-2 text-xs text-[var(--ink-primary)]"
                      />
                    </div>

                    <div>
                      <label className="type-kicker mb-1 block text-[var(--ink-primary)]">
                        INTERPRET / BAND
                      </label>
                      <input
                        type="text"
                        value={draftArtist}
                        onChange={(e) => setDraftArtist(e.target.value)}
                        placeholder="z. B. Earth, Wind & Fire"
                        className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-xs text-[var(--ink-primary)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                        START-ZEITPUNKT FÜR HÖRPROBE (MM:SS)
                      </label>
                      <input
                        type="text"
                        value={draftStartTimeStr}
                        onChange={(e) => setDraftStartTimeStr(e.target.value)}
                        placeholder="0:00 oder z. B. 0:45 für Refrain"
                        className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-xs text-[var(--ink-primary)]"
                      />
                    </div>

                    <div>
                      <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                        VORGESCHLAGEN VON
                      </label>
                      <input
                        type="text"
                        value={draftProposedBy}
                        onChange={(e) => setDraftProposedBy(e.target.value)}
                        placeholder="Dein Name..."
                        className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-xs text-[var(--ink-primary)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                      NOTIZ / BESETZUNGS-IDEE (OPTIONAL)
                    </label>
                    <input
                      type="text"
                      value={draftNotes}
                      onChange={(e) => setDraftNotes(e.target.value)}
                      placeholder="z. B. Wäre super für Sängerin X / Starkes Bläser-Riff..."
                      className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-xs text-[var(--ink-primary)]"
                    />
                  </div>
                </div>
              )}

              {/* Proposer Initial Vote Selector */}
              {currentUser && (
                <div className="border-t border-[var(--rule-border)] pt-3">
                  <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                    DEINE EIGENE STIMME DIREKT MITSPEICHERN?
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setDraftAutoVote("SUPER")}
                      className={`type-kicker border py-2 text-[10px] cursor-pointer ${
                        draftAutoVote === "SUPER"
                          ? "border-[var(--accent)] bg-[var(--accent)] font-bold text-[var(--accent-ink)]"
                          : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-secondary)]"
                      }`}
                    >
                      🔥 ALS FAVORIT
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraftAutoVote("YES")}
                      className={`type-kicker border py-2 text-[10px] cursor-pointer ${
                        draftAutoVote === "YES"
                          ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] font-bold text-[var(--bg-surface)]"
                          : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-secondary)]"
                      }`}
                    >
                      👍 MIT „JA“
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraftAutoVote("NONE")}
                      className={`type-kicker border py-2 text-[10px] cursor-pointer ${
                        draftAutoVote === "NONE"
                          ? "border-[var(--ink-primary)] bg-[var(--bg-recessed)] font-bold text-[var(--ink-primary)]"
                          : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-secondary)]"
                      }`}
                    >
                      OFFEN LASSEN
                    </button>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 border-t-2 border-[var(--rule-heavy)] pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-paper)] px-4 py-2.5 text-xs text-[var(--ink-secondary)] cursor-pointer"
                >
                  ABBRECHEN
                </button>
                <button
                  type="submit"
                  disabled={
                    savingProposal ||
                    (importMode === "playlist"
                      ? selectedTrackIndices.length === 0
                      : !draftTitle.trim())
                  }
                  className="type-kicker bg-[var(--accent)] px-5 py-2.5 text-xs font-bold text-[var(--accent-ink)] disabled:opacity-40 cursor-pointer"
                >
                  {savingProposal
                    ? "SPEICHERT..."
                    : importMode === "playlist"
                    ? `${selectedTrackIndices.length} LIEDER IMPORTIEREN →`
                    : "VORSCHLAG SPEICHERN →"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: LIEDVORSCHLAG BEARBEITEN
         ===================================================================== */}
      {editingProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md border-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-5">
            <div className="type-kicker text-[var(--accent)]">
              VORSCHLAG BEARBEITEN
            </div>
            <h3 className="font-display mt-1 text-lg font-semibold">
              {editingProposal.title}
            </h3>
            <form onSubmit={handleSaveEditProposal} className="mt-4 space-y-3">
              <div>
                <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                  LIEDTITEL
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                  INTERPRET
                </label>
                <input
                  type="text"
                  value={editArtist}
                  onChange={(e) => setEditArtist(e.target.value)}
                  className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                  START-ZEITPUNKT (MM:SS)
                </label>
                <input
                  type="text"
                  value={editStartTimeStr}
                  onChange={(e) => setEditStartTimeStr(e.target.value)}
                  className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                  NOTIZ / IDEE
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingProposal(null)}
                  className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-xs cursor-pointer"
                >
                  ABBRECHEN
                </button>
                <button
                  type="submit"
                  className="type-kicker bg-[var(--ink-primary)] px-4 py-2 text-xs font-bold text-[var(--bg-surface)] cursor-pointer"
                >
                  SPEICHERN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: 1-KLICK ÜBERNAHME INS HAUPT-REPERTOIRE (TAB 01)
         ===================================================================== */}
      {promotingProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg border-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-5">
            <div className="type-kicker text-[var(--accent)]">
              ÜBERNAHME IN TAB 01 REPERTOIRE
            </div>
            <h3 className="font-display mt-1 text-xl font-semibold">
              „{promotingProposal.title}“ ins Repertoire aufnehmen
            </h3>
            <p className="mt-1 text-xs text-[var(--ink-secondary)]">
              Die positiven Abstimmungen ({promotingProposal.superCount}× 🔥,{" "}
              {promotingProposal.yesCount}× 👍) werden automatisch als
              Start-Beliebtheit übernommen. Optional kannst du direkt Besetzung
              und Mappe ergänzen:
            </p>

            <form onSubmit={handlePromoteSubmit} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                    MAPPEN-NR. (OPTIONAL)
                  </label>
                  <input
                    type="text"
                    value={promoteFolderNumber}
                    onChange={(e) => setPromoteFolderNumber(e.target.value)}
                    placeholder="z. B. 45"
                    className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                    SCHWIERIGKEIT
                  </label>
                  <select
                    value={promoteDifficulty}
                    onChange={(e) =>
                      setPromoteDifficulty(
                        e.target.value as "EASY" | "MEDIUM" | "HARD"
                      )
                    }
                    className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-xs"
                  >
                    <option value="EASY">Leicht</option>
                    <option value="MEDIUM">Mittel</option>
                    <option value="HARD">Schwer</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                    SÄNGER/IN (OPTIONAL)
                  </label>
                  <input
                    type="text"
                    list="promote-singers-list"
                    value={promoteSingers}
                    onChange={(e) => setPromoteSingers(e.target.value)}
                    placeholder="Frei oder Komma-getrennt..."
                    className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-xs"
                  />
                  <datalist id="promote-singers-list">
                    {suggestions.singers.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                    TANZ- / SONG-TYP (OPTIONAL)
                  </label>
                  <input
                    type="text"
                    list="promote-songtype-list"
                    value={promoteSongType}
                    onChange={(e) => setPromoteSongType(e.target.value)}
                    placeholder="z. B. Funk, Swing, Rock..."
                    className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-xs"
                  />
                  <datalist id="promote-songtype-list">
                    {suggestions.songTypes.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                    SOLIST/IN (OPTIONAL)
                  </label>
                  <input
                    type="text"
                    list="promote-soloists-list"
                    value={promoteSoloists}
                    onChange={(e) => setPromoteSoloists(e.target.value)}
                    placeholder="z. B. Trompete, Saxophon..."
                    className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-xs"
                  />
                  <datalist id="promote-soloists-list">
                    {suggestions.soloists.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                    NOTIZEN / ARRANGEMENT
                  </label>
                  <input
                    type="text"
                    value={promoteNotes}
                    onChange={(e) => setPromoteNotes(e.target.value)}
                    placeholder="Besondere Hinweise..."
                    className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPromotingProposal(null)}
                  className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-xs cursor-pointer"
                >
                  ABBRECHEN
                </button>
                <button
                  type="submit"
                  disabled={promotingLoading}
                  className="type-kicker inline-flex items-center gap-1.5 bg-[var(--accent)] px-4 py-2 text-xs font-bold text-[var(--accent-ink)] cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" />
                  {promotingLoading
                    ? "ÜBERNIMMT..."
                    : "JETZT INS REPERTOIRE ÜBERNEHMEN"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
