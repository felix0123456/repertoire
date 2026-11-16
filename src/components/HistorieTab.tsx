"use client";

import React from "react";
import { RotateCcw } from "lucide-react";
import { RehearsalSessionItem } from "@/types";

interface HistorieTabProps {
  sessions: RehearsalSessionItem[];
  onRefresh: () => Promise<void>;
}

export default function HistorieTab({
  sessions,
  onRefresh,
}: HistorieTabProps) {
  const completedSessions = sessions.filter((s) => s.status === "COMPLETED");

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
              key={s.id}
              style={
                {
                  "--stagger-index": Math.min(idx, 8),
                } as React.CSSProperties
              }
              className="stagger-item border-t-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-5 sm:p-6 border-x border-b border-x-[var(--rule-border)] border-b-[var(--rule-border)]"
            >
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
                  <div className="font-mono-tabular mt-1 text-xs text-[var(--ink-secondary)]">
                    ABGESCHLOSSEN AM:{" "}
                    {s.completedAt
                      ? new Date(s.completedAt).toLocaleDateString("de-DE")
                      : "—"}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleReopen(s.id)}
                  className="type-kicker inline-flex items-center gap-1 border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-1.5 text-[var(--ink-primary)] hover:border-[var(--ink-primary)] cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> WIEDER ÖFFNEN
                </button>
              </div>

              <div className="mt-4">
                <div className="type-kicker text-[var(--ink-muted)]">
                  GEPROBTE STÜCKE ({s.pieces.length})
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {s.pieces.map((sp, i) => (
                    <span
                      key={sp.id}
                      className="border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2.5 py-1 text-xs text-[var(--ink-primary)]"
                    >
                      <strong className="font-mono-tabular">
                        {String(i + 1).padStart(2, "0")}.
                      </strong>{" "}
                      {sp.piece.title}
                    </span>
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
    </div>
  );
}
