"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Music,
  ListChecks,
  CalendarDays,
  History,
  User,
  LogOut,
  Download,
  Upload,
  Sparkles,
} from "lucide-react";
import {
  ConcertEventItem,
  PieceItem,
  RehearsalConfigItem,
  RehearsalSessionItem,
  SuggestionsData,
} from "@/types";
import RepertoireTab from "@/components/RepertoireTab";
import ProbeplanTab from "@/components/ProbeplanTab";
import TerminkalenderTab from "@/components/TerminkalenderTab";
import HistorieTab from "@/components/HistorieTab";

const STORAGE_USER_KEY = "repertoire_current_user_v1";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<
    "repertoire" | "probeplan" | "kalender" | "historie"
  >("repertoire");

  const [currentUser, setCurrentUser] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  const [pieces, setPieces] = useState<PieceItem[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionsData>({
    singers: [],
    soloists: [],
    songTypes: [],
  });
  const [config, setConfig] = useState<RehearsalConfigItem>({
    id: "default",
    planningMode: "SIMPLE_COUNT",
    totalSessionsLeft: 4,
    piecesPerSession: 6,
  });
  const [sessions, setSessions] = useState<RehearsalSessionItem[]>([]);
  const [concerts, setConcerts] = useState<ConcertEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchAllData = useCallback(
    async (overrideUserId?: string) => {
      try {
        const uid = overrideUserId ?? currentUser?.id ?? "";
        const [piecesRes, rehearsalsRes] = await Promise.all([
          fetch(`/api/pieces?userId=${encodeURIComponent(uid)}`),
          fetch("/api/rehearsals"),
        ]);

        if (piecesRes.ok) {
          const pData = await piecesRes.json();
          setPieces(pData.pieces || []);
          setSuggestions(
            pData.suggestions || { singers: [], soloists: [], songTypes: [] }
          );
        }

        if (rehearsalsRes.ok) {
          const rData = await rehearsalsRes.json();
          if (rData.config) setConfig(rData.config);
          setSessions(rData.sessions || []);
          setConcerts(rData.concerts || []);
        }
      } catch (err) {
        console.error("Failed to fetch app data:", err);
      } finally {
        setLoading(false);
      }
    },
    [currentUser?.id]
  );

  // Restore saved user from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_USER_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.id && parsed?.name) {
          setCurrentUser(parsed);
          fetchAllData(parsed.id);
          return;
        }
      }
    } catch {
      // ignore storage errors
    }
    fetchAllData("");
  }, [fetchAllData]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setLoggingIn(true);
    try {
      const res = await fetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(data.user));
        setNameInput("");
        setShowLoginModal(false);
        await fetchAllData(data.user.id);
      }
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem(STORAGE_USER_KEY);
    fetchAllData("");
  };

  const handleExportBackup = async () => {
    const res = await fetch("/api/backup");
    if (!res.ok) return;
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `repertoire-backup-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      if (res.ok) {
        await fetchAllData();
        alert("Backup erfolgreich wiederhergestellt!");
      }
    } catch {
      alert("Fehler beim Lesen der Backup-Datei.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const upcomingSessionsCount = sessions.filter(
    (s) => s.status !== "COMPLETED"
  ).length;
  const activeSession = sessions.find((s) => s.status === "ACTIVE");
  const nextConcert = concerts[0] || null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          {/* Brand & Next Concert Pill */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20">
              <Music className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-slate-100">
                Repertoire & Probeplan
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span>{pieces.length} Stücke</span>
                <span>•</span>
                <span>{upcomingSessionsCount} offene Proben</span>
                {nextConcert && (
                  <>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 font-medium text-amber-300">
                      <Sparkles className="h-3 w-3" />
                      Auftritt: {nextConcert.title}
                      {nextConcert.scheduledDate
                        ? ` (${new Date(
                            nextConcert.scheduledDate
                          ).toLocaleDateString("de-DE")})`
                        : ""}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right User Identification & Persistent Backup Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {currentUser ? (
              <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5">
                <User className="h-4 w-4 text-amber-400" />
                <span className="text-xs text-slate-400">Angemeldet als:</span>
                <span className="text-xs font-bold text-slate-100">
                  {currentUser.name}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  title="Namen wechseln / Abmelden"
                  className="ml-1 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleLoginSubmit}
                className="flex items-center gap-1.5"
              >
                <div className="relative">
                  <User className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Dein Spielername..."
                    className="w-44 rounded-xl border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loggingIn || !nameInput.trim()}
                  className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40 cursor-pointer"
                >
                  Anmelden
                </button>
              </form>
            )}

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleExportBackup}
                title="Alle Daten als JSON-Backup herunterladen"
                className="inline-flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300 hover:border-slate-700 hover:text-slate-100 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Backup</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="JSON-Backup importieren"
                className="inline-flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300 hover:border-slate-700 hover:text-slate-100 cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                onChange={handleImportBackup}
                className="hidden"
              />
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <nav className="-mb-px flex space-x-2 overflow-x-auto pb-2 sm:pb-0">
            <button
              type="button"
              onClick={() => setActiveTab("repertoire")}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                activeTab === "repertoire"
                  ? "border-amber-500 text-amber-400"
                  : "border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200"
              }`}
            >
              <Music className="h-4 w-4" />
              Repertoire & Abstimmung ({pieces.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("probeplan")}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                activeTab === "probeplan"
                  ? "border-amber-500 text-amber-400"
                  : "border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200"
              }`}
            >
              <ListChecks className="h-4 w-4" />
              Probeplan & Live-Probe ({upcomingSessionsCount})
              {activeSession && (
                <span className="ml-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                  Live
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("kalender")}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                activeTab === "kalender"
                  ? "border-amber-500 text-amber-400"
                  : "border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200"
              }`}
            >
              <CalendarDays className="h-4 w-4" />
              Terminkalender & Auftritte ({sessions.length + concerts.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("historie")}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                activeTab === "historie"
                  ? "border-amber-500 text-amber-400"
                  : "border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200"
              }`}
            >
              <History className="h-4 w-4" />
              Proben-Protokolle (
              {sessions.filter((s) => s.status === "COMPLETED").length})
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="text-sm text-slate-400">
              Lade Repertoire und Probeplan...
            </div>
          </div>
        ) : (
          <>
            {activeTab === "repertoire" && (
              <RepertoireTab
                pieces={pieces}
                suggestions={suggestions}
                currentUser={currentUser}
                onRefresh={() => fetchAllData()}
                onRequireLogin={() => setShowLoginModal(true)}
              />
            )}

            {activeTab === "probeplan" && (
              <ProbeplanTab
                config={config}
                sessions={sessions}
                pieces={pieces}
                suggestions={suggestions}
                currentUser={currentUser}
                onRefresh={() => fetchAllData()}
                onRequireLogin={() => setShowLoginModal(true)}
              />
            )}

            {activeTab === "kalender" && (
              <TerminkalenderTab
                sessions={sessions}
                concerts={concerts}
                suggestions={suggestions}
                onRefresh={() => fetchAllData()}
                onOpenProbeplan={() => setActiveTab("probeplan")}
              />
            )}

            {activeTab === "historie" && (
              <HistorieTab
                sessions={sessions}
                onRefresh={() => fetchAllData()}
              />
            )}
          </>
        )}
      </main>

      {/* Prompt Login Modal if unauthenticated user clicks vote/log */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-100">
              Wie heißt du?
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Gib einfach deinen Namen ein, um Stücke zu bewerten und deine
              Proben-Fortschritte zu loggen. Dein Name wird auf diesem Gerät
              gespeichert.
            </p>
            <form onSubmit={handleLoginSubmit} className="mt-4 space-y-4">
              <input
                type="text"
                required
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Dein Vorname / Spitzname..."
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={loggingIn || !nameInput.trim()}
                  className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 cursor-pointer"
                >
                  {loggingIn ? "Startet..." : "Weiter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

