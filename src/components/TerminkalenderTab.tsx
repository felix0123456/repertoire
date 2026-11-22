"use client";

import React, { useState, useMemo } from "react";
import {
  Plus,
  Edit3,
  Trash2,
  ArrowRight,
  QrCode,
  Share2,
  Check,
} from "lucide-react";
import {
  ConcertEventItem,
  RehearsalSessionItem,
  SuggestionsData,
} from "@/types";
import SessionQrModal from "./SessionQrModal";
import { buildAppShareUrl, shareOrCopyLink } from "@/lib/share";

interface TerminkalenderTabProps {
  sessions: RehearsalSessionItem[];
  concerts: ConcertEventItem[];
  suggestions: SuggestionsData;
  onRefresh: () => Promise<void>;
  onOpenProbeplan: (sessionId?: string) => void;
}

type CalendarEntry =
  | {
    kind: "CONCERT";
    dateMs: number;
    concert: ConcertEventItem;
  }
  | {
    kind: "REHEARSAL";
    dateMs: number;
    session: RehearsalSessionItem;
  };

export default function TerminkalenderTab({
  sessions,
  concerts,
  suggestions,
  onRefresh,
  onOpenProbeplan,
}: TerminkalenderTabProps) {
  const [showConcertModal, setShowConcertModal] = useState(false);
  const [editingConcert, setEditingConcert] =
    useState<ConcertEventItem | null>(null);
  const [concertTitle, setConcertTitle] = useState("");
  const [concertDate, setConcertDate] = useState("");
  const [concertLocation, setConcertLocation] = useState("");
  const [concertInfo, setConcertInfo] = useState("");

  const [showRehearsalModal, setShowRehearsalModal] = useState(false);
  const [editingRehearsal, setEditingRehearsal] =
    useState<RehearsalSessionItem | null>(null);
  const [rehTitle, setRehTitle] = useState("");
  const [rehDate, setRehDate] = useState("");
  const [rehLocation, setRehLocation] = useState("");
  const [rehInfo, setRehInfo] = useState("");
  const [rehPresentSingers, setRehPresentSingers] = useState<string[]>([]);
  const [rehAbsentSoloists, setRehAbsentSoloists] = useState<string[]>([]);

  const [qrModalSession, setQrModalSession] =
    useState<RehearsalSessionItem | null>(null);
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);

  const handleShareRehearsalLink = async (s: RehearsalSessionItem) => {
    const url = buildAppShareUrl({
      tab: s.status === "COMPLETED" ? "historie" : "probeplan",
      session: s.id,
    });
    const res = await shareOrCopyLink({
      url,
      title: `Probe #${String(s.sessionNumber).padStart(2, "0")}: ${s.title}`,
    });
    if (res === "copied" || res === "shared") {
      setCopiedSessionId(s.id);
      setTimeout(() => {
        setCopiedSessionId((prev) => (prev === s.id ? null : prev));
      }, 2400);
    }
  };

  const openCreateConcert = () => {
    setEditingConcert(null);
    setConcertTitle("");
    setConcertDate("");
    setConcertLocation("");
    setConcertInfo("");
    setShowConcertModal(true);
  };

  const openEditConcert = (c: ConcertEventItem) => {
    setEditingConcert(c);
    setConcertTitle(c.title);
    setConcertDate(
      c.scheduledDate
        ? new Date(c.scheduledDate).toISOString().slice(0, 16)
        : ""
    );
    setConcertLocation(c.location || "");
    setConcertInfo(c.additionalInfo || "");
    setShowConcertModal(true);
  };

  const handleSaveConcert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!concertTitle.trim()) return;
    if (editingConcert) {
      await fetch(`/api/concerts/${editingConcert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: concertTitle,
          scheduledDate: concertDate || null,
          location: concertLocation,
          additionalInfo: concertInfo,
        }),
      });
    } else {
      await fetch("/api/concerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: concertTitle,
          scheduledDate: concertDate || null,
          location: concertLocation,
          additionalInfo: concertInfo,
        }),
      });
    }
    setShowConcertModal(false);
    await onRefresh();
  };

  const handleDeleteConcert = async (c: ConcertEventItem) => {
    if (!window.confirm(`Möchtest du den Auftritt „${c.title}“ löschen?`)) {
      return;
    }
    await fetch(`/api/concerts/${c.id}`, { method: "DELETE" });
    await onRefresh();
  };

  const openCreateRehearsal = () => {
    setEditingRehearsal(null);
    setRehTitle(`Probe ${sessions.length + 1}`);
    setRehDate("");
    setRehLocation("");
    setRehInfo("");
    setRehPresentSingers([]);
    setRehAbsentSoloists([]);
    setShowRehearsalModal(true);
  };

  const openEditRehearsal = (s: RehearsalSessionItem) => {
    setEditingRehearsal(s);
    setRehTitle(s.title);
    setRehDate(
      s.scheduledDate
        ? new Date(s.scheduledDate).toISOString().slice(0, 16)
        : ""
    );
    setRehLocation(s.location || "");
    setRehInfo(s.additionalInfo || "");
    setRehPresentSingers(s.presentSingerList);
    setRehAbsentSoloists(s.absentSoloistList);
    setShowRehearsalModal(true);
  };

  const handleSaveRehearsal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRehearsal) {
      await fetch(`/api/rehearsals/${editingRehearsal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-meta",
          title: rehTitle,
          scheduledDate: rehDate || null,
          location: rehLocation,
          additionalInfo: rehInfo,
          presentSingers: rehPresentSingers.join(", "),
          absentSoloists: rehAbsentSoloists.join(", "),
        }),
      });
    } else {
      await fetch("/api/rehearsals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-session",
          title: rehTitle || `Probe ${sessions.length + 1}`,
          scheduledDate: rehDate || null,
          location: rehLocation,
          additionalInfo: rehInfo,
          presentSingers: rehPresentSingers.join(", "),
          absentSoloists: rehAbsentSoloists.join(", "),
        }),
      });
    }
    setShowRehearsalModal(false);
    await onRefresh();
  };

  const entries = useMemo(() => {
    const list: CalendarEntry[] = [];
    for (const c of concerts) {
      list.push({
        kind: "CONCERT",
        dateMs: c.scheduledDate
          ? new Date(c.scheduledDate).getTime()
          : Number.MAX_SAFE_INTEGER - 1000,
        concert: c,
      });
    }
    for (const s of sessions) {
      list.push({
        kind: "REHEARSAL",
        dateMs: s.scheduledDate
          ? new Date(s.scheduledDate).getTime()
          : Number.MAX_SAFE_INTEGER - 50000 + s.sessionNumber,
        session: s,
      });
    }
    return list.sort((a, b) => a.dateMs - b.dateMs);
  }, [concerts, sessions]);

  return (
    /* Asymmetric 12-Column Grid: Columns 1–4 Calendar Action & Concert Spotlight, Columns 5–12 Chronological Ledger */
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-8">
      {/* Left Rail: Columns 1–4 */}
      <aside className="lg:col-span-4">
        {/* MOBILE COMPACT ACTION BAR (< 1024px) */}
        <div className="grid grid-cols-2 gap-2 border border-[var(--ink-primary)] bg-[var(--bg-surface)] p-2 lg:hidden">
          <button
            type="button"
            onClick={openCreateConcert}
            className="type-kicker inline-flex items-center justify-center gap-1 bg-[var(--accent)] px-2.5 py-2 text-[10px] text-[var(--accent-ink)] cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> AUFTRITT PLANEN
          </button>
          <button
            type="button"
            onClick={openCreateRehearsal}
            className="type-kicker inline-flex items-center justify-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-2.5 py-2 text-[10px] text-[var(--ink-primary)] cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> PROBETERMIN
          </button>
        </div>

        {/* DESKTOP SIDEBAR (>= 1024px) */}
        <div className="hidden lg:block sticky top-36 space-y-5 border-t-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-5 border-x border-b border-x-[var(--rule-border)] border-b-[var(--rule-border)]">
          <div className="border-b border-[var(--rule-border)] pb-3">
            <div className="type-kicker text-[var(--ink-muted)]">
              ZEITPLAN & DISPOSITION
            </div>
            <h2 className="type-section-h2 mt-0.5 text-[var(--ink-primary)]">
              Terminkalender
            </h2>
            <p className="mt-1 text-xs text-[var(--ink-secondary)]">
              Chronologische Übersicht aller Proben und geplanten Auftritte inkl.
              Freitext-Zusatzinformationen.
            </p>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={openCreateConcert}
              className="type-kicker ui-transition flex w-full items-center justify-center gap-2 bg-[var(--accent)] px-4 py-3 text-[var(--accent-ink)] cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              AUFTRITT / KONZERT PLANEN
            </button>

            <button
              type="button"
              onClick={openCreateRehearsal}
              className="type-kicker ui-transition flex w-full items-center justify-center gap-2 border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-4 py-2.5 text-[var(--ink-primary)] hover:bg-[var(--bg-recessed)] cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              PROBETERMIN EINTRAGEN
            </button>
          </div>

          <div className="border-t border-[var(--rule-border)] pt-4">
            <div className="type-kicker text-[var(--ink-muted)]">
              KALENDER-STATISTIK
            </div>
            <div className="font-mono-tabular mt-2 grid grid-cols-2 gap-px border border-[var(--rule-border)] bg-[var(--rule-border)] text-center">
              <div className="bg-[var(--bg-paper)] p-3">
                <div className="text-lg font-bold text-[var(--ink-primary)]">
                  {concerts.length}
                </div>
                <div className="text-[10px] text-[var(--ink-secondary)]">
                  AUFTRITTE
                </div>
              </div>
              <div className="bg-[var(--bg-paper)] p-3">
                <div className="text-lg font-bold text-[var(--ink-primary)]">
                  {sessions.length}
                </div>
                <div className="text-[10px] text-[var(--ink-secondary)]">
                  PROBEN GESAMT
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Right Main Timeline: Columns 5–12 */}
      <section className="space-y-4 lg:col-span-8">
        {entries.length === 0 ? (
          <div className="border-t-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-12 text-center border-x border-b border-x-[var(--rule-border)] border-b-[var(--rule-border)]">
            <div className="type-kicker text-[var(--ink-muted)]">
              KEINE TERMINE
            </div>
            <h3 className="type-section-h2 mt-2 text-[var(--ink-primary)]">
              Terminkalender ist leer
            </h3>
            <p className="mt-1 text-sm text-[var(--ink-secondary)]">
              Trage links deinen nächsten Auftritt oder Probetermin ein.
            </p>
          </div>
        ) : (
          entries.map((entry, idx) => {
            const staggerIdx = Math.min(idx, 8);

            if (entry.kind === "CONCERT") {
              const c = entry.concert;
              return (
                <article
                  key={`concert_${c.id}`}
                  style={
                    { "--stagger-index": staggerIdx } as React.CSSProperties
                  }
                  className="stagger-item border-2 border-[var(--ink-primary)] bg-[var(--bg-surface)] p-5 sm:p-6"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="type-kicker bg-[var(--accent)] px-2.5 py-0.5 text-[var(--accent-ink)]">
                          AUFTRITT / KONZERT
                        </span>
                        <h3 className="type-section-h2 text-[var(--ink-primary)]">
                          {c.title}
                        </h3>
                      </div>

                      <div className="font-mono-tabular mt-2 flex flex-wrap items-center gap-4 text-xs text-[var(--ink-secondary)]">
                        <span>
                          DATUM:{" "}
                          <strong className="text-[var(--ink-primary)]">
                            {c.scheduledDate
                              ? new Date(c.scheduledDate).toLocaleString(
                                "de-DE",
                                {
                                  weekday: "long",
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              )
                              : "Datum noch offen"}
                          </strong>
                        </span>
                        {c.location && (
                          <span>
                            ORT:{" "}
                            <strong className="text-[var(--ink-primary)]">
                              {c.location}
                            </strong>
                          </span>
                        )}
                      </div>

                      {c.additionalInfo ? (
                        <div className="mt-3 border-l-2 border-[var(--accent)] bg-[var(--bg-paper)] px-3.5 py-2.5 text-sm text-[var(--ink-primary)] whitespace-pre-wrap">
                          <span className="type-kicker mb-1 block text-[var(--ink-muted)]">
                            ZUSATZINFORMATIONEN ZUM AUFTRITT:
                          </span>
                          {c.additionalInfo}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-[var(--ink-muted)]">
                          Keine Freitext-Zusatzinformationen hinterlegt.
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-start">
                      <button
                        type="button"
                        onClick={() => openEditConcert(c)}
                        className="type-kicker inline-flex items-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-3 py-1.5 text-[var(--ink-primary)] cursor-pointer"
                      >
                        <Edit3 className="h-3.5 w-3.5" /> BEARBEITEN
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteConcert(c)}
                        className="border border-[var(--rule-border)] bg-[var(--bg-paper)] p-1.5 text-[var(--ink-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            }

            const s = entry.session;
            return (
              <article
                key={`session_${s.id}`}
                style={{ "--stagger-index": staggerIdx } as React.CSSProperties}
                className="stagger-item border-t-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-5 border-x border-b border-x-[var(--rule-border)] border-b-[var(--rule-border)]"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="type-kicker border border-[var(--ink-primary)] bg-[var(--bg-recessed)] px-2 py-0.5 text-[var(--ink-primary)]">
                        PROBETERMIN #{String(s.sessionNumber).padStart(2, "0")}
                      </span>
                      <h3 className="type-piece-h3 text-[var(--ink-primary)]">
                        {s.title}
                      </h3>
                      {s.status === "COMPLETED" && (
                        <span className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2 py-0.5 text-[var(--ink-muted)]">
                          ABGESCHLOSSEN
                        </span>
                      )}
                      {s.status === "ACTIVE" && (
                        <span className="type-kicker bg-[var(--accent)] px-2 py-0.5 text-[var(--accent-ink)]">
                          LIVE
                        </span>
                      )}
                    </div>

                    <div className="font-mono-tabular mt-2 flex flex-wrap items-center gap-4 text-xs text-[var(--ink-secondary)]">
                      <span>
                        DATUM:{" "}
                        <strong className="text-[var(--ink-primary)]">
                          {s.scheduledDate
                            ? new Date(s.scheduledDate).toLocaleString(
                              "de-DE",
                              {
                                weekday: "long",
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              }
                            )
                            : "Flexibler Termin (ohne festes Datum)"}
                        </strong>
                      </span>
                      {s.location && (
                        <span>
                          ORT:{" "}
                          <strong className="text-[var(--ink-primary)]">
                            {s.location}
                          </strong>
                        </span>
                      )}
                    </div>

                    {s.additionalInfo && (
                      <div className="mt-2.5 border-l-2 border-[var(--ink-primary)] bg-[var(--bg-paper)] px-3 py-2 text-xs text-[var(--ink-primary)] whitespace-pre-wrap">
                        <span className="type-kicker mb-0.5 block text-[var(--ink-muted)]">
                          ZUSATZINFORMATIONEN:
                        </span>
                        {s.additionalInfo}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {s.presentSingerList.length > 0 && (
                        <span className="type-kicker border border-[var(--ink-primary)] bg-[var(--bg-recessed)] px-2 py-1 text-[var(--ink-primary)]">
                          ANWESENDE SÄNGER: {s.presentSingerList.join(", ")}
                        </span>
                      )}
                      {s.absentSoloistList.length > 0 && (
                        <span className="type-kicker bg-[var(--accent)] px-2 py-1 text-[var(--accent-ink)]">
                          ABWESENDE SOLISTEN: {s.absentSoloistList.join(", ")}
                        </span>
                      )}
                      <span className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2 py-1 text-[var(--ink-secondary)]">
                        {s.pieces.length} STÜCKE EINGEPLANT
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 self-end sm:self-start">
                    <button
                      type="button"
                      onClick={() => setQrModalSession(s)}
                      title="QR-Code & Direktlink für diese Probe öffnen"
                      className="type-kicker inline-flex items-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-recessed)] px-2.5 py-1.5 font-bold text-[var(--ink-primary)] hover:bg-[var(--ink-primary)] hover:text-[var(--bg-surface)] cursor-pointer"
                    >
                      <QrCode className="h-3.5 w-3.5" /> QR-CODE
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShareRehearsalLink(s)}
                      title="Direktlink zu dieser Probe kopieren"
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
                      onClick={() => openEditRehearsal(s)}
                      className="type-kicker inline-flex items-center gap-1 border border-[var(--rule-border)] bg-[var(--bg-paper)] px-2.5 py-1.5 text-[var(--ink-primary)] hover:border-[var(--ink-primary)] cursor-pointer"
                    >
                      <Edit3 className="h-3.5 w-3.5" /> BEARBEITEN
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenProbeplan(s.id)}
                      className="type-kicker inline-flex items-center gap-1 bg-[var(--ink-primary)] px-3 py-1.5 text-[var(--bg-surface)] hover:bg-[var(--accent)] cursor-pointer"
                    >
                      {s.status === "COMPLETED"
                        ? "ZUM PROTOKOLL"
                        : "ZUM PROBEPLAN"}{" "}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>

      {/* Modal: Create / Edit Concert */}
      {showConcertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg border-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-6">
            <div className="type-kicker text-[var(--accent)]">
              AUFTRITTS-TERMIN
            </div>
            <h2 className="type-section-h2 mt-1 text-[var(--ink-primary)]">
              {editingConcert ? "Auftritt bearbeiten" : "Neuen Auftritt planen"}
            </h2>
            <form onSubmit={handleSaveConcert} className="mt-5 space-y-4">
              <div>
                <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                  Bezeichnung des Auftritts *
                </label>
                <input
                  type="text"
                  required
                  value={concertTitle}
                  onChange={(e) => setConcertTitle(e.target.value)}
                  placeholder="z.B. Sommerkonzert / Stadtfest"
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
                    value={concertDate}
                    onChange={(e) => setConcertDate(e.target.value)}
                    className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                    Ort / Bühne
                  </label>
                  <input
                    type="text"
                    value={concertLocation}
                    onChange={(e) => setConcertLocation(e.target.value)}
                    placeholder="z.B. Kulturhalle"
                    className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                  Freitext-Zusatzinformationen zum Auftritt
                </label>
                <textarea
                  rows={4}
                  value={concertInfo}
                  onChange={(e) => setConcertInfo(e.target.value)}
                  placeholder="z.B. Soundcheck 17:30 Uhr, Einlass 19:00 Uhr, Kleidung, Technik-Infos..."
                  className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowConcertModal(false)}
                  className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-paper)] px-4 py-2.5 text-[var(--ink-secondary)] cursor-pointer"
                >
                  ABBRECHEN
                </button>
                <button
                  type="submit"
                  className="type-kicker bg-[var(--accent)] px-5 py-2.5 text-[var(--accent-ink)] cursor-pointer"
                >
                  AUFTRITT SPEICHERN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create / Edit Rehearsal in Calendar */}
      {showRehearsalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto border-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-6">
            <div className="type-kicker text-[var(--accent)]">PROBETERMIN</div>
            <h2 className="type-section-h2 mt-1 text-[var(--ink-primary)]">
              {editingRehearsal
                ? "Probetermin bearbeiten"
                : "Neuen Probetermin eintragen"}
            </h2>
            <form onSubmit={handleSaveRehearsal} className="mt-5 space-y-4">
              <div>
                <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                  Bezeichnung *
                </label>
                <input
                  type="text"
                  required
                  value={rehTitle}
                  onChange={(e) => setRehTitle(e.target.value)}
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
                    value={rehDate}
                    onChange={(e) => setRehDate(e.target.value)}
                    className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                    Ort / Raum
                  </label>
                  <input
                    type="text"
                    value={rehLocation}
                    onChange={(e) => setRehLocation(e.target.value)}
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
                  value={rehInfo}
                  onChange={(e) => setRehInfo(e.target.value)}
                  placeholder="Freitext-Notizen, Treffpunkt, Ablaufhinweise..."
                  className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-sm text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
                />
              </div>

              {suggestions.singers.length > 0 && (
                <div>
                  <label className="type-kicker mb-1.5 block text-[var(--ink-secondary)]">
                    Anwesende Sänger
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.singers.map((s) => {
                      const active = rehPresentSingers.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() =>
                            setRehPresentSingers((prev) =>
                              active
                                ? prev.filter((x) => x !== s)
                                : [...prev, s]
                            )
                          }
                          className={`border px-2.5 py-1 text-xs font-medium cursor-pointer ${active
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
                    Abwesende Solisten
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.soloists.map((s) => {
                      const active = rehAbsentSoloists.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() =>
                            setRehAbsentSoloists((prev) =>
                              active
                                ? prev.filter((x) => x !== s)
                                : [...prev, s]
                            )
                          }
                          className={`border px-2.5 py-1 text-xs font-medium cursor-pointer ${active
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

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowRehearsalModal(false)}
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

      {/* Modal: Share Rehearsal Session via Direct Link & QR Code */}
      <SessionQrModal
        session={qrModalSession}
        onClose={() => setQrModalSession(null)}
      />
    </div>
  );
}
