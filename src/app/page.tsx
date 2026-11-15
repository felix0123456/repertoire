"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { LogOut, Download, Upload } from "lucide-react";
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
import OnboardingModal from "@/components/OnboardingModal";

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
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [pendingOnboarding, setPendingOnboarding] = useState(false);
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
    async (overrideUserId?: string): Promise<PieceItem[]> => {
      try {
        const uid = overrideUserId ?? currentUser?.id ?? "";
        const [piecesRes, rehearsalsRes] = await Promise.all([
          fetch(`/api/pieces?userId=${encodeURIComponent(uid)}`),
          fetch("/api/rehearsals"),
        ]);

        let fetchedPieces: PieceItem[] = [];
        if (piecesRes.ok) {
          const pData = await piecesRes.json();
          fetchedPieces = pData.pieces || [];
          setPieces(fetchedPieces);
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
        return fetchedPieces;
      } catch (err) {
        console.error("Failed to fetch app data:", err);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [currentUser?.id]
  );

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
        const loadedPieces = await fetchAllData(data.user.id);
        const unratedCount = loadedPieces.filter((p) => !p.myVote).length;
        // Automatically launch initial rating onboarding for any user with unrated pieces
        // or if onboarding was explicitly clicked before login
        if (
          loadedPieces.length > 0 &&
          (unratedCount > 0 || pendingOnboarding)
        ) {
          setShowOnboardingModal(true);
        }
        setPendingOnboarding(false);
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
  const completedSessionsCount = sessions.filter(
    (s) => s.status === "COMPLETED"
  ).length;
  const activeSession = sessions.find((s) => s.status === "ACTIVE");
  const nextConcert = concerts[0] || null;

  return (
    <div className="min-h-screen bg-[var(--bg-paper)] text-[var(--ink-primary)]">
      {/* Editorial Score Ledger Masthead — 12-Column Asymmetric Grid */}
      <header className="sticky top-0 z-30 border-t-4 border-b border-[var(--rule-heavy)] bg-[var(--bg-surface)]">
        <div className="mx-auto max-w-[1440px]">
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* Columns 1–7: Editorial Masthead & Live Ledger Metrics */}
            <div className="flex flex-col justify-between border-b border-[var(--rule-border)] px-4 py-4 sm:px-6 lg:col-span-7 lg:border-r lg:border-b-0">
              <div className="flex flex-wrap items-center gap-3">
                <span className="type-kicker text-[var(--ink-secondary)]">
                  ENSEMBLE-PARTITUR & PROBENPLANUNG
                </span>
                {nextConcert && (
                  <span className="type-kicker border border-[var(--ink-primary)] bg-[var(--bg-recessed)] px-2 py-0.5 text-[var(--ink-primary)]">
                    NÄCHSTER AUFTRITT: {nextConcert.title}
                    {nextConcert.scheduledDate
                      ? ` (${new Date(
                          nextConcert.scheduledDate
                        ).toLocaleDateString("de-DE")})`
                      : ""}
                  </span>
                )}
              </div>

              <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-4">
                <h1 className="type-masthead text-[var(--ink-primary)]">
                  Repertoire & Probeplan
                </h1>
                <div className="font-mono-tabular flex items-center gap-4 text-xs text-[var(--ink-secondary)]">
                  <span>
                    <strong className="text-[var(--ink-primary)]">
                      {pieces.length}
                    </strong>{" "}
                    STÜCKE
                  </span>
                  <span>/</span>
                  <span>
                    <strong className="text-[var(--ink-primary)]">
                      {upcomingSessionsCount}
                    </strong>{" "}
                    PROBEN OFFEN
                  </span>
                  <span>/</span>
                  <span>
                    <strong className="text-[var(--ink-primary)]">
                      {concerts.length}
                    </strong>{" "}
                    AUFTRITTE
                  </span>
                </div>
              </div>
            </div>

            {/* Columns 8–12: Player Identity Stamp & Archival Backup Controls */}
            <div className="flex flex-col justify-between bg-[var(--bg-recessed)] px-4 py-3.5 sm:px-6 lg:col-span-5">
              <div className="flex items-center justify-between">
                <span className="type-kicker text-[var(--ink-secondary)]">
                  SPIELER-IDENTIFIKATION (FREIE EINGABE)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleExportBackup}
                    title="Persistentes JSON-Backup exportieren"
                    className="font-mono-tabular ui-transition inline-flex items-center gap-1 border border-[var(--rule-border)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] font-medium text-[var(--ink-primary)] hover:border-[var(--ink-primary)] cursor-pointer"
                  >
                    <Download className="h-3 w-3" />
                    EXPORT
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="JSON-Backup importieren"
                    className="font-mono-tabular ui-transition inline-flex items-center gap-1 border border-[var(--rule-border)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] font-medium text-[var(--ink-primary)] hover:border-[var(--ink-primary)] cursor-pointer"
                  >
                    <Upload className="h-3 w-3" />
                    IMPORT
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

              <div className="mt-2">
                {currentUser ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-3 py-1.5">
                    <div>
                      <span className="type-kicker mr-2 text-[var(--ink-muted)]">
                        AKTIVER SPIELER:
                      </span>
                      <span className="font-display text-sm font-semibold text-[var(--ink-primary)]">
                        {currentUser.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {pieces.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowOnboardingModal(true)}
                          className="type-kicker border border-[var(--ink-primary)] bg-[var(--bg-recessed)] px-2.5 py-1 text-[var(--ink-primary)] hover:bg-[var(--ink-primary)] hover:text-[var(--bg-surface)] cursor-pointer"
                        >
                          STÜCKE BEWERTEN (
                          {pieces.filter((p) => !p.myVote).length} OFFEN)
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleLogout}
                        title="Namen wechseln / Abmelden"
                        className="type-kicker inline-flex items-center gap-1 text-[var(--ink-secondary)] hover:text-[var(--accent)] cursor-pointer"
                      >
                        WECHSELN <LogOut className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <form
                    onSubmit={handleLoginSubmit}
                    className="flex items-stretch gap-2"
                  >
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Deinen Namen eingeben (ohne Auswahlliste)..."
                      className="w-full border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={loggingIn || !nameInput.trim()}
                      className="type-kicker ui-transition bg-[var(--accent)] px-4 py-1.5 text-[var(--accent-ink)] disabled:opacity-40 cursor-pointer"
                    >
                      ANMELDEN
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>

          {/* Ledger Section Index Bar */}
          <nav
            aria-label="Hauptnavigation"
            className="grid grid-cols-2 border-t border-[var(--rule-border)] bg-[var(--bg-surface)] sm:grid-cols-4"
          >
            {(
              [
                {
                  id: "repertoire",
                  num: "01",
                  label: "Repertoire & Abstimmung",
                  count: pieces.length,
                },
                {
                  id: "probeplan",
                  num: "02",
                  label: "Probeplan & Live-Probe",
                  count: upcomingSessionsCount,
                  badge: activeSession ? "LIVE" : undefined,
                },
                {
                  id: "kalender",
                  num: "03",
                  label: "Terminkalender & Auftritte",
                  count: sessions.length + concerts.length,
                },
                {
                  id: "historie",
                  num: "04",
                  label: "Proben-Protokolle",
                  count: completedSessionsCount,
                },
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`ui-transition flex items-baseline justify-between border-r border-b sm:border-b-0 border-[var(--rule-border)] last:border-r-0 px-4 py-3 text-left cursor-pointer ${
                    active
                      ? "bg-[var(--bg-paper)] border-b-2 border-b-[var(--accent)]"
                      : "bg-[var(--bg-surface)] hover:bg-[var(--bg-recessed)]"
                  }`}
                >
                  <div className="flex items-baseline gap-2.5 min-w-0">
                    <span
                      className={`font-mono-tabular text-xs font-semibold ${
                        active
                          ? "text-[var(--accent)]"
                          : "text-[var(--ink-muted)]"
                      }`}
                    >
                      {tab.num}
                    </span>
                    <span
                      className={`truncate text-sm ${
                        active
                          ? "font-semibold text-[var(--ink-primary)]"
                          : "font-medium text-[var(--ink-secondary)]"
                      }`}
                    >
                      {tab.label}
                    </span>
                  </div>
                  <div className="ml-2 flex items-center gap-1.5 shrink-0">
                    {"badge" in tab && tab.badge && (
                      <span className="font-mono-tabular bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent-ink)]">
                        {tab.badge}
                      </span>
                    )}
                    <span className="font-mono-tabular text-xs text-[var(--ink-muted)]">
                      [{tab.count}]
                    </span>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Workspace Container */}
      <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6">
        {loading ? (
          <div className="border border-[var(--rule-border)] bg-[var(--bg-surface)] p-12 text-center">
            <span className="type-kicker text-[var(--ink-secondary)]">
              LADE PARTITUR- & PROBENDATEN AUS PERSISTENTEM SPEICHER...
            </span>
          </div>
        ) : (
          <>
            {activeTab === "repertoire" && (
              <RepertoireTab
                pieces={pieces}
                suggestions={suggestions}
                currentUser={currentUser}
                onRefresh={async () => {
                  await fetchAllData();
                }}
                onRequireLogin={() => setShowLoginModal(true)}
                onOpenOnboarding={() => {
                  if (currentUser) {
                    setShowOnboardingModal(true);
                  } else {
                    setPendingOnboarding(true);
                    setShowLoginModal(true);
                  }
                }}
              />
            )}

            {activeTab === "probeplan" && (
              <ProbeplanTab
                config={config}
                sessions={sessions}
                pieces={pieces}
                suggestions={suggestions}
                currentUser={currentUser}
                onRefresh={async () => {
                  await fetchAllData();
                }}
                onRequireLogin={() => setShowLoginModal(true)}
              />
            )}

            {activeTab === "kalender" && (
              <TerminkalenderTab
                sessions={sessions}
                concerts={concerts}
                suggestions={suggestions}
                onRefresh={async () => {
                  await fetchAllData();
                }}
                onOpenProbeplan={() => setActiveTab("probeplan")}
              />
            )}

            {activeTab === "historie" && (
              <HistorieTab
                sessions={sessions}
                onRefresh={async () => {
                  await fetchAllData();
                }}
              />
            )}
          </>
        )}
      </main>

      {/* Initial Rating Onboarding Modal */}
      {currentUser && (
        <OnboardingModal
          isOpen={showOnboardingModal}
          onClose={() => setShowOnboardingModal(false)}
          pieces={pieces}
          suggestions={suggestions}
          currentUser={currentUser}
          onRefresh={async () => {
            await fetchAllData();
          }}
        />
      )}

      {/* Prompt Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md border-2 border-[var(--rule-heavy)] bg-[var(--bg-surface)] p-6">
            <div className="type-kicker text-[var(--accent)]">
              SPIELER-REGISTRIERUNG
            </div>
            <h2 className="type-section-h2 mt-1 text-[var(--ink-primary)]">
              Wie lautet dein Name?
            </h2>
            <p className="mt-2 text-sm text-[var(--ink-secondary)]">
              Gib deinen Vornamen oder Spitznamen ein, um Stücke zu bewerten und
              Proben-Protokolle einzutragen. Es wird keine öffentliche
              Namensliste beim Login angezeigt.
            </p>
            <form onSubmit={handleLoginSubmit} className="mt-5 space-y-4">
              <input
                type="text"
                required
                autoFocus
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Dein Vorname / Spitzname..."
                className="w-full border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-3.5 py-2.5 text-sm text-[var(--ink-primary)] placeholder-[var(--ink-muted)] focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-paper)] px-4 py-2.5 text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] cursor-pointer"
                >
                  ABBRECHEN
                </button>
                <button
                  type="submit"
                  disabled={loggingIn || !nameInput.trim()}
                  className="type-kicker bg-[var(--accent)] px-5 py-2.5 text-[var(--accent-ink)] disabled:opacity-40 cursor-pointer"
                >
                  {loggingIn ? "SPEICHERT..." : "NAME BESTÄTIGEN"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
