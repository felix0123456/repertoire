"use client";

import React from "react";
import { CheckCircle2, History, RotateCcw, Calendar } from "lucide-react";
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
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-lg">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-100">
          <History className="h-5 w-5 text-amber-400" />
          Abgeschlossene Proben & Spieler-Protokolle
        </h2>
        <p className="text-xs text-slate-400">
          Dokumentation aller absolvierten Proben und der von den Spielern
          protokollierten Fortschritte bei Sicherheit und Übungsbedarf.
        </p>
      </div>

      {completedSessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
          <History className="mx-auto h-10 w-10 text-slate-600" />
          <h3 className="mt-3 text-base font-semibold text-slate-200">
            Noch keine abgeschlossenen Proben
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Sobald eine Probe im Probeplan abgeschlossen wird, erscheint sie
            hier mit allen Spieler-Logs.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {completedSessions.map((s) => (
            <div
              key={s.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-md"
            >
              <div className="flex flex-col gap-3 border-b border-slate-800 pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <h3 className="text-base font-bold text-slate-100">
                      {s.title}
                    </h3>
                    <span className="text-xs text-slate-400">
                      (Abgeschlossen am{" "}
                      {s.completedAt
                        ? new Date(s.completedAt).toLocaleDateString("de-DE")
                        : "–"}
                      )
                    </span>
                  </div>
                  {s.scheduledDate && (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                      <Calendar className="h-3.5 w-3.5" />
                      Termin:{" "}
                      {new Date(s.scheduledDate).toLocaleString("de-DE")}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleReopen(s.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 hover:border-amber-500 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Wieder öffnen
                </button>
              </div>

              <div className="mt-3">
                <div className="text-xs font-semibold text-slate-400">
                  Geprobte Stücke ({s.pieces.length}):
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {s.pieces.map((sp, i) => (
                    <span
                      key={sp.id}
                      className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-200"
                    >
                      {i + 1}. {sp.piece.title}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <div className="text-xs font-semibold text-slate-400">
                  Spieler-Logs ({s.logs.length}):
                </div>
                {s.logs.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Keine Einzel-Logs für diese Probe eingetragen.
                  </p>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {s.logs.map((l) => (
                      <div
                        key={l.id}
                        className="flex flex-col justify-between gap-2 rounded-xl border border-slate-800/80 bg-slate-950/70 px-3 py-2 text-xs sm:flex-row sm:items-center"
                      >
                        <div>
                          <strong className="text-amber-300">
                            {l.userName}
                          </strong>{" "}
                          zu{" "}
                          <strong className="text-slate-100">
                            {l.pieceTitle}
                          </strong>
                          {l.comment && (
                            <span className="ml-2 italic text-slate-400">
                              „{l.comment}“
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-emerald-300">
                            Sicherheit: {l.prevConfidence} →{" "}
                            <strong>{l.newConfidence}</strong>/5
                          </span>
                          <span className="text-rose-300">
                            Übungsbedarf: {l.prevPracticeNeeded} →{" "}
                            <strong>{l.newPracticeNeeded}</strong>/5
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

