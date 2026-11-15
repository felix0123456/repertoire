"use client";

import React, { useState } from "react";
import {
  Calendar,
  Play,
  CheckCircle2,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Lock,
  Unlock,
  Mic,
  Guitar,
  FastForward,
  AlertTriangle,
  Edit3,
  Check,
  MapPin,
  FileText,
  Sliders,
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

  const upcomingSessions = sessions.filter((s) => s.status !== "COMPLETED");

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
    <div className="space-y-6">
      {/* Configuration & Mode Bar */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-lg">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-100">
              <Sliders className="h-5 w-5 text-amber-400" />
              Probenplan-Steuerung
            </h2>
            <p className="text-xs text-slate-400">
              Wähle zwischen einfacher Probenanzahl, konkreten Probeterminen
              (mit Sänger-Anwesenheit & Solisten-Abwesenheit) oder komplett
              manueller Planung.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                {
                  id: "SIMPLE_COUNT",
                  label: "Einfache Probenanzahl",
                },
                {
                  id: "EXACT_DATES",
                  label: "Konkrete Probetermine",
                },
                {
                  id: "MANUAL",
                  label: "Komplett Manuell",
                },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setPlanningMode(m.id);
                  handleSaveConfig(m.id, sessionsCount, piecesPerSession);
                }}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition cursor-pointer ${
                  planningMode === m.id
                    ? "bg-amber-500 text-slate-950 shadow-md"
                    : "border border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-600"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Settings Row */}
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-slate-800/80 pt-4">
          <div className="flex flex-wrap items-end gap-4">
            {planningMode === "SIMPLE_COUNT" && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300">
                  Verbleibende Proben bis zum Auftritt
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
                    className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm font-bold text-amber-400 focus:border-amber-500 focus:outline-none"
                  />
                  <span className="text-xs text-slate-400">Proben</span>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                Ziel-Stückzahl pro Probe
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
                  className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm font-bold text-slate-100 focus:border-amber-500 focus:outline-none"
                />
                <span className="text-xs text-slate-400">Stücke / Probe</span>
              </div>
            </div>

            <button
              type="button"
              disabled={savingConfig}
              onClick={() => handleSaveConfig()}
              className="rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 cursor-pointer"
            >
              {savingConfig ? "Berechnet..." : "Einstellungen anwenden"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setNewTitle(`Probe ${sessions.length + 1}`);
                setShowNewSessionModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Probetermin hinzufügen
            </button>
          </div>
        </div>
      </div>

      {errorBanner && (
        <div className="flex items-center justify-between rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 py-3 text-sm text-rose-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-xs underline"
          >
            Schließen
          </button>
        </div>
      )}

      {/* Sessions List */}
      {upcomingSessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
          <Calendar className="mx-auto h-10 w-10 text-slate-600" />
          <h3 className="mt-3 text-base font-semibold text-slate-200">
            Keine anstehenden Proben geplant
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Lege einen neuen Probetermin an oder erhöhe die Anzahl
            verbleibender Proben.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {upcomingSessions.map((session) => {
            const isActive = session.status === "ACTIVE";
            const availablePiecesToAdd = pieces.filter(
              (p) => !session.pieces.some((sp) => sp.pieceId === p.id)
            );

            return (
              <div
                key={session.id}
                className={`rounded-2xl border p-5 shadow-lg transition ${
                  isActive
                    ? "border-emerald-500/60 bg-emerald-950/15 ring-1 ring-emerald-500/30"
                    : "border-slate-800 bg-slate-900/75"
                }`}
              >
                {/* Session Header */}
                <div className="flex flex-col gap-4 border-b border-slate-800/80 pb-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="rounded-lg bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-300 border border-amber-500/30">
                        #{session.sessionNumber}
                      </span>
                      <h3 className="text-xl font-bold text-slate-100">
                        {session.title}
                      </h3>
                      {isActive && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-0.5 text-xs font-bold text-emerald-300 border border-emerald-500/40 animate-pulse">
                          ● Laufende Probe (Live)
                        </span>
                      )}
                      {session.isLocked ? (
                        <span
                          title="Manuell bearbeitet oder fixiert – wird nicht automatisch überschrieben"
                          className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-medium text-slate-300 border border-slate-700"
                        >
                          <Lock className="h-3 w-3 text-amber-400" /> Manuell
                          fixiert
                        </span>
                      ) : (
                        <span
                          title="Wird automatisch nach Übungsbedarf & Anwesenheit aktualisiert"
                          className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[11px] font-medium text-indigo-300 border border-indigo-500/30"
                        >
                          <Sparkles className="h-3 w-3" /> Auto-Planung
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-amber-400" />
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
                          : "Kein festes Datum (flexibel)"}
                      </span>
                      {session.location && (
                        <span className="inline-flex items-center gap-1.5 text-slate-300">
                          <MapPin className="h-3.5 w-3.5 text-cyan-400" />
                          {session.location}
                        </span>
                      )}
                    </div>

                    {session.additionalInfo && (
                      <div className="mt-2 flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-200">
                        <FileText className="mt-0.5 h-3.5 w-3.5 text-amber-400 shrink-0" />
                        <div className="whitespace-pre-wrap">
                          {session.additionalInfo}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Session Control Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditSessionModal(session)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-amber-500 cursor-pointer"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Termin & Infos bearbeiten
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleSessionAction(session.id, {
                          action: "toggle-lock",
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500 cursor-pointer"
                      title={
                        session.isLocked
                          ? "Fixierung aufheben"
                          : "Aktuelle Stückliste & Reihenfolge fixieren"
                      }
                    >
                      {session.isLocked ? (
                        <>
                          <Unlock className="h-3.5 w-3.5 text-amber-400" />
                          Entsperren
                        </>
                      ) : (
                        <>
                          <Lock className="h-3.5 w-3.5 text-slate-400" />
                          Fixieren
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleSessionAction(session.id, { action: "auto-fill" })
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/15 px-3 py-1.5 text-xs font-medium text-indigo-200 hover:bg-indigo-500/25 cursor-pointer"
                      title="Stücke für diese Probe anhand von Übungsbedarf, Sänger-Anwesenheit und Solisten-Abwesenheit neu berechnen"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Auto-Vorschlag
                    </button>

                    {!isActive ? (
                      <button
                        type="button"
                        onClick={() =>
                          handleSessionAction(session.id, { action: "start" })
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 cursor-pointer"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Probe starten
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          handleSessionAction(session.id, {
                            action: "complete",
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 cursor-pointer"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Probe abschließen
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDeleteSession(session)}
                      className="rounded-xl border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:border-rose-500/40 hover:text-rose-400 cursor-pointer"
                      title="Probe löschen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Attendance Filters: Present Singers & Absent Soloists */}
                {(suggestions.singers.length > 0 ||
                  suggestions.soloists.length > 0) && (
                  <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-800/90 bg-slate-950/60 p-3.5 lg:grid-cols-2">
                    {/* Anwesende Sänger */}
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                          <Mic className="h-3.5 w-3.5 text-amber-400" />
                          Anwesende Sänger (Filtert nur Lieder dieser Sänger):
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
                            className="text-[11px] text-amber-400 hover:underline cursor-pointer"
                          >
                            Alle erlauben
                          </button>
                        )}
                      </div>
                      {suggestions.singers.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          Noch keine Sänger bei den Stücken hinterlegt.
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
                                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                                  selected
                                    ? "border-amber-400 bg-amber-500 text-slate-950 font-bold"
                                    : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
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

                    {/* Abwesende Solisten */}
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                          <Guitar className="h-3.5 w-3.5 text-rose-400" />
                          Abwesende Solisten (Schließt deren Solo-Stücke aus):
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
                            className="text-[11px] text-rose-400 hover:underline cursor-pointer"
                          >
                            Zurücksetzen
                          </button>
                        )}
                      </div>
                      {suggestions.soloists.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          Noch keine Solisten bei den Stücken hinterlegt.
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
                                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                                  isAbsent
                                    ? "border-rose-400 bg-rose-500 text-white font-bold"
                                    : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                                }`}
                              >
                                {isAbsent ? "✕ Abwesend: " : ""}
                                {soloist}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Pieces in this Rehearsal Session */}
                <div className="mt-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
                    <span>
                      Geplante Stücke ({session.pieces.length}) – Reihenfolge &
                      Protokoll
                    </span>
                    {session.pieces.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          handleSessionAction(session.id, {
                            action: "clear-pieces",
                          })
                        }
                        className="text-[11px] font-normal text-slate-400 hover:text-rose-400 cursor-pointer"
                      >
                        Alle Stücke aus Probe leeren
                      </button>
                    )}
                  </div>

                  {session.pieces.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-6 text-center text-xs text-slate-400">
                      Noch keine Stücke in dieser Probe. Füge unten manuell
                      Stücke hinzu, rücke das nächste Stück vor oder klicke auf
                      „Auto-Vorschlag“.
                    </div>
                  ) : (
                    <div className="space-y-2">
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
                          <div
                            key={sp.id}
                            className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 transition hover:border-slate-700"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-start gap-3">
                                {/* Reorder Controls */}
                                <div className="flex flex-col items-center gap-0.5 pt-0.5">
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() =>
                                      handleMovePiece(session, idx, "up")
                                    }
                                    className="rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-25 cursor-pointer"
                                    title="Nach oben schieben"
                                  >
                                    <ArrowUp className="h-3.5 w-3.5" />
                                  </button>
                                  <span className="text-xs font-bold text-amber-400">
                                    {idx + 1}.
                                  </span>
                                  <button
                                    type="button"
                                    disabled={
                                      idx === session.pieces.length - 1
                                    }
                                    onClick={() =>
                                      handleMovePiece(session, idx, "down")
                                    }
                                    className="rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-25 cursor-pointer"
                                    title="Nach unten schieben"
                                  >
                                    <ArrowDown className="h-3.5 w-3.5" />
                                  </button>
                                </div>

                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-bold text-slate-100">
                                      {sp.piece.title}
                                    </span>
                                    {sp.piece.artist && (
                                      <span className="text-xs text-slate-400">
                                        ({sp.piece.artist})
                                      </span>
                                    )}
                                    {sp.isManualOverride && (
                                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                                        Manuell
                                      </span>
                                    )}
                                    {!sp.eligible && sp.ineligibleReason && (
                                      <span className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 text-[11px] font-medium text-rose-300 border border-rose-500/30">
                                        <AlertTriangle className="h-3 w-3" />
                                        {sp.ineligibleReason}
                                      </span>
                                    )}
                                  </div>

                                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                                    {sp.piece.singers && (
                                      <span>
                                        🎤{" "}
                                        <strong className="text-slate-200">
                                          {sp.piece.singers}
                                        </strong>
                                      </span>
                                    )}
                                    {sp.piece.soloists && (
                                      <span>
                                        🎸{" "}
                                        <strong className="text-slate-200">
                                          {sp.piece.soloists}
                                        </strong>
                                      </span>
                                    )}
                                    <span className="text-amber-300/90">
                                      {sp.piece.priorityReasons.join(" • ")}
                                    </span>
                                  </div>

                                  {/* Logged players badges */}
                                  {pieceLogs.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {pieceLogs.map((l) => (
                                        <span
                                          key={l.id}
                                          className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 border border-emerald-500/25"
                                        >
                                          <Check className="h-3 w-3" />
                                          {l.userName}: Sicherheit{" "}
                                          {l.prevConfidence}→{l.newConfidence},
                                          Übung {l.prevPracticeNeeded}→
                                          {l.newPracticeNeeded}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Right Actions: Log feedback & Remove from Session */}
                              <div className="flex items-center gap-2 self-end sm:self-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openLogDrawer(session.id, sp.pieceId)
                                  }
                                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                                    mySessionLog
                                      ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                                      : "bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30"
                                  }`}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {mySessionLog
                                    ? "Mein Log anpassen"
                                    : "Proben-Log eintragen"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSessionAction(session.id, {
                                      action: "remove-piece",
                                      pieceId: sp.pieceId,
                                    })
                                  }
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/15 hover:text-rose-400 cursor-pointer"
                                  title="Stück aus dieser Probe entfernen"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            {/* Expandable Exact Player Log Form */}
                            {isLogOpen && (
                              <div className="mt-3 rounded-xl border border-amber-500/30 bg-slate-900 p-4">
                                <div className="mb-3 flex items-center justify-between">
                                  <span className="text-xs font-bold text-amber-300">
                                    Proben-Feedback für „{sp.piece.title}“ (
                                    {currentUser?.name})
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    Aktualisiert deine Werte & speichert das
                                    Protokoll
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                  <ScoreSelector
                                    label="Wie sicher fühlst du dich jetzt? (1 = unsicher, 5 = sehr sicher)"
                                    value={logConfidence}
                                    onChange={setLogConfidence}
                                    colorScheme="emerald"
                                  />
                                  <ScoreSelector
                                    label="Wie viel Übungsbedarf besteht noch? (1 = gering, 5 = hoch)"
                                    value={logPractice}
                                    onChange={setLogPractice}
                                    colorScheme="rose"
                                  />
                                </div>

                                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                                  <input
                                    type="text"
                                    value={logComment}
                                    onChange={(e) =>
                                      setLogComment(e.target.value)
                                    }
                                    placeholder="Optionaler Hinweis (z.B. Übergang zum Refrain noch unsauber)..."
                                    className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                                  />
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setOpenLogKey(null)}
                                      className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
                                    >
                                      Abbrechen
                                    </button>
                                    <button
                                      type="button"
                                      disabled={submittingLog}
                                      onClick={() =>
                                        submitPlayerLog(session.id, sp.pieceId)
                                      }
                                      className="rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 cursor-pointer"
                                    >
                                      {submittingLog
                                        ? "Speichert..."
                                        : "Log speichern"}
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

                  {/* Bottom Bar: Add Piece Manually OR Pull Next Automatically */}
                  <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-800/90 bg-slate-950/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-1 items-center gap-2">
                      <select
                        value={selectedPieceToAdd[session.id] || ""}
                        onChange={(e) =>
                          setSelectedPieceToAdd((prev) => ({
                            ...prev,
                            [session.id]: e.target.value,
                          }))
                        }
                        className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                      >
                        <option value="">
                          + Stück manuell zur Probe hinzufügen...
                        </option>
                        {availablePiecesToAdd.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                            {p.singers ? ` (🎤 ${p.singers})` : ""}
                            {p.soloists ? ` [🎸 ${p.soloists}]` : ""} – Prio{" "}
                            {p.priorityScore.toFixed(1)}
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
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" /> Hinzufügen
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        handleSessionAction(session.id, { action: "pull-next" })
                      }
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3.5 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 cursor-pointer"
                      title="Zieht automatisch das dringendste noch nicht enthaltene Stück (passend zu anwesenden Sängern & ohne abwesende Solisten) in diese Probe"
                    >
                      <FastForward className="h-3.5 w-3.5" />
                      Nächstes Stück automatisch vorrücken
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create New Rehearsal Session */}
      {showNewSessionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-100">
              Neuen Probetermin anlegen
            </h2>
            <form onSubmit={handleCreateSession} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Bezeichnung *
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="z.B. Probe 5 / Generalprobe"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Datum & Uhrzeit (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Ort / Raum
                </label>
                <input
                  type="text"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  placeholder="z.B. Proberaum / Gemeindesaal"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Freitext-Zusatzinformationen zum Termin
                </label>
                <textarea
                  rows={2}
                  value={newInfo}
                  onChange={(e) => setNewInfo(e.target.value)}
                  placeholder="z.B. Schwerpunkt Bläser-Satz, Treffen 19:15 Uhr..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              {suggestions.singers.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
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
                          className={`rounded-lg border px-2.5 py-1 text-xs font-medium cursor-pointer ${
                            active
                              ? "border-amber-400 bg-amber-500 text-slate-950 font-bold"
                              : "border-slate-700 bg-slate-950 text-slate-300"
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
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Abwesende Solisten (schließt deren Solo-Stücke aus)
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
                          className={`rounded-lg border px-2.5 py-1 text-xs font-medium cursor-pointer ${
                            active
                              ? "border-rose-400 bg-rose-500 text-white font-bold"
                              : "border-slate-700 bg-slate-950 text-slate-300"
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

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newIsManual}
                  onChange={(e) => setNewIsManual(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-amber-500"
                />
                Leere Probe für komplett manuelle Stückauswahl anlegen (ohne
                Auto-Befüllung)
              </label>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewSessionModal(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer"
                >
                  Probetermin anlegen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Session Metadata */}
      {editingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-100">
              Probetermin & Zusatzinfos bearbeiten
            </h2>
            <form onSubmit={handleSaveSessionMeta} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Bezeichnung
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Datum & Uhrzeit
                  </label>
                  <input
                    type="datetime-local"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Ort / Raum
                  </label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    placeholder="z.B. Proberaum"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Freitext-Zusatzinformationen zum Termin
                </label>
                <textarea
                  rows={3}
                  value={editInfo}
                  onChange={(e) => setEditInfo(e.target.value)}
                  placeholder="Beliebige Zusatzinformationen für diesen Termin..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingSession(null)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer"
                >
                  Speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

