"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { RotateCcw, QrCode, Share2, Check } from "lucide-react";
import { RehearsalSessionItem } from "@/types";
import SessionQrModal from "./SessionQrModal";
import { buildAppShareUrl, shareOrCopyLink } from "@/lib/share";

interface HistorieTabProps {
  sessions: RehearsalSessionItem[];
  onRefresh: () => Promise<void>;
  focusedSessionId?: string | null;
  onClearFocusedSession?: () => void;
}

export default function HistorieTab({
  sessions,
  onRefresh,
  focusedSessionId,
  onClearFocusedSession,
}: HistorieTabProps) {
  const completedSessions = useMemo(
    () => sessions.filter((s) => s.status === "COMPLETED"),
    [sessions]
  );
  const [qrModalSession, setQrModalSession] =
    useState<RehearsalSessionItem | null>(null);
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
  const [highlightedSessionId, setHighlightedSessionId] = useState<
    string | null
  >(null);
  const lastHandledSessionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusedSessionId) {
      lastHandledSessionRef.current = null;
      return;
    }
    if (
      lastHandledSessionRef.current === focusedSessionId ||
      completedSessions.length === 0
    ) {
      return;
    }
    const normalized = String(focusedSessionId).trim().replace(/^#/, "");
    const numeric = Number(normalized);
    const matched = completedSessions.find(
      (s) =>
        s.id === normalized ||
        String(s.sessionNumber) === normalized ||
        (!Number.isNaN(numeric) &&
          normalized !== "" &&
          s.sessionNumber === numeric)
    );
    if (!matched) return;

    lastHandledSessionRef.current = focusedSessionId;
    setHighlightedSessionId(matched.id);
    const timer = setTimeout(() => {
      const el = document.getElementById(`history-session-${matched.id}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      onClearFocusedSession?.();
    }, 100);
    return () => clearTimeout(timer);
  }, [focusedSessionId, completedSessions, onClearFocusedSession]);

  const handleShareCompletedSession = async (s: RehearsalSessionItem) => {
    const url = buildAppShareUrl({
      tab: "historie",
      session: s.id,
    });
    const res = await shareOrCopyLink({
      url,
      title: `Proben-Protokoll #${String(s.sessionNumber).padStart(2, "0")}: ${
        s.title
      }`,
    });
    if (res === "copied" || res === "shared") {
      setCopiedSessionId(s.id);
      setTimeout(() => {
        setCopiedSessionId((prev) => (prev === s.id ? null : prev));
      }, 2400);
    }
  };

  const handleReopen = async (sessionId: string) => {
    await fetch(`/api/rehearsals/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reopen" }),
    });
    await onRefresh();
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      {/* Left Rail: Columns 1–4 */}
      <aside className="lg:col-span-4">
        <div className="sticky top-36 space-y-4 border-t-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-5 border-x border-b border-x-[var(--rule-border)] border-b-[var(--rule-border)]">
          <div className="type-kicker text-[var(--ink-muted)]">
            ARCHIV & VERLAUF
          </div>
          <h2 className="type-section-h2 text-[var(--ink-primary)]">
            Proben-Protokolle
          </h2>
          <p className="text-xs text-[var(--ink-secondary)]">
            Chronologische Dokumentation aller abgeschlossenen Proben sowie der
            exakten Vorher-Nachher-Bewertungen jedes Spielers.
          </p>
          <div className="font-mono-tabular border-t border-[var(--rule-border)] pt-3 text-xs text-[var(--ink-secondary)]">
            ABGESCHLOSSENE PROBEN:{" "}
            <strong className="text-[var(--ink-primary)]">
              {completedSessions.length}
            </strong>
          </div>
        </div>
      </aside>

      {/* Right Main Column: Columns 5–12 */}
      <section className="space-y-4 lg:col-span-8">
        {completedSessions.length === 0 ? (
          <div className="border-t-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-12 text-center border-x border-b border-x-[var(--rule-border)] border-b-[var(--rule-border)]">
            <div className="type-kicker text-[var(--ink-muted)]">
              ARCHIV LEER
            </div>
            <h3 className="type-section-h2 mt-2 text-[var(--ink-primary)]">
              Noch keine abgeschlossenen Proben
            </h3>
            <p className="mt-1 text-sm text-[var(--ink-secondary)]">
              Sobald eine Sitzung im Probeplan abgeschlossen wird, erscheint sie
              hier inklusive aller Spieler-Protokolle.
            </p>
          </div>
        ) : (
          completedSessions.map((s, idx) => (
            <article
              id={`history-session-${s.id}`}
              key={s.id}
              style={
                {
                  "--stagger-index": Math.min(idx, 8),
                } as React.CSSProperties
              }
              className={`stagger-item border-t-2 bg-[var(--bg-surface)] p-5 sm:p-6 border-x border-b ${
                highlightedSessionId === s.id
                  ? "border-t-[var(--accent)] border-x-2 border-b-2 border-[var(--accent)]"
                  : "border-[var(--rule-heavy)] border-x-[var(--rule-border)] border-b-[var(--rule-border)]"
              }`}
            >
              {highlightedSessionId === s.id && (
                <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2 border border-[var(--accent)] bg-[var(--bg-recessed)] px-3 py-1.5">
                  <span className="type-kicker font-bold text-[var(--accent)]">
                    ● DIREKT-ZUGANG (LINK / QR-CODE): PROBEN-PROTOKOLL #
                    {String(s.sessionNumber).padStart(2, "0")} — {s.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setHighlightedSessionId(null);
                      onClearFocusedSession?.();
                    }}
                    className="type-kicker text-[10px] text-[var(--ink-secondary)] underline cursor-pointer"
                  >
                    HINWEIS SCHLIESSEN
                  </button>
                </div>
              )}
              <div className="flex flex-col gap-3 border-b border-[var(--rule-border)] pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="type-kicker border border-[var(--ink-primary)] bg-[var(--bg-recessed)] px-2 py-0.5 text-[var(--ink-primary)]">
                      ARCHIV #{String(s.sessionNumber).padStart(2, "0")}
                    </span>
                    <h3 className="type-piece-h3 text-[var(--ink-primary)]">
                      {s.title}
                    </h3>
                  </div>
                  <div className="font-mono-tabular mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--ink-secondary)]">
                    <span>
                      ABGESCHLOSSEN AM:{" "}
                      {s.completedAt
                        ? new Date(s.completedAt).toLocaleDateString("de-DE")
                        : "—"}
                    </span>
                    {s.attendance && s.attendance.length > 0 && (
                      <span>
                        • KONZERTMEISTER: ✓{" "}
                        {
                          s.attendance.filter((a) => a.status === "PRESENT")
                            .length
                        }{" "}
                        Zugesagt · ✗{" "}
                        {
                          s.attendance.filter((a) => a.status === "ABSENT")
                            .length
                        }{" "}
                        Abgesagt
                      </span>
                    )}
                    {s.totalEstimatedMinutes > 0 && (
                      <span>• ⏱ ~{s.totalEstimatedMinutes} Min.</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQrModalSession(s)}
                    className="type-kicker inline-flex items-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-recessed)] px-2.5 py-1.5 font-bold text-[var(--ink-primary)] hover:bg-[var(--ink-primary)] hover:text-[var(--bg-surface)] cursor-pointer"
                  >
                    <QrCode className="h-3.5 w-3.5" /> QR-CODE
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShareCompletedSession(s)}
                    className={`type-kicker inline-flex items-center gap-1 border px-2.5 py-1.5 cursor-pointer ${
                      copiedSessionId === s.id
                        ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] font-bold text-[var(--bg-surface)]"
                        : "border-[var(--rule-border)] bg-[var(--bg-paper)] text-[var(--ink-primary)] hover:border-[var(--ink-primary)]"
                    }`}
                  >
                    {copiedSessionId === s.id ? (
                      <>
                        <Check className="h-3.5 w-3.5" /> KOPIERT!
                      </>
                    ) : (
                      <>
                        <Share2 className="h-3.5 w-3.5" /> TEILEN
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReopen(s.id)}
                    className="type-kicker inline-flex items-center gap-1 border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-1.5 text-[var(--ink-primary)] hover:border-[var(--ink-primary)] cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> WIEDER ÖFFNEN
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <div className="type-kicker text-[var(--ink-muted)]">
                  GEPROBTE STÜCKE & PROBEN-TEMPO ({s.pieces.length})
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {s.pieces.map((sp, i) => (
                    <div
                      key={sp.id}
                      className="border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2.5 py-1.5 text-xs text-[var(--ink-primary)]"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <strong className="font-mono-tabular">
                          {String(i + 1).padStart(2, "0")}.
                        </strong>
                        {sp.piece.folderNumber && (
                          <span className="font-mono-tabular border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-1 py-0.5 text-[10px] font-bold">
                            #{sp.piece.folderNumber}
                          </span>
                        )}
                        <span className="font-semibold">{sp.piece.title}</span>
                        {sp.piece.bpm > 0 && (
                          <span className="font-mono-tabular text-[11px] text-[var(--ink-secondary)]">
                            (♩ Ziel: {sp.piece.bpm} BPM)
                          </span>
                        )}
                        {sp.sessionBpm > 0 && (
                          <span className="font-mono-tabular border border-[var(--accent)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent)]">
                            ♩ Proben-Tempo: {sp.sessionBpm} BPM
                          </span>
                        )}
                      </div>
                      {sp.sessionBpmComment && (
                        <div className="mt-0.5 text-[11px] italic text-[var(--ink-secondary)]">
                          Tempo-Notiz: „{sp.sessionBpmComment}“
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <div className="type-kicker text-[var(--ink-muted)]">
                  SPIELER-PROTOKOLLE ({s.logs.length})
                </div>
                {s.logs.length === 0 ? (
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">
                    Keine Einzel-Protokolle für diese Probe eingetragen.
                  </p>
                ) : (
                  <div className="mt-2 divide-y divide-[var(--rule-border)] border border-[var(--rule-border)] bg-[var(--bg-paper)]">
                    {s.logs.map((l) => (
                      <div
                        key={l.id}
                        className="flex flex-col justify-between gap-2 px-3 py-2 text-xs sm:flex-row sm:items-center"
                      >
                        <div>
                          <strong className="text-[var(--ink-primary)]">
                            {l.userName}
                          </strong>{" "}
                          —{" "}
                          <span className="font-medium text-[var(--ink-primary)]">
                            {l.pieceTitle}
                          </span>
                          {l.comment && (
                            <span className="ml-2 italic text-[var(--ink-secondary)]">
                              „{l.comment}“
                            </span>
                          )}
                        </div>
                        <div className="font-mono-tabular flex items-center gap-4 text-[var(--ink-secondary)]">
                          <span>
                            Schwierigkeit: {l.prevConfidence} →{" "}
                            <strong className="text-[var(--ink-primary)]">
                              {l.newConfidence}/5
                            </strong>
                          </span>
                          <span>
                            Übungsbedarf: {l.prevPracticeNeeded} →{" "}
                            <strong className="text-[var(--ink-primary)]">
                              {l.newPracticeNeeded}/5
                            </strong>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))
        )}
      </section>

      <SessionQrModal
        session={qrModalSession}
        onClose={() => setQrModalSession(null)}
      />
    </div>
  );
}
