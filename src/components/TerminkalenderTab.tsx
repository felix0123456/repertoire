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
  RefreshCw,
  Sparkles,
  Printer,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";
import {
  ConcertEventItem,
  ConcertSetBlock,
  ConcertSetlistEntry,
  PieceItem,
  RehearsalSessionItem,
  SuggestionsData,
} from "@/types";
import SessionQrModal from "./SessionQrModal";
import KonzertmeisterSyncModal from "./KonzertmeisterSyncModal";
import { buildAppShareUrl, shareOrCopyLink } from "@/lib/share";

interface TerminkalenderTabProps {
  sessions: RehearsalSessionItem[];
  concerts: ConcertEventItem[];
  pieces: PieceItem[];
  suggestions: SuggestionsData;
  onRefresh: () => Promise<void>;
  onOpenProbeplan: (sessionId?: string) => void;
}

function escapeHtml(str: string): string {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function computeSetDramaturgyWarnings(
  block: ConcertSetBlock,
  pieceMap: Map<string, PieceItem>
): string[] {
  const warnings: string[] = [];
  let consecutiveType = "";
  let consecutiveTypeCount = 0;

  const consecutiveBySinger = new Map<
    string,
    { displayName: string; count: number; warned: boolean }
  >();

  for (const entry of block.entries) {
    if (entry.type !== "PIECE") {
      continue;
    }
    const piece = entry.pieceId ? pieceMap.get(entry.pieceId) : undefined;
    if (!piece) continue;

    const st = (piece.songType || "").trim();
    const isInstrumentalType = st.toLowerCase() === "instrumental";
    if (
      st &&
      !isInstrumentalType &&
      st.toLowerCase() === consecutiveType.toLowerCase()
    ) {
      consecutiveTypeCount++;
      if (consecutiveTypeCount === 3) {
        warnings.push(
          `≥ 3× hintereinander gleicher Tanz-/Song-Typ („${st}“) in „${block.title}“`
        );
      }
    } else {
      consecutiveType = st && !isInstrumentalType ? st : "";
      consecutiveTypeCount = st && !isInstrumentalType ? 1 : 0;
    }

    const activeSingers = (
      piece.singerList && piece.singerList.length > 0
        ? piece.singerList
        : (piece.singers || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
    ).filter(
      (s) =>
        !s.toLowerCase().includes("instrumental") &&
        !s.toLowerCase().includes("rhythmusgruppe")
    );

    if (activeSingers.length === 0) {
      consecutiveBySinger.clear();
      continue;
    }

    const activeLowerSet = new Set(activeSingers.map((s) => s.toLowerCase()));
    for (const key of Array.from(consecutiveBySinger.keys())) {
      if (!activeLowerSet.has(key)) {
        consecutiveBySinger.delete(key);
      }
    }

    for (const singer of activeSingers) {
      const key = singer.toLowerCase();
      const prev = consecutiveBySinger.get(key);
      const nextCount = (prev?.count || 0) + 1;
      const alreadyWarned = prev?.warned || false;
      if (nextCount >= 4 && !alreadyWarned) {
        warnings.push(
          `Sänger/in „${singer}“ singt ≥ 4 Stücke hintereinander ohne Instrumental/anderen Sänger dazwischen in „${block.title}“`
        );
        consecutiveBySinger.set(key, {
          displayName: singer,
          count: nextCount,
          warned: true,
        });
      } else {
        consecutiveBySinger.set(key, {
          displayName: singer,
          count: nextCount,
          warned: alreadyWarned,
        });
      }
    }
  }

  return warnings;
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
  pieces,
  suggestions,
  onRefresh,
  onOpenProbeplan,
}: TerminkalenderTabProps) {
  const [showKmModal, setShowKmModal] = useState(false);
  const [expandedSetlistConcertId, setExpandedSetlistConcertId] = useState<
    string | null
  >(concerts[0]?.id || null);
  const [selectedPiecePerBlock, setSelectedPiecePerBlock] = useState<
    Record<string, string>
  >({});
  const [talkTitlePerBlock, setTalkTitlePerBlock] = useState<
    Record<string, string>
  >({});
  const [talkMinsPerBlock, setTalkMinsPerBlock] = useState<
    Record<string, string>
  >({});
  const [newBlockTitlePerConcert, setNewBlockTitlePerConcert] = useState<
    Record<string, string>
  >({});

  const pieceMap = useMemo(
    () => new Map(pieces.map((p) => [p.id, p])),
    [pieces]
  );

  const saveConcertSetlist = async (
    concertId: string,
    nextSetlist: ConcertSetBlock[]
  ) => {
    await fetch(`/api/concerts/${concertId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setlist: nextSetlist }),
    });
    await onRefresh();
  };

  const handleAutoGenerateSetlist = async (concert: ConcertEventItem) => {
    if (pieces.length === 0) return;
    // Sort pieces by avgLike desc, then avgConfidence asc (ready & popular pieces first)
    const pool = [...pieces].sort((a, b) => {
      if (Math.abs(b.avgLike - a.avgLike) > 0.2) return b.avgLike - a.avgLike;
      return b.priorityScore - a.priorityScore;
    });

    const targetPerSet = Math.max(4, Math.min(7, Math.ceil(pool.length / 3)));
    const setTitles = [
      "Set 1 – Eröffnung & Swing",
      "Set 2 – Standard & Latein",
      "Set 3 – Party & Finale",
    ];

    const usedIds = new Set<string>();
    const blocks: ConcertSetBlock[] = setTitles.map((title, sIdx) => {
      const entries: ConcertSetlistEntry[] = [];
      let lastType = "";
      let lastSinger = "";

      for (let slot = 0; slot < targetPerSet; slot++) {
        // Insert a Talk / Moderation round in the middle of each set
        if (slot === Math.floor(targetPerSet / 2)) {
          entries.push({
            id: `talk-${sIdx + 1}-${Date.now()}-${slot}`,
            type: "TALK",
            talkTitle: `Talk-Runde / Moderation #${sIdx + 1}`,
            durationMinutes: 10,
          });
          lastSinger = "";
        }

        const candidate =
          pool.find(
            (p) =>
              !usedIds.has(p.id) &&
              (!lastType ||
                (p.songType || "").toLowerCase() !== lastType.toLowerCase()) &&
              (!lastSinger ||
                (p.singers || "").toLowerCase() !== lastSinger.toLowerCase())
          ) ||
          pool.find(
            (p) =>
              !usedIds.has(p.id) &&
              (!lastType ||
                (p.songType || "").toLowerCase() !== lastType.toLowerCase())
          ) ||
          pool.find((p) => !usedIds.has(p.id));

        if (!candidate) break;
        usedIds.add(candidate.id);
        lastType = candidate.songType || "";
        lastSinger = candidate.singers || "";

        entries.push({
          id: `entry-${sIdx + 1}-${candidate.id}`,
          type: "PIECE",
          pieceId: candidate.id,
        });
      }

      return {
        id: `set-${sIdx + 1}-${Date.now()}`,
        title,
        entries,
      };
    });

    await saveConcertSetlist(concert.id, blocks);
    setExpandedSetlistConcertId(concert.id);
  };

  const handlePrintConcertSetlist = (concert: ConcertEventItem) => {
    if (typeof window === "undefined") return;
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) {
      window.print();
      return;
    }

    const dateStr = concert.scheduledDate
      ? new Date(concert.scheduledDate).toLocaleDateString("de-DE", {
          weekday: "long",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "";

    const setsHtml = (concert.setlist || [])
      .map((block) => {
        let pieceCounter = 0;
        const rowsHtml = block.entries
          .map((entry) => {
            if (entry.type === "TALK") {
              return `<tr style="background:#EBE5D8;">
                <td style="padding:8px 10px;font-family:monospace;font-weight:bold;">🎤 TALK</td>
                <td colspan="4" style="padding:8px 10px;font-weight:bold;">${escapeHtml(
                  entry.talkTitle || "Talk-Runde / Moderation"
                )} (${entry.durationMinutes || 10} Min.)</td>
              </tr>`;
            }
            pieceCounter++;
            const p = entry.pieceId ? pieceMap.get(entry.pieceId) : undefined;
            if (!p) return "";
            return `<tr>
              <td style="padding:8px 10px;font-family:monospace;font-size:16px;font-weight:bold;border-bottom:1px solid #D6CFC1;">
                ${String(pieceCounter).padStart(2, "0")} · [${
              p.folderNumber ? `#${escapeHtml(p.folderNumber)}` : "—"
            }]
              </td>
              <td style="padding:8px 10px;font-size:17px;font-weight:bold;border-bottom:1px solid #D6CFC1;">
                ${escapeHtml(p.title)}
              </td>
              <td style="padding:8px 10px;font-size:14px;border-bottom:1px solid #D6CFC1;">
                ${escapeHtml(p.songType || "—")}
              </td>
              <td style="padding:8px 10px;font-family:monospace;font-size:14px;font-weight:bold;border-bottom:1px solid #D6CFC1;">
                ${p.bpm > 0 ? `♩ ${p.bpm} BPM` : "—"}
              </td>
              <td style="padding:8px 10px;font-size:14px;border-bottom:1px solid #D6CFC1;">
                ${escapeHtml(p.singers || "Instrumental")}${
              p.soloists ? ` (Solo: ${escapeHtml(p.soloists)})` : ""
            }
              </td>
            </tr>`;
          })
          .join("");

        return `<div style="margin-bottom:28px;page-break-inside:avoid;">
          <h2 style="margin:0 0 8px 0;padding:6px 10px;background:#141311;color:#FDFBF7;font-size:16px;text-transform:uppercase;letter-spacing:0.06em;">
            ${escapeHtml(block.title)}
          </h2>
          <table style="width:100%;border-collapse:collapse;border:2px solid #141311;">
            <thead>
              <tr style="background:#F6F3EC;border-bottom:2px solid #141311;text-align:left;font-size:11px;text-transform:uppercase;">
                <th style="padding:6px 10px;">NR / MAPPE</th>
                <th style="padding:6px 10px;">TITEL</th>
                <th style="padding:6px 10px;">TANZTYP</th>
                <th style="padding:6px 10px;">TEMPO</th>
                <th style="padding:6px 10px;">GESANG / SOLIST</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>`;
      })
      .join("");

    win.document.write(`<!DOCTYPE html>
      <html lang="de">
      <head>
        <meta charset="utf-8" />
        <title>Bühnen-Setlist — ${escapeHtml(concert.title)}</title>
      </head>
      <body style="font-family:sans-serif;color:#141311;padding:24px;max-width:900px;margin:0 auto;">
        <div style="border-bottom:3px solid #141311;padding-bottom:12px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:baseline;">
          <div>
            <div style="font-family:monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#57534C;">BÜHNEN-SETLIST & PROGRAMMFOLGE</div>
            <h1 style="margin:4px 0 0 0;font-size:26px;">${escapeHtml(
              concert.title
            )}</h1>
          </div>
          <div style="font-family:monospace;font-size:13px;text-align:right;">
            ${dateStr ? `<div><strong>${escapeHtml(dateStr)}</strong></div>` : ""}
            ${
              concert.location
                ? `<div>${escapeHtml(concert.location)}</div>`
                : ""
            }
          </div>
        </div>
        ${setsHtml}
        <script>window.onload = () => { window.print(); };</script>
      </body>
      </html>`);
    win.document.close();
  };
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
        <div className="grid grid-cols-3 gap-1.5 border border-[var(--ink-primary)] bg-[var(--bg-surface)] p-2 lg:hidden">
          <button
            type="button"
            onClick={openCreateConcert}
            className="type-kicker inline-flex items-center justify-center gap-1 bg-[var(--accent)] px-2 py-2 text-[10px] text-[var(--accent-ink)] cursor-pointer"
          >
            <Plus className="h-3 w-3" /> AUFTRITT
          </button>
          <button
            type="button"
            onClick={openCreateRehearsal}
            className="type-kicker inline-flex items-center justify-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-paper)] px-2 py-2 text-[10px] text-[var(--ink-primary)] cursor-pointer"
          >
            <Plus className="h-3 w-3" /> PROBE
          </button>
          <button
            type="button"
            onClick={() => setShowKmModal(true)}
            className="type-kicker inline-flex items-center justify-center gap-1 border border-[var(--ink-primary)] bg-[var(--bg-recessed)] px-2 py-2 text-[10px] font-bold text-[var(--ink-primary)] cursor-pointer"
          >
            🔄 KM-SYNC
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
              Freitext-Zusatzinformationen & Auftritts-Setlist.
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

            <button
              type="button"
              onClick={() => setShowKmModal(true)}
              className="type-kicker ui-transition flex w-full items-center justify-center gap-2 border-2 border-[var(--ink-primary)] bg-[var(--bg-recessed)] px-4 py-2.5 font-bold text-[var(--ink-primary)] hover:bg-[var(--ink-primary)] hover:text-[var(--bg-surface)] cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              🔄 KONZERTMEISTER-SYNC
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

                    <div className="flex flex-wrap items-center gap-1.5 self-end sm:self-start">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedSetlistConcertId(
                            expandedSetlistConcertId === c.id ? null : c.id
                          )
                        }
                        className={`type-kicker inline-flex items-center gap-1.5 border px-3 py-1.5 cursor-pointer ${
                          expandedSetlistConcertId === c.id
                            ? "border-[var(--ink-primary)] bg-[var(--ink-primary)] font-bold text-[var(--bg-surface)]"
                            : "border-[var(--ink-primary)] bg-[var(--bg-recessed)] font-bold text-[var(--ink-primary)]"
                        }`}
                      >
                        <span>
                          🎼 AUFTRITTS-SETLIST & SETS PLANEN (
                          {(c.setlist || []).reduce(
                            (sum, b) =>
                              sum +
                              b.entries.filter((e) => e.type === "PIECE")
                                .length,
                            0
                          )}{" "}
                          Stücke)
                        </span>
                        {expandedSetlistConcertId === c.id ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>

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

                  {/* Expandable Section: Concert Setlist Generator in Blocks / Sets */}
                  {expandedSetlistConcertId === c.id && (
                    <div className="mt-4 space-y-4 border-t-2 border-[var(--rule-heavy)] pt-4">
                      {/* Setlist Top Toolbar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border border-[var(--rule-border)] bg-[var(--bg-recessed)] p-3">
                        <div>
                          <span className="type-kicker text-[var(--accent)]">
                            KONZERT-PROGRAMM & TANZRUNDEN-DRAMATURGIE
                          </span>
                          <div className="font-display text-base font-semibold text-[var(--ink-primary)]">
                            Setlist in Sets / Blöcken für „{c.title}“
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleAutoGenerateSetlist(c)}
                            className="type-kicker inline-flex items-center gap-1.5 bg-[var(--accent)] px-3 py-2 text-xs font-bold text-[var(--accent-ink)] cursor-pointer"
                          >
                            <Sparkles className="h-3.5 w-3.5" />✨ SETLIST
                            AUTOMATISCH VORSCHLAGEN
                          </button>

                          {(c.setlist || []).length > 0 && (
                            <button
                              type="button"
                              onClick={() => handlePrintConcertSetlist(c)}
                              className="type-kicker inline-flex items-center gap-1.5 border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-bold text-[var(--ink-primary)] hover:bg-[var(--ink-primary)] hover:text-[var(--bg-surface)] cursor-pointer"
                            >
                              <Printer className="h-3.5 w-3.5" />🖨
                              BÜHNEN-SETLIST DRUCKEN
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Existing Set Blocks */}
                      {(c.setlist || []).length === 0 ? (
                        <div className="border border-dashed border-[var(--rule-border)] bg-[var(--bg-paper)] p-6 text-center text-xs text-[var(--ink-secondary)]">
                          Noch keine Sets für diesen Auftritt angelegt. Klicke
                          oben auf{" "}
                          <strong>„✨ SETLIST AUTOMATISCH VORSCHLAGEN“</strong>{" "}
                          (verteilt die beliebtesten Stücke abwechslungsreich
                          auf 3 Sets inkl. Talk-Runden) oder lege unten ein
                          eigenes Set an.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {(c.setlist || []).map((block, bIdx) => {
                            const warnings = computeSetDramaturgyWarnings(
                              block,
                              pieceMap
                            );
                            return (
                              <div
                                key={block.id}
                                className="border border-[var(--ink-primary)] bg-[var(--bg-paper)] p-3.5"
                              >
                                {/* Set Block Header */}
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule-border)] pb-2.5">
                                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                                    <span className="font-mono-tabular bg-[var(--ink-primary)] px-2 py-0.5 text-xs font-bold text-[var(--bg-surface)]">
                                      SET #{bIdx + 1}
                                    </span>
                                    <input
                                      type="text"
                                      defaultValue={block.title}
                                      onBlur={(e) => {
                                        const nextTitle =
                                          e.target.value.trim() ||
                                          `Set ${bIdx + 1}`;
                                        if (nextTitle === block.title) return;
                                        const nextSetlist = (
                                          c.setlist || []
                                        ).map((b, i) =>
                                          i === bIdx
                                            ? { ...b, title: nextTitle }
                                            : b
                                        );
                                        saveConcertSetlist(c.id, nextSetlist);
                                      }}
                                      className="font-display flex-1 border border-transparent bg-transparent px-1.5 py-0.5 text-base font-semibold text-[var(--ink-primary)] hover:border-[var(--rule-border)] focus:border-[var(--ink-primary)] focus:bg-[var(--bg-surface)] focus:outline-none"
                                    />
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <span className="font-mono-tabular text-xs text-[var(--ink-secondary)]">
                                      {
                                        block.entries.filter(
                                          (e) => e.type === "PIECE"
                                        ).length
                                      }{" "}
                                      Stücke
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextSetlist = (
                                          c.setlist || []
                                        ).filter((_, i) => i !== bIdx);
                                        saveConcertSetlist(c.id, nextSetlist);
                                      }}
                                      title="Set löschen"
                                      className="border border-[var(--rule-border)] bg-[var(--bg-surface)] p-1 text-[var(--ink-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Automatic Dramaturgy Warnings */}
                                {warnings.length > 0 && (
                                  <div className="mt-2.5 space-y-1">
                                    {warnings.map((w, wIdx) => (
                                      <div
                                        key={wIdx}
                                        className="flex items-center gap-2 border border-[var(--accent)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--accent)]"
                                      >
                                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                        <span>
                                          <strong>Dramaturgie-Warnung:</strong>{" "}
                                          {w}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Entries inside Set Block */}
                                {block.entries.length === 0 ? (
                                  <p className="py-3 text-xs text-[var(--ink-muted)]">
                                    Noch keine Stücke oder Talk-Runden in diesem
                                    Set.
                                  </p>
                                ) : (
                                  <div className="mt-2.5 divide-y divide-[var(--rule-border)] border border-[var(--rule-border)] bg-[var(--bg-surface)]">
                                    {block.entries.map((entry, eIdx) => {
                                      const p =
                                        entry.type === "PIECE" && entry.pieceId
                                          ? pieceMap.get(entry.pieceId)
                                          : undefined;

                                      return (
                                        <div
                                          key={entry.id}
                                          className={`flex items-center justify-between gap-2 px-3 py-2 text-xs ${
                                            entry.type === "TALK"
                                              ? "bg-[var(--bg-recessed)] font-medium"
                                              : ""
                                          }`}
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-mono-tabular text-[11px] font-bold text-[var(--ink-muted)]">
                                              {String(eIdx + 1).padStart(
                                                2,
                                                "0"
                                              )}
                                            </span>
                                            {entry.type === "TALK" ? (
                                              <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="type-kicker bg-[var(--ink-primary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--bg-surface)]">
                                                  🎤 TALK / MODERATION
                                                </span>
                                                <span className="font-semibold text-[var(--ink-primary)]">
                                                  {entry.talkTitle ||
                                                    "Talk-Runde / Moderation"}
                                                </span>
                                                <span className="font-mono-tabular text-[11px] text-[var(--ink-secondary)]">
                                                  (
                                                  {entry.durationMinutes || 10}{" "}
                                                  Min.)
                                                </span>
                                              </div>
                                            ) : p ? (
                                              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                                {p.folderNumber && (
                                                  <span className="font-mono-tabular border border-[var(--ink-primary)] bg-[var(--ink-primary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--bg-surface)]">
                                                    #{p.folderNumber}
                                                  </span>
                                                )}
                                                <span className="font-display text-sm font-semibold text-[var(--ink-primary)]">
                                                  {p.title}
                                                </span>
                                                {p.songType && (
                                                  <span className="type-kicker border border-[var(--rule-border)] bg-[var(--bg-paper)] px-1.5 py-0.5 text-[10px] text-[var(--ink-secondary)]">
                                                    {p.songType}
                                                  </span>
                                                )}
                                                {p.bpm > 0 && (
                                                  <span className="font-mono-tabular border border-[var(--rule-border)] bg-[var(--bg-paper)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--ink-primary)]">
                                                    ♩ {p.bpm} BPM
                                                  </span>
                                                )}
                                                <span className="text-[11px] text-[var(--ink-secondary)]">
                                                  · {p.singers || "Instr."}
                                                </span>
                                                <span className="font-mono-tabular text-[10px] text-[var(--ink-muted)]">
                                                  · ♥ {p.avgLike.toFixed(1)}
                                                </span>
                                              </div>
                                            ) : (
                                              <span className="text-[var(--ink-muted)]">
                                                Unbekanntes Stück
                                              </span>
                                            )}
                                          </div>

                                          {/* Reorder ▲ / ▼ and Remove ✕ */}
                                          <div className="flex shrink-0 items-center gap-1">
                                            <button
                                              type="button"
                                              disabled={eIdx === 0}
                                              onClick={() => {
                                                const nextEntries = [
                                                  ...block.entries,
                                                ];
                                                const tmp =
                                                  nextEntries[eIdx - 1];
                                                nextEntries[eIdx - 1] =
                                                  nextEntries[eIdx];
                                                nextEntries[eIdx] = tmp;
                                                const nextSetlist = (
                                                  c.setlist || []
                                                ).map((b, i) =>
                                                  i === bIdx
                                                    ? {
                                                        ...b,
                                                        entries: nextEntries,
                                                      }
                                                    : b
                                                );
                                                saveConcertSetlist(
                                                  c.id,
                                                  nextSetlist
                                                );
                                              }}
                                              className="border border-[var(--rule-border)] bg-[var(--bg-paper)] px-1.5 py-0.5 text-[10px] disabled:opacity-30 cursor-pointer"
                                            >
                                              ▲
                                            </button>
                                            <button
                                              type="button"
                                              disabled={
                                                eIdx ===
                                                block.entries.length - 1
                                              }
                                              onClick={() => {
                                                const nextEntries = [
                                                  ...block.entries,
                                                ];
                                                const tmp =
                                                  nextEntries[eIdx + 1];
                                                nextEntries[eIdx + 1] =
                                                  nextEntries[eIdx];
                                                nextEntries[eIdx] = tmp;
                                                const nextSetlist = (
                                                  c.setlist || []
                                                ).map((b, i) =>
                                                  i === bIdx
                                                    ? {
                                                        ...b,
                                                        entries: nextEntries,
                                                      }
                                                    : b
                                                );
                                                saveConcertSetlist(
                                                  c.id,
                                                  nextSetlist
                                                );
                                              }}
                                              className="border border-[var(--rule-border)] bg-[var(--bg-paper)] px-1.5 py-0.5 text-[10px] disabled:opacity-30 cursor-pointer"
                                            >
                                              ▼
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const nextEntries =
                                                  block.entries.filter(
                                                    (_, i) => i !== eIdx
                                                  );
                                                const nextSetlist = (
                                                  c.setlist || []
                                                ).map((b, i) =>
                                                  i === bIdx
                                                    ? {
                                                        ...b,
                                                        entries: nextEntries,
                                                      }
                                                    : b
                                                );
                                                saveConcertSetlist(
                                                  c.id,
                                                  nextSetlist
                                                );
                                              }}
                                              className="border border-[var(--rule-border)] bg-[var(--bg-paper)] px-1.5 py-0.5 text-[10px] text-[var(--accent)] cursor-pointer"
                                            >
                                              ✕
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Add Piece or Talk Round to Set Block */}
                                <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-12">
                                  <div className="flex gap-1.5 lg:col-span-7">
                                    <select
                                      value={
                                        selectedPiecePerBlock[block.id] || ""
                                      }
                                      onChange={(e) =>
                                        setSelectedPiecePerBlock((prev) => ({
                                          ...prev,
                                          [block.id]: e.target.value,
                                        }))
                                      }
                                      className="flex-1 border border-[var(--rule-border)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--ink-primary)]"
                                    >
                                      <option value="">
                                        + Stück aus Repertoire hinzufügen...
                                      </option>
                                      {pieces.map((p) => (
                                        <option key={p.id} value={p.id}>
                                          {p.folderNumber
                                            ? `[#${p.folderNumber}] `
                                            : ""}
                                          {p.title}
                                          {p.songType ? ` · ${p.songType}` : ""}
                                          {p.bpm > 0 ? ` · ♩ ${p.bpm} BPM` : ""}
                                          {p.singers
                                            ? ` · ${p.singers}`
                                            : " · Instr."}{" "}
                                          · ♥ {p.avgLike.toFixed(1)}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      type="button"
                                      disabled={
                                        !selectedPiecePerBlock[block.id]
                                      }
                                      onClick={() => {
                                        const pid =
                                          selectedPiecePerBlock[block.id];
                                        if (!pid) return;
                                        const nextEntry: ConcertSetlistEntry = {
                                          id: `piece-${Date.now()}-${Math.random()
                                            .toString(36)
                                            .slice(2, 6)}`,
                                          type: "PIECE",
                                          pieceId: pid,
                                        };
                                        const nextSetlist = (
                                          c.setlist || []
                                        ).map((b, i) =>
                                          i === bIdx
                                            ? {
                                                ...b,
                                                entries: [
                                                  ...b.entries,
                                                  nextEntry,
                                                ],
                                              }
                                            : b
                                        );
                                        setSelectedPiecePerBlock((prev) => ({
                                          ...prev,
                                          [block.id]: "",
                                        }));
                                        saveConcertSetlist(c.id, nextSetlist);
                                      }}
                                      className="type-kicker shrink-0 border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--ink-primary)] disabled:opacity-40 cursor-pointer"
                                    >
                                      + STÜCK
                                    </button>
                                  </div>

                                  <div className="flex gap-1.5 lg:col-span-5">
                                    <input
                                      type="text"
                                      value={talkTitlePerBlock[block.id] || ""}
                                      onChange={(e) =>
                                        setTalkTitlePerBlock((prev) => ({
                                          ...prev,
                                          [block.id]: e.target.value,
                                        }))
                                      }
                                      placeholder="🎤 Talk-Runde / Moderation..."
                                      className="flex-1 border border-[var(--rule-border)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--ink-primary)]"
                                    />
                                    <input
                                      type="number"
                                      min={1}
                                      max={60}
                                      value={
                                        talkMinsPerBlock[block.id] ?? "10"
                                      }
                                      onChange={(e) =>
                                        setTalkMinsPerBlock((prev) => ({
                                          ...prev,
                                          [block.id]: e.target.value,
                                        }))
                                      }
                                      title="Dauer in Minuten"
                                      className="font-mono-tabular w-14 border border-[var(--rule-border)] bg-[var(--bg-surface)] px-2 py-1.5 text-center text-xs"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const tTitle =
                                          (
                                            talkTitlePerBlock[block.id] || ""
                                          ).trim() ||
                                          "Talk-Runde / Moderation";
                                        const tMins = Math.max(
                                          1,
                                          Number(
                                            talkMinsPerBlock[block.id] || 10
                                          ) || 10
                                        );
                                        const nextEntry: ConcertSetlistEntry = {
                                          id: `talk-${Date.now()}-${Math.random()
                                            .toString(36)
                                            .slice(2, 6)}`,
                                          type: "TALK",
                                          talkTitle: tTitle,
                                          durationMinutes: tMins,
                                        };
                                        const nextSetlist = (
                                          c.setlist || []
                                        ).map((b, i) =>
                                          i === bIdx
                                            ? {
                                                ...b,
                                                entries: [
                                                  ...b.entries,
                                                  nextEntry,
                                                ],
                                              }
                                            : b
                                        );
                                        setTalkTitlePerBlock((prev) => ({
                                          ...prev,
                                          [block.id]: "",
                                        }));
                                        saveConcertSetlist(c.id, nextSetlist);
                                      }}
                                      className="type-kicker shrink-0 border border-[var(--ink-primary)] bg-[var(--bg-recessed)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--ink-primary)] cursor-pointer"
                                    >
                                      + 🎤 TALK
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Add New Set Block Input */}
                      <div className="flex flex-wrap items-center gap-2 border border-[var(--rule-border)] bg-[var(--bg-paper)] p-3">
                        <input
                          type="text"
                          value={newBlockTitlePerConcert[c.id] || ""}
                          onChange={(e) =>
                            setNewBlockTitlePerConcert((prev) => ({
                              ...prev,
                              [c.id]: e.target.value,
                            }))
                          }
                          placeholder={`Neues Set anlegen (z.B. „Set ${
                            (c.setlist || []).length + 1
                          } – Eröffnung & Swing“ oder „Zugaben“)...`}
                          className="flex-1 border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs text-[var(--ink-primary)]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const title =
                              (newBlockTitlePerConcert[c.id] || "").trim() ||
                              `Set ${(c.setlist || []).length + 1}`;
                            const nextBlock: ConcertSetBlock = {
                              id: `set-${Date.now()}-${Math.random()
                                .toString(36)
                                .slice(2, 6)}`,
                              title,
                              entries: [],
                            };
                            setNewBlockTitlePerConcert((prev) => ({
                              ...prev,
                              [c.id]: "",
                            }));
                            saveConcertSetlist(c.id, [
                              ...(c.setlist || []),
                              nextBlock,
                            ]);
                          }}
                          className="type-kicker inline-flex items-center gap-1 bg-[var(--ink-primary)] px-3.5 py-1.5 text-xs font-bold text-[var(--bg-surface)] cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" /> + SET / BLOCK
                          HINZUFÜGEN
                        </button>
                      </div>
                    </div>
                  )}
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

      {/* Modal: Konzertmeister Sync (Schedule & Attendance) */}
      <KonzertmeisterSyncModal
        isOpen={showKmModal}
        onClose={() => setShowKmModal(false)}
        sessions={sessions}
        defaultTab="schedule"
        onSuccess={onRefresh}
      />
    </div>
  );
}
