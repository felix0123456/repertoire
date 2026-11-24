"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, RefreshCw, Upload, Check, AlertTriangle } from "lucide-react";
import { RehearsalSessionItem } from "@/types";

interface KonzertmeisterSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: RehearsalSessionItem[];
  defaultSessionId?: string | null;
  defaultTab?: "attendance" | "schedule" | "api";
  onSuccess: () => Promise<void>;
}

const KM_API_KEY_STORAGE = "repertoire_km_org_api_key_v1";
const KM_ICAL_URL_STORAGE = "repertoire_km_ical_url_v1";
const KM_FILTER_STORAGE = "repertoire_km_filter_kw_v1";

export default function KonzertmeisterSyncModal({
  isOpen,
  onClose,
  sessions,
  defaultSessionId,
  defaultTab = "attendance",
  onSuccess,
}: KonzertmeisterSyncModalProps) {
  const [activeTab, setActiveTab] = useState<"attendance" | "schedule" | "api">(
    defaultTab
  );

  // Tab 1: Paste Attendance for a specific Rehearsal Session
  const [targetSessionId, setTargetSessionId] = useState<string>("");
  const [attendanceRawText, setAttendanceRawText] = useState<string>("");
  const attendanceFileRef = useRef<HTMLInputElement | null>(null);

  // Tab 2: Import Schedule (iCal URL / .ics file / Paste Schedule Table)
  const [icalUrl, setIcalUrl] = useState<string>("");
  const [scheduleRawText, setScheduleRawText] = useState<string>("");
  const [filterKeyword, setFilterKeyword] = useState<string>("");
  const icsFileRef = useRef<HTMLInputElement | null>(null);

  // Tab 3: REST API (X-KM-ORG-API-KEY)
  const [apiKey, setApiKey] = useState<string>("");

  // Status
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [understaffedList, setUnderstaffedList] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
      setErrorMsg(null);
      setResultMsg(null);
      setUnderstaffedList([]);

      const upcoming = sessions.filter((s) => s.status !== "COMPLETED");
      if (
        defaultSessionId &&
        sessions.some((s) => s.id === defaultSessionId)
      ) {
        setTargetSessionId(defaultSessionId);
      } else if (upcoming.length > 0) {
        setTargetSessionId(upcoming[0].id);
      } else if (sessions.length > 0) {
        setTargetSessionId(sessions[0].id);
      }

      try {
        const savedKey = localStorage.getItem(KM_API_KEY_STORAGE);
        if (savedKey) setApiKey(savedKey);
        const savedIcal = localStorage.getItem(KM_ICAL_URL_STORAGE);
        if (savedIcal) setIcalUrl(savedIcal);
        const savedKw = localStorage.getItem(KM_FILTER_STORAGE);
        if (savedKw !== null) setFilterKeyword(savedKw);
      } catch {
        // ignore storage errors
      }
    }
  }, [isOpen, defaultTab, defaultSessionId, sessions]);

  if (!isOpen) return null;

  const handleAttendanceFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setAttendanceRawText(text);
    } catch {
      setErrorMsg("Datei konnte nicht gelesen werden.");
    } finally {
      if (attendanceFileRef.current) attendanceFileRef.current.value = "";
    }
  };

  const handleIcsFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setScheduleRawText(text);
    } catch {
      setErrorMsg("iCal/CSV-Datei konnte nicht gelesen werden.");
    } finally {
      if (icsFileRef.current) icsFileRef.current.value = "";
    }
  };

  const handleSubmitAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setResultMsg(null);
    setUnderstaffedList([]);

    if (!targetSessionId) {
      setErrorMsg("Bitte wähle zuerst eine Probe aus.");
      return;
    }
    if (!attendanceRawText.trim()) {
      setErrorMsg(
        "Bitte füge die Rückmeldungen / Anwesenheitsliste aus Konzertmeister ein."
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/konzertmeister", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "PASTE_ATTENDANCE",
          sessionId: targetSessionId,
          rawText: attendanceRawText,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(
          data.error || "Fehler beim Verarbeiten der Konzertmeister-Daten."
        );
        return;
      }

      setUnderstaffedList(data.understaffedRegisters || []);
      setResultMsg(
        `Anwesenheit erfolgreich aus Konzertmeister übernommen: ✓ ${
          data.presentCount ?? 0
        } Zugesagt · ✗ ${data.absentCount ?? 0} Abgesagt (${
          data.attendanceCount ?? 0
        } Spieler erkannt).`
      );
      await onSuccess();
    } catch {
      setErrorMsg("Netzwerkfehler beim Konzertmeister-Sync.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setResultMsg(null);
    setUnderstaffedList([]);

    try {
      localStorage.setItem(KM_ICAL_URL_STORAGE, icalUrl.trim());
      localStorage.setItem(KM_FILTER_STORAGE, filterKeyword.trim());
    } catch {
      // ignore
    }

    const hasIcalUrl = Boolean(icalUrl.trim());
    const hasRaw = Boolean(scheduleRawText.trim());
    if (!hasIcalUrl && !hasRaw) {
      setErrorMsg(
        "Bitte gib eine Konzertmeister iCal-URL ein oder füge einen .ics / CSV-Terminplan ein."
      );
      return;
    }

    const isIcsText =
      hasIcalUrl || scheduleRawText.includes("BEGIN:VCALENDAR");
    const mode = isIcsText ? "ICAL" : "PASTE_SCHEDULE";

    setLoading(true);
    try {
      const res = await fetch("/api/konzertmeister", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          icalUrl: icalUrl.trim(),
          icsContent: isIcsText && hasRaw ? scheduleRawText.trim() : "",
          rawText: !isIcsText ? scheduleRawText.trim() : "",
          filterKeyword: filterKeyword.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Fehler beim Import der Termine.");
        return;
      }
      setResultMsg(
        `Konzertmeister-Termine synchronisiert: ${
          data.importedSessions ?? 0
        } Proben und ${data.importedConcerts ?? 0} Auftritte importiert/aktualisiert.`
      );
      await onSuccess();
    } catch {
      setErrorMsg("Netzwerkfehler beim Konzertmeister-Terminimport.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRestApi = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setResultMsg(null);
    setUnderstaffedList([]);

    if (!apiKey.trim()) {
      setErrorMsg(
        "Bitte gib den Konzertmeister API-Key (X-KM-ORG-API-KEY) ein."
      );
      return;
    }

    try {
      localStorage.setItem(KM_API_KEY_STORAGE, apiKey.trim());
      localStorage.setItem(KM_FILTER_STORAGE, filterKeyword.trim());
    } catch {
      // ignore
    }

    setLoading(true);
    try {
      const res = await fetch("/api/konzertmeister", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "REST_API",
          apiKey: apiKey.trim(),
          filterKeyword: filterKeyword.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Konzertmeister REST-API Fehler.");
        return;
      }
      setResultMsg(
        `Voll-Sync über Konzertmeister REST-API abgeschlossen: ${
          data.importedSessions ?? 0
        } Proben (inkl. Rückmeldungen & Register-Check) und ${
          data.importedConcerts ?? 0
        } Auftritte aktualisiert.`
      );
      await onSuccess();
    } catch {
      setErrorMsg("Netzwerkfehler bei der Konzertmeister API-Abfrage.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col border-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] text-[var(--ink-primary)]">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b-2 border-[var(--rule-heavy)] bg-[var(--bg-recessed)] px-4 py-3 sm:px-6">
          <div>
            <div className="type-kicker text-[var(--accent)]">
              KONZERTMEISTER-ANBINDUNG (ANWESENHEIT & TERMINE)
            </div>
            <h2 className="font-display text-lg font-semibold text-[var(--ink-primary)] sm:text-xl">
              🔄 Konzertmeister-Sync
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="type-kicker inline-flex items-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[var(--ink-primary)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] cursor-pointer"
          >
            SCHLIESSEN <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* 3 Mode Tabs */}
        <div className="grid grid-cols-1 border-b border-[var(--rule-border)] bg-[var(--bg-paper)] sm:grid-cols-3">
          <button
            type="button"
            onClick={() => {
              setActiveTab("attendance");
              setErrorMsg(null);
            }}
            className={`type-kicker border-b sm:border-r sm:border-b-0 border-[var(--rule-border)] px-3 py-2.5 text-left text-[10px] cursor-pointer ${
              activeTab === "attendance"
                ? "bg-[var(--ink-primary)] font-bold text-[var(--bg-surface)]"
                : "text-[var(--ink-secondary)] hover:bg-[var(--bg-recessed)]"
            }`}
          >
            📋 ANWESENHEIT PRO PROBE EINFÜGEN (KONZERTMEISTER)
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("schedule");
              setErrorMsg(null);
            }}
            className={`type-kicker border-b sm:border-r sm:border-b-0 border-[var(--rule-border)] px-3 py-2.5 text-left text-[10px] cursor-pointer ${
              activeTab === "schedule"
                ? "bg-[var(--ink-primary)] font-bold text-[var(--bg-surface)]"
                : "text-[var(--ink-secondary)] hover:bg-[var(--bg-recessed)]"
            }`}
          >
            📅 PROBEPLAN & TERMINE IMPORTIEREN (iCal / CSV / Text)
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("api");
              setErrorMsg(null);
            }}
            className={`type-kicker px-3 py-2.5 text-left text-[10px] cursor-pointer ${
              activeTab === "api"
                ? "bg-[var(--ink-primary)] font-bold text-[var(--bg-surface)]"
                : "text-[var(--ink-secondary)] hover:bg-[var(--bg-recessed)]"
            }`}
          >
            🔑 KONZERTMEISTER REST-API (X-KM-ORG-API-KEY)
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {errorMsg && (
            <div className="flex items-start gap-2 border-2 border-[var(--accent)] bg-[var(--bg-paper)] p-3 text-xs text-[var(--ink-primary)]">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--accent)]" />
              <span>{errorMsg}</span>
            </div>
          )}

          {resultMsg && (
            <div className="space-y-1.5 border-2 border-[var(--ink-primary)] bg-[var(--bg-recessed)] p-3 text-xs text-[var(--ink-primary)]">
              <div className="flex items-center gap-1.5 font-semibold">
                <Check className="h-4 w-4 text-[var(--accent)]" />
                <span>{resultMsg}</span>
              </div>
              {understaffedList.length > 0 && (
                <div className="type-kicker mt-1 border border-[var(--accent)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--accent)]">
                  ⚠️ Unterbesetzte Register erkannt:{" "}
                  {understaffedList.join(", ")} (Stücke mit Haupt-Probebedarf in
                  diesem Register werden für diese Probe automatisch
                  zurückgestellt)
                </div>
              )}
            </div>
          )}

          {/* TAB 1: PASTE ATTENDANCE FOR A SESSION */}
          {activeTab === "attendance" && (
            <form onSubmit={handleSubmitAttendance} className="space-y-4">
              <div>
                <label className="type-kicker mb-1.5 block text-[var(--ink-primary)]">
                  1. ZIEL-PROBE AUSWÄHLEN
                </label>
                <select
                  value={targetSessionId}
                  onChange={(e) => setTargetSessionId(e.target.value)}
                  className="w-full border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-3 py-2 text-xs font-medium text-[var(--ink-primary)] focus:outline-none"
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      #{String(s.sessionNumber).padStart(2, "0")} — {s.title}
                      {s.scheduledDate
                        ? ` (${new Date(s.scheduledDate).toLocaleDateString(
                            "de-DE"
                          )})`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <label className="type-kicker text-[var(--ink-primary)]">
                    2. KONZERTMEISTER-RÜCKMELDUNGEN EINFÜGEN (TEXT ODER CSV)
                  </label>
                  <div>
                    <input
                      ref={attendanceFileRef}
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleAttendanceFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => attendanceFileRef.current?.click()}
                      className="type-kicker inline-flex items-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-2.5 py-1 text-[10px] text-[var(--ink-primary)] cursor-pointer"
                    >
                      <Upload className="h-3 w-3" /> .CSV / .TXT DATEI LADEN
                    </button>
                  </div>
                </div>

                <textarea
                  rows={8}
                  value={attendanceRawText}
                  onChange={(e) => setAttendanceRawText(e.target.value)}
                  placeholder={`Kopiere einfach die Rückmeldungen aus web.konzertmeister.app oder eine CSV-Liste hier hinein, z.B.:\n\nSaxophon (1 / 4)\n✓ Lukas (Altsaxophon) - Zugesagt\n✗ Max (Tenorsaxophon) - Abgesagt\n✗ Anna (Altsaxophon) - Abgesagt\n✗ Tom (Baritonsaxophon) - Abgesagt\n\nPosaune (3 / 3)\n✓ Felix (Posaune) - Zugesagt\n...`}
                  className="font-mono-tabular w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] p-3 text-xs text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:border-[var(--ink-primary)] focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-[var(--ink-secondary)]">
                  Erkennt automatisch Register-Überschriften (
                  <em>Saxophon, Posaune, Trompete, Rhythmusgruppe, Gesang</em>),
                  Status-Blöcke (<em>Zugesagt / Abgesagt</em>) sowie
                  CSV-Exporte. Anwesende Sänger, abwesende Solisten und
                  unterbesetzte Register werden sofort mit dem Probeplan
                  abgeglichen!
                </p>
              </div>

              <div className="flex justify-end gap-2 border-t border-[var(--rule-border)] pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-paper)] px-4 py-2.5 text-xs text-[var(--ink-secondary)] cursor-pointer"
                >
                  SCHLIESSEN
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="type-kicker inline-flex items-center gap-1.5 bg-[var(--accent)] px-5 py-2.5 text-xs font-bold text-[var(--accent-ink)] disabled:opacity-40 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {loading
                    ? "VERARBEITET..."
                    : "ANWESENHEIT & REGISTER SYNCHRONISIEREN →"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: IMPORT SCHEDULE (iCal URL / .ics / CSV / TEXT) */}
          {activeTab === "schedule" && (
            <form onSubmit={handleSubmitSchedule} className="space-y-4">
              <div>
                <label className="type-kicker mb-1.5 block text-[var(--ink-primary)]">
                  1. KONZERTMEISTER iCAL-ABO-LINK (OPTIONAL)
                </label>
                <input
                  type="text"
                  value={icalUrl}
                  onChange={(e) => setIcalUrl(e.target.value)}
                  placeholder="https://rest.konzertmeister.app/api/v1/ical/... oder webcal://..."
                  className="w-full border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-3 py-2 text-xs text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-[var(--ink-secondary)]">
                  Den persönlichen iCal-Link findest du in der Konzertmeister
                  App unter <em>Termine → Kalender-Abo (iCal)</em>.
                </p>
              </div>

              <div>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <label className="type-kicker text-[var(--ink-primary)]">
                    ODER .ICS / CSV / TERMINLISTE DIREKT EINFÜGEN
                  </label>
                  <div>
                    <input
                      ref={icsFileRef}
                      type="file"
                      accept=".ics,.csv,.txt"
                      onChange={handleIcsFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => icsFileRef.current?.click()}
                      className="type-kicker inline-flex items-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-2.5 py-1 text-[10px] text-[var(--ink-primary)] cursor-pointer"
                    >
                      <Upload className="h-3 w-3" /> .ICS / .CSV DATEI LADEN
                    </button>
                  </div>
                </div>
                <textarea
                  rows={5}
                  value={scheduleRawText}
                  onChange={(e) => setScheduleRawText(e.target.value)}
                  placeholder="Optional: Inhalt einer .ics-Datei oder kopierte Konzertmeister-Terminliste (z. B. Fr., 27.11.2026 19:30;BigBand Probe;Proberaum)..."
                  className="font-mono-tabular w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] p-3 text-xs text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:border-[var(--ink-primary)] focus:outline-none"
                />
              </div>

              <div>
                <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                  FILTER-STICHWORT (OPTIONAL, LEER = ALLE TERMINE)
                </label>
                <input
                  type="text"
                  value={filterKeyword}
                  onChange={(e) => setFilterKeyword(e.target.value)}
                  placeholder="z.B. BigBand (oder leer lassen für alle Termine)"
                  className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-xs text-[var(--ink-primary)]"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-[var(--rule-border)] pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-paper)] px-4 py-2.5 text-xs text-[var(--ink-secondary)] cursor-pointer"
                >
                  SCHLIESSEN
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="type-kicker inline-flex items-center gap-1.5 bg-[var(--accent)] px-5 py-2.5 text-xs font-bold text-[var(--accent-ink)] disabled:opacity-40 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {loading ? "IMPORTIERT..." : "TERMINE IMPORTIEREN →"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: KONZERTMEISTER REST API (X-KM-ORG-API-KEY) */}
          {activeTab === "api" && (
            <form onSubmit={handleSubmitRestApi} className="space-y-4">
              <div>
                <label className="type-kicker mb-1.5 block text-[var(--ink-primary)]">
                  KONZERTMEISTER ORGANISATIONS-API-KEY (X-KM-ORG-API-KEY)
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="X-KM-ORG-API-KEY eingeben..."
                  className="font-mono-tabular w-full border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-3 py-2 text-xs text-[var(--ink-primary)] focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-[var(--ink-secondary)]">
                  Synchronisiert vollautomatisch alle kommenden{" "}
                  <strong>Proben & Auftritte</strong> sowie die{" "}
                  <strong>Einzel-Rückmeldungen und Register-Besetzungen</strong>{" "}
                  direkt über die offizielle Konzertmeister M2M-Schnittstelle (
                  <code>rest.konzertmeister.app/api/v4</code>). Der Schlüssel
                  wird lokal für 1-Klick-Updates gespeichert.
                </p>
              </div>

              <div>
                <label className="type-kicker mb-1 block text-[var(--ink-secondary)]">
                  FILTER-STICHWORT (OPTIONAL)
                </label>
                <input
                  type="text"
                  value={filterKeyword}
                  onChange={(e) => setFilterKeyword(e.target.value)}
                  placeholder="z.B. BigBand (oder leer lassen für alle Vereins-Termine)"
                  className="w-full border border-[var(--rule-border)] bg-[var(--bg-paper)] px-3 py-2 text-xs text-[var(--ink-primary)]"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-[var(--rule-border)] pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-paper)] px-4 py-2.5 text-xs text-[var(--ink-secondary)] cursor-pointer"
                >
                  SCHLIESSEN
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="type-kicker inline-flex items-center gap-1.5 bg-[var(--accent)] px-5 py-2.5 text-xs font-bold text-[var(--accent-ink)] disabled:opacity-40 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {loading
                    ? "SYNCHRONISIERT..."
                    : "JETZT PER REST-API SYNCHRONISIEREN →"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
