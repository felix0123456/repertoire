"use client";

import React, { useState, useMemo } from "react";
import {
  Calendar,
  Sparkles,
  MapPin,
  FileText,
  Plus,
  Edit3,
  Trash2,
  Mic,
  Guitar,
  Music,
  ArrowRight,
} from "lucide-react";
import {
  ConcertEventItem,
  RehearsalSessionItem,
  SuggestionsData,
} from "@/types";

interface TerminkalenderTabProps {
  sessions: RehearsalSessionItem[];
  concerts: ConcertEventItem[];
  suggestions: SuggestionsData;
  onRefresh: () => Promise<void>;
  onOpenProbeplan: () => void;
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
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-100">
            <Calendar className="h-5 w-5 text-amber-400" />
            Terminkalender (Proben & Auftritte)
          </h2>
          <p className="text-xs text-slate-400">
            Alle geplanten Probetermine und Auftritte auf einen Blick – inklusive
            Freitext-Zusatzinformationen zu jedem Termin.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openCreateRehearsal}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-amber-500 cursor-pointer"
          >
            <Plus className="h-4 w-4 text-amber-400" />
            Probetermin hinzufügen
          </button>

          <button
            type="button"
            onClick={openCreateConcert}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md hover:bg-amber-400 cursor-pointer"
          >
            <Sparkles className="h-4 w-4" />
            Auftritt hinzufügen
          </button>
        </div>
      </div>

      {/* Timeline List */}
      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
          <Calendar className="mx-auto h-10 w-10 text-slate-600" />
          <h3 className="mt-3 text-base font-semibold text-slate-200">
            Noch keine Termine im Kalender
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Füge oben deinen nächsten Auftritt oder Probetermin hinzu.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => {
            if (entry.kind === "CONCERT") {
              const c = entry.concert;
              return (
                <div
                  key={`concert_${c.id}`}
                  className="rounded-2xl border-2 border-amber-500/60 bg-gradient-to-r from-amber-950/35 via-slate-900/90 to-slate-900/90 p-5 shadow-lg"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-0.5 text-xs font-extrabold uppercase tracking-wider text-slate-950">
                          <Sparkles className="h-3 w-3" />
                          Auftritt / Konzert
                        </span>
                        <h3 className="text-xl font-extrabold text-amber-200">
                          {c.title}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-200">
                        <span className="inline-flex items-center gap-1.5 font-semibold">
                          <Calendar className="h-4 w-4 text-amber-400" />
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
                        </span>

                        {c.location && (
                          <span className="inline-flex items-center gap-1.5 text-slate-300">
                            <MapPin className="h-4 w-4 text-cyan-400" />
                            {c.location}
                          </span>
                        )}
                      </div>

                      {c.additionalInfo ? (
                        <div className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-slate-950/75 px-3.5 py-2.5 text-xs text-slate-100">
                          <FileText className="mt-0.5 h-4 w-4 text-amber-400 shrink-0" />
                          <div className="whitespace-pre-wrap">
                            {c.additionalInfo}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs italic text-slate-500">
                          Keine Zusatzinformationen hinterlegt.
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditConcert(c)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-slate-950 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/15 cursor-pointer"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteConcert(c)}
                        className="rounded-xl border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:border-rose-500/40 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            const s = entry.session;
            return (
              <div
                key={`session_${s.id}`}
                className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-md"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-0.5 text-xs font-semibold text-indigo-300">
                        Probetermin #{s.sessionNumber}
                      </span>
                      <h3 className="text-lg font-bold text-slate-100">
                        {s.title}
                      </h3>
                      {s.status === "COMPLETED" && (
                        <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                          Abgeschlossen
                        </span>
                      )}
                      {s.status === "ACTIVE" && (
                        <span className="rounded-full bg-emerald-500/25 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
                          Laufende Probe
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-amber-400" />
                        {s.scheduledDate
                          ? new Date(s.scheduledDate).toLocaleString("de-DE", {
                              weekday: "long",
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Flexibler Termin (ohne festes Datum)"}
                      </span>
                      {s.location && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-cyan-400" />
                          {s.location}
                        </span>
                      )}
                    </div>

                    {s.additionalInfo && (
                      <div className="mt-2 flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-950/75 px-3 py-2 text-xs text-slate-200">
                        <FileText className="mt-0.5 h-3.5 w-3.5 text-amber-400 shrink-0" />
                        <div className="whitespace-pre-wrap">
                          {s.additionalInfo}
                        </div>
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      {s.presentSingerList.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 px-2.5 py-1 text-amber-300 border border-amber-500/30">
                          <Mic className="h-3 w-3" />
                          Anwesende Sänger: {s.presentSingerList.join(", ")}
                        </span>
                      )}
                      {s.absentSoloistList.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-rose-500/15 px-2.5 py-1 text-rose-300 border border-rose-500/30">
                          <Guitar className="h-3 w-3" />
                          Abwesende Solisten: {s.absentSoloistList.join(", ")}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-2.5 py-1 text-slate-300 border border-slate-800">
                        <Music className="h-3 w-3 text-slate-400" />
                        {s.pieces.length} Stücke eingeplant
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditRehearsal(s)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-amber-500 cursor-pointer"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Termin & Infos bearbeiten
                    </button>
                    <button
                      type="button"
                      onClick={onOpenProbeplan}
                      className="inline-flex items-center gap-1 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-slate-700 cursor-pointer"
                    >
                      Zum Probeplan <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create / Edit Concert (Auftritt) */}
      {showConcertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-100">
              {editingConcert ? "Auftritt bearbeiten" : "Neuen Auftritt planen"}
            </h2>
            <form onSubmit={handleSaveConcert} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Bezeichnung des Auftritts *
                </label>
                <input
                  type="text"
                  required
                  value={concertTitle}
                  onChange={(e) => setConcertTitle(e.target.value)}
                  placeholder="z.B. Sommerkonzert / Stadtfest / Jahreskonzert"
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
                    value={concertDate}
                    onChange={(e) => setConcertDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Ort / Bühne
                  </label>
                  <input
                    type="text"
                    value={concertLocation}
                    onChange={(e) => setConcertLocation(e.target.value)}
                    placeholder="z.B. Kulturhalle / Marktplatz"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Freitext-Zusatzinformationen zum Auftritt
                </label>
                <textarea
                  rows={4}
                  value={concertInfo}
                  onChange={(e) => setConcertInfo(e.target.value)}
                  placeholder="z.B. Soundcheck 17:30 Uhr, Einlass 19:00 Uhr, Kleidung: Schwarz mit Akzent, PA vor Ort..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConcertModal(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer"
                >
                  Auftritt speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create / Edit Rehearsal in Calendar */}
      {showRehearsalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-100">
              {editingRehearsal
                ? "Probetermin bearbeiten"
                : "Neuen Probetermin im Kalender anlegen"}
            </h2>
            <form onSubmit={handleSaveRehearsal} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Bezeichnung *
                </label>
                <input
                  type="text"
                  required
                  value={rehTitle}
                  onChange={(e) => setRehTitle(e.target.value)}
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
                    value={rehDate}
                    onChange={(e) => setRehDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Ort / Raum
                  </label>
                  <input
                    type="text"
                    value={rehLocation}
                    onChange={(e) => setRehLocation(e.target.value)}
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
                  value={rehInfo}
                  onChange={(e) => setRehInfo(e.target.value)}
                  placeholder="Freitext-Notizen, Treffpunkt, Ablaufhinweise..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
                />
              </div>

              {suggestions.singers.length > 0 && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
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

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRehearsalModal(false)}
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

