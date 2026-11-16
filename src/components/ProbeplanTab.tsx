"use client";

import React, { useState } from "react";
import {
  Play,
  CheckCircle2,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Lock,
  Unlock,
  FastForward,
  AlertTriangle,
  Edit3,
  Check,
} from "lucide-react";
import {
  PieceItem,
  RehearsalConfigItem,
  RehearsalSessionItem,
  SuggestionsData,
} from "@/types";
import ScoreSelector from "./ScoreSelector";

interface ProbeplanTabProps {
  config: RehearsalConfigItem;
  sessions: RehearsalSessionItem[];
  pieces: PieceItem[];
  suggestions: SuggestionsData;
  currentUser: { id: string; name: string } | null;
  onRefresh: () => Promise<void>;
  onRequireLogin: () => void;
}

export default function ProbeplanTab({
  config,
  sessions,
  pieces,
  suggestions,
  currentUser,
  onRefresh,
  onRequireLogin,
}: ProbeplanTabProps) {
  const [sessionsCount, setSessionsCount] = useState(config.totalSessionsLeft);
  const [piecesPerSession, setPiecesPerSession] = useState(
    config.piecesPerSession
  );
  const [planningMode, setPlanningMode] = useState<
    "SIMPLE_COUNT" | "EXACT_DATES" | "MANUAL"
  >(config.planningMode);
  const [savingConfig, setSavingConfig] = useState(false);

  // Add new session modal
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newInfo, setNewInfo] = useState("");
  const [newPresentSingers, setNewPresentSingers] = useState<string[]>([]);
  const [newAbsentSoloists, setNewAbsentSoloists] = useState<string[]>([]);
  const [newIsManual, setNewIsManual] = useState(false);

  // Editing session meta modal
  const [editingSession, setEditingSession] =
    useState<RehearsalSessionItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editInfo, setEditInfo] = useState("");

  // Logging per piece state: key = `${sessionId}_${pieceId}`
  const [openLogKey, setOpenLogKey] = useState<string | null>(null);
  const [logConfidence, setLogConfidence] = useState<number>(4);
  const [logPractice, setLogPractice] = useState<number>(2);
  const [logComment, setLogComment] = useState<string>("");
  const [submittingLog, setSubmittingLog] = useState(false);

  // Add piece dropdown per session
  const [selectedPieceToAdd, setSelectedPieceToAdd] = useState<
    Record<string, string>
  >({});
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [showMobileConfig, setShowMobileConfig] = useState(false);
  const [selectedMobileSessionId, setSelectedMobileSessionId] =
    useState<string>("");

  const upcomingSessions = sessions.filter((s) => s.status !== "COMPLETED");
  const activeMobileSessionId =
    selectedMobileSessionId === "__ALL__"
      ? "__ALL__"
      : upcomingSessions.some((s) => s.id === selectedMobileSessionId)
      ? selectedMobileSessionId
      : upcomingSessions.find((s) => s.status === "ACTIVE")?.id ||
        upcomingSessions[0]?.id ||
        "";

  const handleSaveConfig = async (
    modeOverride?: "SIMPLE_COUNT" | "EXACT_DATES" | "MANUAL",
    countOverride?: number,
    perSessionOverride?: number
  ) => {
    setSavingConfig(true);
    setErrorBanner(null);
    try {
      const nextMode = modeOverride ?? planningMode;
      const nextCount = countOverride ?? sessionsCount;
      const nextPerSession = perSessionOverride ?? piecesPerSession;

      await fetch("/api/rehearsals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-config",
          planningMode: nextMode,
          totalSessionsLeft: nextCount,
          piecesPerSession: nextPerSession,
        }),
      });
      await onRefresh();
    } finally {
      setSavingConfig(false);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("/api/rehearsals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create-session",
        title: newTitle || `Probe ${sessions.length + 1}`,
        scheduledDate: newDate || null,
        location: newLocation,
        additionalInfo: newInfo,
        presentSingers: newPresentSingers.join(", "),
        absentSoloists: newAbsentSoloists.join(", "),
        isLocked: newIsManual,
      }),
    });
    setShowNewSessionModal(false);
    setNewTitle("");
    setNewDate("");
    setNewLocation("");
    setNewInfo("");
    setNewPresentSingers([]);
    setNewAbsentSoloists([]);
    setNewIsManual(false);
    await onRefresh();
  };

  const openEditSessionModal = (s: RehearsalSessionItem) => {
    setEditingSession(s);
    setEditTitle(s.title);
    setEditDate(
      s.scheduledDate
        ? new Date(s.scheduledDate).toISOString().slice(0, 16)
        : ""
    );
    setEditLocation(s.location || "");
    setEditInfo(s.additionalInfo || "");
  };

  const handleSaveSessionMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSession) return;
    await fetch(`/api/rehearsals/${editingSession.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update-meta",
        title: editTitle,
        scheduledDate: editDate || null,
        location: editLocation,
        additionalInfo: editInfo,
      }),
    });
    setEditingSession(null);
    await onRefresh();
  };

  const toggleSingerInSession = async (
    session: RehearsalSessionItem,
    singer: string
  ) => {
    const current = session.presentSingerList;
    const exists = current.some(
      (s) => s.toLowerCase() === singer.toLowerCase()
    );
    const next = exists
      ? current.filter((s) => s.toLowerCase() !== singer.toLowerCase())
      : [...current, singer];

    await fetch(`/api/rehearsals/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update-meta",
        presentSingers: next.join(", "),
      }),
    });
    await onRefresh();
  };

  const toggleAbsentSoloistInSession = async (
    session: RehearsalSessionItem,
    soloist: string
  ) => {
    const current = session.absentSoloistList;
    const exists = current.some(
      (s) => s.toLowerCase() === soloist.toLowerCase()
    );
    const next = exists
      ? current.filter((s) => s.toLowerCase() !== soloist.toLowerCase())
      : [...current, soloist];

    await fetch(`/api/rehearsals/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update-meta",
        absentSoloists: next.join(", "),
      }),
    });
    await onRefresh();
  };

  const handleSessionAction = async (
    sessionId: string,
    payload: Record<string, unknown>
  ) => {
    setErrorBanner(null);
    const res = await fetch(`/api/rehearsals/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setErrorBanner(err.error || "Aktion konnte nicht ausgeführt werden.");
      return;
    }
    await onRefresh();
  };

  const handleMovePiece = async (
    session: RehearsalSessionItem,
    index: number,
    direction: "up" | "down"
  ) => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= session.pieces.length) return;

    const ids = session.pieces.map((sp) => sp.pieceId);
    const temp = ids[index];
    ids[index] = ids[targetIndex];
    ids[targetIndex] = temp;

    await handleSessionAction(session.id, {
      action: "reorder-pieces",
      pieceIds: ids,
    });
  };

  const handleDeleteSession = async (session: RehearsalSessionItem) => {
    if (!window.confirm(`Möchtest du „${session.title}“ wirklich löschen?`)) {
      return;
    }
    await fetch(`/api/rehearsals/${session.id}`, { method: "DELETE" });
    await onRefresh();
  };

  const openLogDrawer = (sessionId: string, pieceId: string) => {
    if (!currentUser) {
      onRequireLogin();
      return;
    }
    const key = `${sessionId}_${pieceId}`;
    if (openLogKey === key) {
      setOpenLogKey(null);
      return;
    }
    const repertoirePiece = pieces.find((p) => p.id === pieceId);
    const myVote = repertoirePiece?.myVote;
    setLogConfidence(myVote?.confidenceScore ?? 3);
    setLogPractice(myVote?.practiceNeededScore ?? 3);
    setLogComment("");
    setOpenLogKey(key);
  };

  const submitPlayerLog = async (sessionId: string, pieceId: string) => {
    if (!currentUser) {
      onRequireLogin();
      return;
    }
    setSubmittingLog(true);
    try {
      await handleSessionAction(sessionId, {
        action: "log-piece",
        userId: currentUser.id,
        pieceId,
        newConfidence: logConfidence,
        newPracticeNeeded: logPractice,
        comment: logComment,
      });
      setOpenLogKey(null);
    } finally {
      setSubmittingLog(false);
    }
  };

  return (
    /* Asymmetric 12-Column Grid: Columns 1–4 Sticky Plan Controller, Columns 5–12 Session Sheets */
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-8">
      {/* Left Rail: Columns 1–4 */}
      <aside className="lg:col-span-4">
        {/* MOBILE COMPACT SESSION SWITCHER & CONFIG TOGGLE (< 1024px) */}
        <div className="mb-2 space-y-2 border border-[var(--ink-primary)] bg-[var(--bg-surface)] p-2 lg:hidden">
          <div className="flex items-center justify-between gap-1.5">
            <span className="type-kicker text-[var(--ink-secondary)]">
              PROBEN-AUSWAHL ({upcomingSessions.length} OFFEN)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowMobileConfig((v) => !v)}
                className={`type-kicker border px-2 py-1 text-[10px] cursor-pointer ${
                  showMobileConfig
                    ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                    : "border-[var(--rule-border)] bg-[var(--bg-recessed)] text-[var(--ink-primary)]"
                }`}
              >
                ⚙ MODUS & ANZAHL
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewTitle(`Probe ${sessions.length + 1}`);
                  setShowNewSessionModal(true);
                }}
                className="type-kicker inline-flex items-center gap-1 bg-[var(--accent)] px-2 py-1 text-[10px] text-[var(--accent-ink)] cursor-pointer"
              >
                <Plus className="h-3 w-3" /> PROBE
              </button>
            </div>
          </div>

          {upcomingSessions.length > 1 && (
            <div className="flex gap-1 overflow-x-auto pb-0.5">
              {upcomingSessions.map((s) => {
                const isSelected = activeMobileSessionId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedMobileSessionId(s.id)}
                    className={`font-mono-tabular shrink-0 border px-2.5 py-1.5 text-xs font-semibold cursor-pointer ${
                      isSelected
                        ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                        : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-primary)]"
                    }`}
                  >
                    #{String(s.sessionNumber).padStart(2, "0")}{" "}
                    {s.status === "ACTIVE" ? "● LIVE" : ""}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setSelectedMobileSessionId("__ALL__")}
                className={`type-kicker shrink-0 border px-2.5 py-1.5 text-[10px] cursor-pointer ${
                  activeMobileSessionId === "__ALL__"
                    ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                    : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-secondary)]"
                }`}
              >
                ALLE ({upcomingSessions.length})
              </button>
            </div>
          )}
        </div>

        {/* FULL CONFIG PANEL (Collapsible on Mobile, Sticky on Desktop) */}
        <div
          className={`${
            showMobileConfig ? "block" : "hidden"
          } lg:block sticky top-36 space-y-5 border-t-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-4 sm:p-5 border-x border-b border-x-[var(--rule-border)] border-b-[var(--rule-border)]`}
        >
          <div className="border-b border-[var(--rule-border)] pb-3">
            <div className="type-kicker text-[var(--ink-muted)]">
              DISPOSITION & MODUS
            </div>
            <h2 className="type-section-h2 mt-0.5 text-[var(--ink-primary)]">
              Probenplan-Steuerung
            </h2>
          </div>

          <button
            type="button"
            onClick={() => {
              setNewTitle(`Probe ${sessions.length + 1}`);
              setShowNewSessionModal(true);
            }}
            className="type-kicker ui-transition flex w-full items-center justify-center gap-2 bg-[var(--accent)] px-4 py-3 text-[var(--accent-ink)] cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            NEUEN PROBETERMIN ANLEGEN
          </button>

          {/* Mode Selector */}
          <div className="space-y-1.5">
            <span className="type-kicker block text-[var(--ink-secondary)]">
              Planungsmodus
            </span>
            <div className="flex flex-col border border-[var(--rule-border)] bg-[var(--bg-paper)]">
              {(
                [
                  {
                    id: "SIMPLE_COUNT",
                    label: "01 / Einfache Probenanzahl",
                    desc: "Automatische Verteilung auf N Proben",
                  },
                  {
                    id: "EXACT_DATES",
                    label: "02 / Konkrete Probetermine",
                    desc: "Termine mit Sänger- & Solisten-Filter",
                  },
                  {
                    id: "MANUAL",
                    label: "03 / Komplett Manuell",
                    desc: "Volle eigene Zusammenstellung",
                  },
                ] as const
              ).map((m) => {
                const active = planningMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setPlanningMode(m.id);
                      handleSaveConfig(m.id, sessionsCount, piecesPerSession);
                    }}
                    className={`ui-transition border-b border-[var(--rule-border)] last:border-b-0 p-3 text-left cursor-pointer ${
                      active
                        ? "bg-[var(--bg-recessed)] border-l-4 border-l-[var(--accent)]"
                        : "bg-[var(--bg-surface)] hover:bg-[var(--bg-paper)]"
                    }`}
                  >
                    <div className="type-kicker text-[var(--ink-primary)]">
                      {m.label}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--ink-secondary)]">
                      {m.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Numeric Parameters */}
          <div className="space-y-3 border-t border-[var(--rule-border)] pt-4">
            {planningMode === "SIMPLE_COUNT" && (
              <div>
                <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                  Verbleibende Proben bis Konzert
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={sessionsCount}
                    onChange={(e) =>
                      setSessionsCount(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="font-mono-tabular w-24 border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-3 py-1.5 text-sm font-bold text-[var(--ink-primary)] focus:outline-none"
                  />
                  <span className="text-xs text-[var(--ink-secondary)]">
                    Proben
                  </span>
                </div>
              </div>
            )}

            <div>
              <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                Standard-Stückzahl pro Probe
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={piecesPerSession}
                  onChange={(e) =>
                    setPiecesPerSession(
                      Math.max(1, Number(e.target.value) || 1)
                    )
                  }
                  className="font-mono-tabular w-24 border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-3 py-1.5 text-sm font-bold text-[var(--ink-primary)] focus:outline-none"
                />
                <span className="text-xs text-[var(--ink-secondary)]">
                  Stücke / Sitzung
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={savingConfig}
              onClick={() => handleSaveConfig()}
              className="type-kicker w-full border border-[var(--ink-primary)] bg-[var(--bg-recessed)] py-2.5 text-center text-[var(--ink-primary)] hover:bg-[var(--ink-primary)] hover:text-[var(--bg-surface)] cursor-pointer"
            >
              {savingConfig
                ? "BERECHNET PLAN..."
                : "PARAMETER ANWENDEN & NEU BERECHNEN"}
            </button>
          </div>
        </div>
      </aside>

      {/* Right Main Column: Columns 5–12 */}
      <section className="space-y-6 lg:col-span-8">
        {errorBanner && (
          <div className="flex items-center justify-between border-2 border-[var(--accent)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--ink-primary)]">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[var(--accent)] shrink-0" />
              <span>{errorBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="type-kicker underline cursor-pointer"
            >
              SCHLIESSEN
            </button>
          </div>
        )}

        {upcomingSessions.length === 0 ? (
          <div className="border-t-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-12 text-center border-x border-b border-x-[var(--rule-border)] border-b-[var(--rule-border)]">
            <div className="type-kicker text-[var(--ink-muted)]">
              KEINE OFFENEN PROBEN
            </div>
            <h3 className="type-section-h2 mt-2 text-[var(--ink-primary)]">
              Noch keine anstehenden Proben
            </h3>
            <p className="mt-1 text-sm text-[var(--ink-secondary)]">
              Lege links einen neuen Probetermin an oder erhöhe die Anzahl
              verbleibender Proben.
            </p>
          </div>
        ) : (
          upcomingSessions.map((session, sIdx) => {
            const isActive = session.status === "ACTIVE";
            const isVisibleOnMobile =
              activeMobileSessionId === "__ALL__" ||
              activeMobileSessionId === session.id;
            const availablePiecesToAdd = pieces.filter(
              (p) => !session.pieces.some((sp) => sp.pieceId === p.id)
            );

            return (
              <article
                key={session.id}
                style={
                  {
                    "--stagger-index": Math.min(sIdx, 8),
                  } as React.CSSProperties
                }
                className={`${
                  isVisibleOnMobile ? "block" : "hidden"
                } lg:block stagger-item border-t-2 bg-[var(--bg-surface)] p-3.5 sm:p-6 border-x border-b border-x-[var(--rule-border)] border-b-[var(--rule-border)] ${
                  isActive
                    ? "border-t-[var(--accent)]"
                    : "border-t-[var(--rule-heavy)]"
                }`}
              >
                {/* Session Sheet Header */}
                <div className="flex flex-col gap-4 border-b border-[var(--rule-border)] pb-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono-tabular border border-[var(--ink-primary)] bg-[var(--bg-recessed)] px-2 py-0.5 text-xs font-bold text-[var(--ink-primary)]">
                        #{String(session.sessionNumber).padStart(2, "0")}
                      </span>
                      <h3 className="type-section-h2 text-[var(--ink-primary)]">
                        {session.title}
                      </h3>
                      {isActive && (
                        <span className="type-kicker bg-[var(--accent)] px-2.5 py-0.5 text-[var(--accent-ink)]">
                          ● LAUFENDE PROBE (LIVE)
                        </span>
                      )}
                      {session.isLocked ? (
                        <span className="type-kicker inline-flex items-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-2 py-0.5 text-[var(--ink-primary)]">
                          <Lock className="h-3 w-3" /> MANUELL FIXIERT
                        </span>
                      ) : (
                        <span className="type-kicker inline-flex items-center gap-1 border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2 py-0.5 text-[var(--ink-secondary)]">
                          <Sparkles className="h-3 w-3" /> AUTO-PLANUNG
                        </span>
                      )}
                    </div>

                    <div className="font-mono-tabular mt-2 flex flex-wrap items-center gap-4 text-xs text-[var(--ink-secondary)]">
                      <span>
                        TERMIN:{" "}
                        <strong className="text-[var(--ink-primary)]">
                          {session.scheduledDate
                            ? new Date(session.scheduledDate).toLocaleString(
                                "de-DE",
                                {
                                  weekday: "short",
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              )
                            : "Flexibel (ohne festes Datum)"}
                        </strong>
                      </span>
                      {session.location && (
                        <span>
                          ORT:{" "}
                          <strong className="text-[var(--ink-primary)]">
                            {session.location}
                          </strong>
                        </span>
                      )}
                    </div>

                    {session.additionalInfo && (
                      <div className="mt-2.5 border-l-2 border-[var(--ink-primary)] bg-[var(--bg-paper)] px-3 py-2 text-xs text-[var(--ink-primary)] whitespace-pre-wrap">
                        <span className="type-kicker block text-[var(--ink-muted)]">
                          ZUSATZINFORMATIONEN ZUM TERMIN:
                        </span>
                        {session.additionalInfo}
                      </div>
                    )}
                  </div>

                  {/* Session Action Bar */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditSessionModal(session)}
                      className="type-kicker inline-flex items-center gap-1 border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2.5 py-1.5 text-[var(--ink-primary)] hover:border-[var(--ink-primary)] cursor-pointer"
                    >
                      <Edit3 className="h-3.5 w-3.5" /> TERMIN & INFOS
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleSessionAction(session.id, {
                          action: "toggle-lock",
                        })
                      }
                      className="type-kicker inline-flex items-center gap-1 border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2.5 py-1.5 text-[var(--ink-primary)] hover:border-[var(--ink-primary)] cursor-pointer"
                    >
                      {session.isLocked ? (
                        <>
                          <Unlock className="h-3.5 w-3.5" /> ENTSPERREN
                        </>
                      ) : (
                        <>
                          <Lock className="h-3.5 w-3.5" /> FIXIEREN
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleSessionAction(session.id, { action: "auto-fill" })
                      }
                      className="type-kicker inline-flex items-center gap-1 border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2.5 py-1.5 text-[var(--ink-primary)] hover:border-[var(--ink-primary)] cursor-pointer"
                      title="Stücke anhand von Übungsbedarf, Sänger-Anwesenheit und Solisten-Abwesenheit neu berechnen"
                    >
                      <Sparkles className="h-3.5 w-3.5" /> AUTO-VORSCHLAG
                    </button>

                    {!isActive ? (
                      <button
                        type="button"
                        onClick={() =>
                          handleSessionAction(session.id, { action: "start" })
                        }
                        className="type-kicker inline-flex items-center gap-1 bg-[var(--ink-primary)] px-3 py-1.5 text-[var(--bg-surface)] hover:bg-[var(--accent)] cursor-pointer"
                      >
                        <Play className="h-3.5 w-3.5" /> PROBE STARTEN
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          handleSessionAction(session.id, {
                            action: "complete",
                          })
                        }
                        className="type-kicker inline-flex items-center gap-1 bg-[var(--accent)] px-3 py-1.5 text-[var(--accent-ink)] cursor-pointer"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> ABSCHLIESSEN
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDeleteSession(session)}
                      className="border border-[var(--rule-border)] bg-[var(--bg-paper)] p-1.5 text-[var(--ink-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer"
                      title="Probe löschen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Attendance Filters: Present Singers & Absent Soloists */}
                {(suggestions.singers.length > 0 ||
                  suggestions.soloists.length > 0) && (
                  <div className="mt-4 grid grid-cols-1 gap-px border border-[var(--rule-border)] bg-[var(--rule-border)] md:grid-cols-2">
                    {/* Present Singers */}
                    <div className="bg-[var(--bg-paper)] p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="type-kicker text-[var(--ink-secondary)]">
                          ANWESENDE SÄNGER (NUR DIESE LIEDER PROBEN)
                        </span>
                        {session.presentSingerList.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              handleSessionAction(session.id, {
                                action: "update-meta",
                                presentSingers: "",
                              })
                            }
                            className="type-kicker text-[var(--accent)] underline cursor-pointer"
                          >
                            ALLE ERLAUBEN
                          </button>
                        )}
                      </div>
                      {suggestions.singers.length === 0 ? (
                        <p className="text-xs text-[var(--ink-muted)]">
                          Keine Sänger im Repertoire hinterlegt.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {suggestions.singers.map((singer) => {
                            const selected = session.presentSingerList.some(
                              (s) => s.toLowerCase() === singer.toLowerCase()
                            );
                            return (
                              <button
                                key={singer}
                                type="button"
                                onClick={() =>
                                  toggleSingerInSession(session, singer)
                                }
                                className={`ui-transition border px-2.5 py-1 text-xs font-medium cursor-pointer ${
                                  selected
                                    ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                                    : "border-[var(--rule-border)] bg-[var(--bg-surface)] text-[var(--ink-secondary)] hover:border-[var(--ink-primary)]"
                                }`}
                              >
                                {selected ? "✓ " : ""}
                                {singer}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Absent Soloists */}
                    <div className="bg-[var(--bg-paper)] p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="type-kicker text-[var(--ink-secondary)]">
                          SOLISTEN-ABWESENHEIT (SCHLIESST SOLI AUS)
                        </span>
                        {session.absentSoloistList.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              handleSessionAction(session.id, {
                                action: "update-meta",
                                absentSoloists: "",
                              })
                            }
                            className="type-kicker text-[var(--accent)] underline cursor-pointer"
                          >
                            ZURÜCKSETZEN
                          </button>
                        )}
                      </div>
                      {suggestions.soloists.length === 0 ? (
                        <p className="text-xs text-[var(--ink-muted)]">
                          Keine Solisten im Repertoire hinterlegt.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {suggestions.soloists.map((soloist) => {
                            const isAbsent = session.absentSoloistList.some(
                              (s) => s.toLowerCase() === soloist.toLowerCase()
                            );
                            return (
                              <button
                                key={soloist}
                                type="button"
                                onClick={() =>
                                  toggleAbsentSoloistInSession(session, soloist)
                                }
                                className={`ui-transition border px-2.5 py-1 text-xs font-medium cursor-pointer ${
                                  isAbsent
                                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                                    : "border-[var(--rule-border)] bg-[var(--bg-surface)] text-[var(--ink-secondary)] hover:border-[var(--ink-primary)]"
                                }`}
                              >
                                {isAbsent ? "✕ ABWESEND: " : ""}
                                {soloist}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Session Piece List */}
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="type-kicker text-[var(--ink-secondary)]">
                      PROGRAMMFOLGE DER PROBE ({session.pieces.length} STÜCKE)
                    </span>
                    {session.pieces.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          handleSessionAction(session.id, {
                            action: "clear-pieces",
                          })
                        }
                        className="type-kicker text-[var(--ink-muted)] hover:text-[var(--accent)] underline cursor-pointer"
                      >
                        LISTE LEEREN
                      </button>
                    )}
                  </div>

                  {session.pieces.length === 0 ? (
                    <div className="border border-dashed border-[var(--rule-border)] bg-[var(--bg-paper)] p-6 text-center text-xs text-[var(--ink-secondary)]">
                      Keine Stücke in dieser Probe. Füge unten manuell Stücke
                      hinzu, rücke das nächste Stück vor oder klicke auf
                      „AUTO-VORSCHLAG“.
                    </div>
                  ) : (
                    <div className="divide-y divide-[var(--rule-border)] border border-[var(--rule-border)] bg-[var(--bg-paper)]">
                      {session.pieces.map((sp, idx) => {
                        const logKey = `${session.id}_${sp.pieceId}`;
                        const isLogOpen = openLogKey === logKey;
                        const pieceLogs = session.logs.filter(
                          (l) => l.pieceId === sp.pieceId
                        );
                        const mySessionLog = currentUser
                          ? pieceLogs.find((l) => l.userId === currentUser.id)
                          : null;

                        return (
                          <div key={sp.id} className="p-3.5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-start gap-3">
                                {/* Reorder Controls */}
                                <div className="flex flex-col items-center border border-[var(--rule-border)] bg-[var(--bg-surface)] px-1.5 py-1">
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() =>
                                      handleMovePiece(session, idx, "up")
                                    }
                                    className="text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] disabled:opacity-25 cursor-pointer"
                                    title="Nach oben"
                                  >
                                    <ArrowUp className="h-3.5 w-3.5" />
                                  </button>
                                  <span className="font-mono-tabular text-xs font-bold text-[var(--ink-primary)]">
                                    {String(idx + 1).padStart(2, "0")}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={
                                      idx === session.pieces.length - 1
                                    }
                                    onClick={() =>
                                      handleMovePiece(session, idx, "down")
                                    }
                                    className="text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] disabled:opacity-25 cursor-pointer"
                                    title="Nach unten"
                                  >
                                    <ArrowDown className="h-3.5 w-3.5" />
                                  </button>
                                </div>

                                <div>
                                  <div className="flex flex-wrap items-baseline gap-2">
                                    <h4 className="type-piece-h3 text-[var(--ink-primary)]">
                                      {sp.piece.title}
                                    </h4>
                                    {sp.piece.folderNumber && (
                                      <span className="type-kicker border border-[var(--ink-primary)] bg-[var(--ink-primary)] px-1.5 py-0.5 text-[var(--bg-surface)]">
                                        MAPPE NR. {sp.piece.folderNumber}
                                      </span>
                                    )}
                                    {sp.piece.artist && (
                                      <span className="text-xs text-[var(--ink-secondary)]">
                                        — {sp.piece.artist}
                                      </span>
                                    )}
                                    {sp.isManualOverride && (
                                      <span className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[var(--ink-secondary)]">
                                        MANUELL
                                      </span>
                                    )}
                                    {!sp.eligible && sp.ineligibleReason && (
                                      <span className="type-kicker inline-flex items-center gap-1 bg-[var(--accent)] px-2 py-0.5 text-[var(--accent-ink)]">
                                        <AlertTriangle className="h-3 w-3" />
                                        {sp.ineligibleReason}
                                      </span>
                                    )}
                                  </div>

                                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--ink-secondary)]">
                                    {sp.piece.singers && (
                                      <span>
                                        Sänger:{" "}
                                        <strong className="text-[var(--ink-primary)]">
                                          {sp.piece.singers}
                                        </strong>
                                      </span>
                                    )}
                                    {sp.piece.soloists && (
                                      <span>
                                        Solist:{" "}
                                        <strong className="text-[var(--ink-primary)]">
                                          {sp.piece.soloists}
                                        </strong>
                                      </span>
                                    )}
                                    <span className="font-mono-tabular text-[var(--ink-muted)]">
                                      [{sp.piece.priorityReasons.join(" • ")}]
                                    </span>
                                  </div>

                                  {pieceLogs.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {pieceLogs.map((l) => (
                                        <span
                                          key={l.id}
                                          className="font-mono-tabular inline-flex items-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-2 py-0.5 text-[11px] text-[var(--ink-primary)]"
                                        >
                                          <Check className="h-3 w-3" />
                                          {l.userName}: Schwierigkeit{" "}
                                          {l.prevConfidence}→{l.newConfidence},
                                          Übung {l.prevPracticeNeeded}→
                                          {l.newPracticeNeeded}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Right Actions: Log & Delete */}
                              <div className="flex items-center gap-1.5 self-end sm:self-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openLogDrawer(session.id, sp.pieceId)
                                  }
                                  className={`type-kicker ui-transition inline-flex items-center gap-1.5 border px-3 py-1.5 cursor-pointer ${
                                    mySessionLog
                                      ? "border-[var(--ink-primary)] bg-[var(--bg-recessed)] text-[var(--ink-primary)]"
                                      : "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                                  }`}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {mySessionLog
                                    ? "LOG ANPASSEN"
                                    : "PROBEN-LOG"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSessionAction(session.id, {
                                      action: "remove-piece",
                                      pieceId: sp.pieceId,
                                    })
                                  }
                                  className="border border-[var(--rule-border)] bg-[var(--bg-surface)] p-1.5 text-[var(--ink-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer"
                                  title="Stück aus Probe entfernen"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Exact Player Log Drawer */}
                            {isLogOpen && (
                              <div className="mt-3 border-2 border-[var(--ink-primary)] bg-[var(--bg-surface)] p-4">
                                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                                  <span className="type-kicker text-[var(--accent)]">
                                    SPIELER-PROTOKOLL FÜR „{sp.piece.title}“ (
                                    {currentUser?.name})
                                  </span>
                                  <span className="font-mono-tabular text-[11px] text-[var(--ink-muted)]">
                                    Aktualisiert deine Repertoire-Werte
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                  <ScoreSelector
                                    label="Schwierigkeit (1 = leicht, 5 = sehr schwer)"
                                    value={logConfidence}
                                    onChange={setLogConfidence}
                                  />
                                  <ScoreSelector
                                    label="Neuer Übungsbedarf (1 = gering, 5 = hoch)"
                                    value={logPractice}
                                    onChange={setLogPractice}
                                  />
                                </div>

                                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                                  <input
                                    type="text"
                                    value={logComment}
                                    onChange={(e) =>
                                      setLogComment(e.target.value)
                                    }
                                    placeholder="Optionale Anmerkung zur Probe (z.B. Tempo, Intonation, Solo-Übergang)..."
                                    className="flex-1 border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-xs text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                                  />
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setOpenLogKey(null)}
                                      className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-[var(--ink-secondary)] cursor-pointer"
                                    >
                                      ABBRECHEN
                                    </button>
                                    <button
                                      type="button"
                                      disabled={submittingLog}
                                      onClick={() =>
                                        submitPlayerLog(session.id, sp.pieceId)
                                      }
                                      className="type-kicker bg-[var(--accent)] px-4 py-2 text-[var(--accent-ink)] cursor-pointer"
                                    >
                                      {submittingLog
                                        ? "SPEICHERT..."
                                        : "LOG SPEICHERN"}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Footer Controls: Manual Add Piece + Pull Next Piece */}
                  <div className="mt-3 flex flex-col gap-2 border border-[var(--rule-border)] bg-[var(--bg-recessed)] p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-1 items-center gap-2">
                      <select
                        value={selectedPieceToAdd[session.id] || ""}
                        onChange={(e) =>
                          setSelectedPieceToAdd((prev) => ({
                            ...prev,
                            [session.id]: e.target.value,
                          }))
                        }
                        className="flex-1 border border-[var(--rule-border)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                      >
                        <option value="">
                          + Stück manuell zur Probe hinzufügen...
                        </option>
                        {availablePiecesToAdd.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                            {p.folderNumber ? ` [Mappe ${p.folderNumber}]` : ""}
                            {p.singers ? ` (Sänger: ${p.singers})` : ""}
                            {p.soloists ? ` [Solist: ${p.soloists}]` : ""} —
                            Prio {p.priorityScore.toFixed(1)}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        disabled={!selectedPieceToAdd[session.id]}
                        onClick={async () => {
                          const pid = selectedPieceToAdd[session.id];
                          if (!pid) return;
                          await handleSessionAction(session.id, {
                            action: "add-piece",
                            pieceId: pid,
                          });
                          setSelectedPieceToAdd((prev) => ({
                            ...prev,
                            [session.id]: "",
                          }));
                        }}
                        className="type-kicker inline-flex items-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-3 py-2 text-[var(--ink-primary)] disabled:opacity-40 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" /> HINZUFÜGEN
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleSessionAction(session.id, { action: "pull-next" })
                      }
                      className="type-kicker inline-flex items-center justify-center gap-1.5 bg-[var(--ink-primary)] px-3.5 py-2 text-[var(--bg-surface)] hover:bg-[var(--accent)] cursor-pointer"
                    >
                      <FastForward className="h-3.5 w-3.5" />
                      NÄCHSTES STÜCK VORRÜCKEN
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>

      {/* Modal: Create New Rehearsal Session */}
      {showNewSessionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto border-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-6">
            <div className="type-kicker text-[var(--accent)]">
              NEUER PROBETERMIN
            </div>
            <h2 className="type-section-h2 mt-1 text-[var(--ink-primary)]">
              Probetermin anlegen
            </h2>
            <form onSubmit={handleCreateSession} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                    Bezeichnung *
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="z.B. Probe 5 / Hauptprobe"
                    className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                    Datum & Uhrzeit (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                  Ort / Raum
                </label>
                <input
                  type="text"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  placeholder="z.B. Proberaum"
                  className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                />
              </div>

              <div>
                <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                  Freitext-Zusatzinformationen zum Termin
                </label>
                <textarea
                  rows={2}
                  value={newInfo}
                  onChange={(e) => setNewInfo(e.target.value)}
                  placeholder="z.B. Schwerpunkt Bläser-Satz, Treffen 19:15 Uhr..."
                  className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                />
              </div>

              {suggestions.singers.length > 0 && (
                <div>
                  <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                    Anwesende Sänger (leer lassen = alle)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.singers.map((s) => {
                      const active = newPresentSingers.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() =>
                            setNewPresentSingers((prev) =>
                              active
                                ? prev.filter((x) => x !== s)
                                : [...prev, s]
                            )
                          }
                          className={`border px-2.5 py-1 text-xs font-medium cursor-pointer ${
                            active
                              ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] text-[var(--bg-surface)]"
                              : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-secondary)]"
                          }`}
                        >
                          {active ? "✓ " : ""}
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {suggestions.soloists.length > 0 && (
                <div>
                  <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                    Abwesende Solisten (schließt deren Soli aus)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.soloists.map((s) => {
                      const active = newAbsentSoloists.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() =>
                            setNewAbsentSoloists((prev) =>
                              active
                                ? prev.filter((x) => x !== s)
                                : [...prev, s]
                            )
                          }
                          className={`border px-2.5 py-1 text-xs font-medium cursor-pointer ${
                            active
                              ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                              : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-secondary)]"
                          }`}
                        >
                          {active ? "✕ Abwesend: " : ""}
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-[var(--ink-primary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={newIsManual}
                  onChange={(e) => setNewIsManual(e.target.checked)}
                />
                Leere Probe für komplett manuelle Stückauswahl anlegen
              </label>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewSessionModal(false)}
                  className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-paper)] px-4 py-2.5 text-[var(--ink-secondary)] cursor-pointer"
                >
                  ABBRECHEN
                </button>
                <button
                  type="submit"
                  className="type-kicker bg-[var(--accent)] px-5 py-2.5 text-[var(--accent-ink)] cursor-pointer"
                >
                  PROBETERMIN ANLEGEN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Session Metadata */}
      {editingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg border-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-6">
            <div className="type-kicker text-[var(--accent)]">
              TERMIN-BEARBEITUNG
            </div>
            <h2 className="type-section-h2 mt-1 text-[var(--ink-primary)]">
              Probetermin & Zusatzinfos
            </h2>
            <form onSubmit={handleSaveSessionMeta} className="mt-5 space-y-4">
              <div>
                <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                  Bezeichnung
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                    Datum & Uhrzeit
                  </label>
                  <input
                    type="datetime-local"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                    Ort / Raum
                  </label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    placeholder="z.B. Proberaum"
                    className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                  Freitext-Zusatzinformationen zum Termin
                </label>
                <textarea
                  rows={3}
                  value={editInfo}
                  onChange={(e) => setEditInfo(e.target.value)}
                  placeholder="Beliebige Zusatzinformationen für diesen Termin..."
                  className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingSession(null)}
                  className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-paper)] px-4 py-2.5 text-[var(--ink-secondary)] cursor-pointer"
                >
                  ABBRECHEN
                </button>
                <button
                  type="submit"
                  className="type-kicker bg-[var(--accent)] px-5 py-2.5 text-[var(--accent-ink)] cursor-pointer"
                >
                  SPEICHERN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
