import { prisma, savePersistentSnapshot } from "./prisma";
import {
  getInstrumentSection,
  getRegisterFamily,
  InstrumentPracticeStat,
  MeasureNoteItem,
  SessionAttendanceEntry,
} from "@/types";

export function splitTags(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizeTags(raw: string | string[]): string {
  const arr = Array.isArray(raw) ? raw : splitTags(raw);
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const item of arr) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      clean.push(trimmed);
    }
  }
  return clean.join(", ");
}

export function parseMeasureNotes(
  rawJson: string | null | undefined
): MeasureNoteItem[] {
  if (!rawJson) return [];
  try {
    const parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.note === "string")
      .map((item) => ({
        id: String(item.id || `${Date.now()}-${Math.random()}`),
        measure: String(item.measure || "").trim(),
        instrument: String(item.instrument || "").trim(),
        note: String(item.note || "").trim(),
        author: String(item.author || "").trim(),
        createdAt: String(item.createdAt || new Date().toISOString()),
      }));
  } catch {
    return [];
  }
}

export function parseSessionAttendance(
  rawJson: string | null | undefined
): SessionAttendanceEntry[] {
  if (!rawJson) return [];
  try {
    const parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.userName === "string")
      .map((item) => {
        const inst = String(item.instrument || "").trim();
        return {
          userId: item.userId ? String(item.userId) : undefined,
          userName: String(item.userName).trim(),
          instrument: inst,
          registerFamily: getRegisterFamily(inst),
          status:
            item.status === "ABSENT"
              ? "ABSENT"
              : item.status === "MAYBE"
              ? "MAYBE"
              : "PRESENT",
          comment: item.comment ? String(item.comment).trim() : "",
          updatedAt: item.updatedAt
            ? String(item.updatedAt)
            : new Date().toISOString(),
        };
      });
  } catch {
    return [];
  }
}

/**
 * Determines which register families / instruments have too many absences in a session.
 * Combines explicit `absentInstruments` tags on the session with the Konzertmeister `attendanceJson` breakdown.
 * A register family (e.g. "Saxophon", "Posaune", "Trompete") is considered understaffed when:
 * - Explicitly listed in `absentInstruments`, OR
 * - From Konzertmeister attendance:
 *   - `absentCount >= 2` and `absentCount >= presentCount` (>= 50% absent), OR
 *   - `presentCount === 0` and `absentCount >= 1` (whole register absent), OR
 *   - `absentCount >= 2` for Saxophon/Posaune/Trompete when `presentCount <= 2`.
 */
export function getUnderstaffedRegistersForSession(
  absentInstrumentsRaw: string | null | undefined,
  attendanceJsonRaw: string | null | undefined
): string[] {
  const result = new Set<string>();

  for (const tag of splitTags(absentInstrumentsRaw || "")) {
    result.add(tag);
    const fam = getRegisterFamily(tag);
    if (fam) result.add(fam);
  }

  let hasManualRegisterOverride = false;
  if (attendanceJsonRaw) {
    try {
      const rawParsed = JSON.parse(attendanceJsonRaw);
      if (
        Array.isArray(rawParsed) &&
        rawParsed.some((item) => item && item.manualRegisterOverride === true)
      ) {
        hasManualRegisterOverride = true;
      }
    } catch {
      // ignore parse errors
    }
  }

  const attendance = hasManualRegisterOverride
    ? []
    : parseSessionAttendance(attendanceJsonRaw);
  if (attendance.length > 0) {
    const byFamily = new Map<
      string,
      { present: number; absent: number; maybe: number }
    >();
    const byExact = new Map<
      string,
      { displayName: string; present: number; absent: number }
    >();

    for (const entry of attendance) {
      if (!entry.instrument) continue;
      const fam = getRegisterFamily(entry.instrument);
      if (fam) {
        const cur = byFamily.get(fam) || { present: 0, absent: 0, maybe: 0 };
        if (entry.status === "PRESENT") cur.present += 1;
        else if (entry.status === "ABSENT") cur.absent += 1;
        else cur.maybe += 1;
        byFamily.set(fam, cur);
      }

      const exactKey = entry.instrument.toLowerCase();
      const curExact = byExact.get(exactKey) || {
        displayName: entry.instrument,
        present: 0,
        absent: 0,
      };
      if (entry.status === "PRESENT") curExact.present += 1;
      else if (entry.status === "ABSENT") curExact.absent += 1;
      byExact.set(exactKey, curExact);
    }

    for (const [fam, counts] of byFamily.entries()) {
      const tooManyAbsent =
        (counts.present === 0 && counts.absent >= 1) ||
        (counts.absent >= 2 && counts.absent >= counts.present) ||
        (counts.absent >= 2 && counts.present <= 2);
      if (tooManyAbsent) {
        result.add(fam);
      }
    }

    for (const counts of byExact.values()) {
      const tooManyAbsent =
        (counts.present === 0 && counts.absent >= 1) ||
        (counts.absent >= 2 && counts.absent >= counts.present);
      if (tooManyAbsent) {
        result.add(counts.displayName);
      }
    }
  }

  return Array.from(result);
}

/**
 * Computes per-instrument practice need & difficulty statistics for a piece,
 * combining voter instruments and manually flagged focusInstruments.
 */
export function computeInstrumentStats(
  votes: {
    likeScore: number;
    confidenceScore: number;
    practiceNeededScore: number;
    user?: { instrument?: string | null } | null;
  }[],
  focusInstrumentsRaw?: string | null
): InstrumentPracticeStat[] {
  const focusList = splitTags(focusInstrumentsRaw || "");
  const focusSetLower = new Set(focusList.map((f) => f.toLowerCase()));

  const map = new Map<
    string,
    {
      displayName: string;
      likeSum: number;
      confSum: number;
      pracSum: number;
      count: number;
      isFlagged: boolean;
    }
  >();

  for (const focusInst of focusList) {
    const key = focusInst.toLowerCase();
    map.set(key, {
      displayName: focusInst,
      likeSum: 0,
      confSum: 0,
      pracSum: 0,
      count: 0,
      isFlagged: true,
    });
  }

  for (const v of votes || []) {
    const inst = (v.user?.instrument || "").trim();
    if (!inst) continue;
    const key = inst.toLowerCase();
    const fam = getRegisterFamily(inst).toLowerCase();
    const isFlagged =
      focusSetLower.has(key) || (Boolean(fam) && focusSetLower.has(fam));
    const existing = map.get(key);
    if (existing) {
      existing.likeSum += v.likeScore;
      existing.confSum += v.confidenceScore;
      existing.pracSum += v.practiceNeededScore;
      existing.count += 1;
      if (isFlagged) existing.isFlagged = true;
    } else {
      map.set(key, {
        displayName: inst,
        likeSum: v.likeScore,
        confSum: v.confidenceScore,
        pracSum: v.practiceNeededScore,
        count: 1,
        isFlagged,
      });
    }
  }

  const stats: InstrumentPracticeStat[] = [];
  for (const entry of map.values()) {
    const avgPrac =
      entry.count > 0
        ? Math.round((entry.pracSum / entry.count) * 10) / 10
        : entry.isFlagged
        ? 4.5
        : 0;
    const avgConf =
      entry.count > 0
        ? Math.round((entry.confSum / entry.count) * 10) / 10
        : entry.isFlagged
        ? 4.0
        : 0;
    const avgLike =
      entry.count > 0
        ? Math.round((entry.likeSum / entry.count) * 10) / 10
        : 3.0;

    stats.push({
      instrument: entry.displayName,
      registerFamily: getRegisterFamily(entry.displayName),
      section: getInstrumentSection(entry.displayName),
      voteCount: entry.count,
      avgPracticeNeeded: avgPrac,
      avgConfidence: avgConf,
      avgLike,
      isFlaggedFocus: entry.isFlagged || avgPrac >= 3.8,
    });
  }

  return stats.sort(
    (a, b) =>
      b.avgPracticeNeeded - a.avgPracticeNeeded ||
      (b.isFlaggedFocus ? 1 : 0) - (a.isFlaggedFocus ? 1 : 0)
  );
}

/**
 * Computes the estimated rehearsal duration in minutes for a piece in a session.
 */
export function getEffectivePieceMinutes(
  manualEstimatedMinutes: number | null | undefined,
  avgPracticeNeeded: number,
  avgConfidence: number,
  difficulty: string
): number {
  const manual = Number(manualEstimatedMinutes ?? 0);
  if (manual > 0) {
    return Math.max(5, Math.min(90, manual));
  }
  let base = 15;
  if (avgPracticeNeeded >= 3.8) base += 5;
  if (avgConfidence >= 4.0 || difficulty === "HARD") base += 5;
  if (avgPracticeNeeded <= 2.2 && difficulty === "EASY") base -= 5;
  return Math.max(10, Math.min(30, base));
}

/**
 * Computes the urgency/priority score S(p) for a piece and human-readable German reasons.
 */
export function calculatePiecePriority(
  piece: {
    difficulty: string;
    focusInstruments?: string | null;
    lastPracticedAt: Date | null;
    votes: {
      likeScore: number;
      confidenceScore: number;
      practiceNeededScore: number;
      user?: { instrument?: string | null } | null;
    }[];
  },
  simulatedDaysSincePractice?: number
): {
  avgLike: number;
  avgConfidence: number;
  avgPracticeNeeded: number;
  priorityScore: number;
  priorityReasons: string[];
  instrumentStats: InstrumentPracticeStat[];
} {
  const votes = piece.votes || [];
  const voteCount = votes.length;

  const avgLike =
    voteCount > 0
      ? votes.reduce((acc, v) => acc + v.likeScore, 0) / voteCount
      : 3.0;
  const avgConfidence =
    voteCount > 0
      ? votes.reduce((acc, v) => acc + v.confidenceScore, 0) / voteCount
      : 3.0;
  const avgPracticeNeeded =
    voteCount > 0
      ? votes.reduce((acc, v) => acc + v.practiceNeededScore, 0) / voteCount
      : 3.5;

  let timeFactor = 5.0;
  let daysSince: number | null = null;

  if (typeof simulatedDaysSincePractice === "number") {
    daysSince = simulatedDaysSincePractice;
    timeFactor = Math.min(4.8, (daysSince / 30) * 4.5);
  } else if (piece.lastPracticedAt) {
    const diffMs = Date.now() - new Date(piece.lastPracticedAt).getTime();
    daysSince = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    timeFactor = Math.min(4.8, (daysSince / 30) * 4.5);
  }

  const diffBonus =
    piece.difficulty === "HARD"
      ? 1.5
      : piece.difficulty === "EASY"
      ? 0.5
      : 1.0;

  const instrumentStats = computeInstrumentStats(
    votes,
    piece.focusInstruments
  );

  const highSectionNeedBonus = instrumentStats.some(
    (st) => st.avgPracticeNeeded >= 4.0 || st.isFlaggedFocus
  )
    ? 0.8
    : 0;

  const rawScore =
    3.0 * avgPracticeNeeded +
    2.5 * avgConfidence +
    2.0 * timeFactor +
    1.0 * diffBonus +
    highSectionNeedBonus;

  const priorityScore = Math.round(rawScore * 10) / 10;

  const reasons: string[] = [];
  if (avgPracticeNeeded >= 3.8) {
    reasons.push(`Hoher Übungsbedarf (Ø ${avgPracticeNeeded.toFixed(1)})`);
  }
  if (avgConfidence >= 3.6) {
    reasons.push(`Hohe Schwierigkeit (Ø ${avgConfidence.toFixed(1)})`);
  }
  for (const st of instrumentStats) {
    if (st.avgPracticeNeeded >= 3.8 || st.isFlaggedFocus) {
      reasons.push(
        `Probebedarf ${st.instrument}${
          st.voteCount > 0 ? ` (Ø ${st.avgPracticeNeeded.toFixed(1)})` : ""
        }`
      );
      break;
    }
  }
  if (daysSince === null) {
    reasons.push("Noch nie geprobt");
  } else if (daysSince >= 14) {
    reasons.push(`Vor ${daysSince} Tagen zuletzt geprobt`);
  }
  if (piece.difficulty === "HARD") {
    reasons.push("Schwierigkeit: Schwer");
  }
  if (reasons.length === 0) {
    reasons.push(`Übungsbedarf Ø ${avgPracticeNeeded.toFixed(1)}`);
  }

  return {
    avgLike: Math.round(avgLike * 10) / 10,
    avgConfidence: Math.round(avgConfidence * 10) / 10,
    avgPracticeNeeded: Math.round(avgPracticeNeeded * 10) / 10,
    priorityScore,
    priorityReasons: reasons,
    instrumentStats,
  };
}

/**
 * Checks whether a piece is eligible for a session given:
 * 1) presentSingers: if non-empty, only pieces sung by the present singers are eligible.
 * 2) absentSoloists: if non-empty, any piece that features one of the absent soloists is excluded.
 * 3) Register absence rule (e.g. Saxophones): excludes pieces that would be practiced primarily
 *    for the sake of an instrument/register section when too many players of that section are absent in this session.
 */
export function isPieceEligibleForSession(
  piece: {
    singers: string;
    soloists: string;
    focusInstruments?: string | null;
    votes?: {
      likeScore: number;
      confidenceScore: number;
      practiceNeededScore: number;
      user?: { instrument?: string | null } | null;
    }[];
  },
  presentSingersRaw: string,
  absentSoloistsRaw: string,
  sessionAttendanceContext?: {
    absentInstruments?: string | null;
    attendanceJson?: string | null;
  }
): { eligible: boolean; reason?: string } {
  const presentSingers = splitTags(presentSingersRaw).map((s) =>
    s.toLowerCase()
  );
  const absentSoloists = splitTags(absentSoloistsRaw).map((s) =>
    s.toLowerCase()
  );

  const pieceSingers = splitTags(piece.singers);
  const pieceSoloists = splitTags(piece.soloists);

  // 1. Check absent soloists
  if (absentSoloists.length > 0 && pieceSoloists.length > 0) {
    const missingSoloist = pieceSoloists.find((sol) =>
      absentSoloists.includes(sol.toLowerCase())
    );
    if (missingSoloist) {
      return {
        eligible: false,
        reason: `Solist abwesend: ${missingSoloist}`,
      };
    }
  }

  // 2. Check present singers
  if (presentSingers.length > 0) {
    if (pieceSingers.length === 0) {
      return {
        eligible: false,
        reason: "Kein Sänger zugewiesen (Filter aktiv)",
      };
    }
    const missingSinger = pieceSingers.find(
      (s) => !presentSingers.includes(s.toLowerCase())
    );
    if (missingSinger) {
      return {
        eligible: false,
        reason: `Sänger nicht als anwesend markiert: ${missingSinger}`,
      };
    }
  }

  // 3. Check register absence rule:
  // Exclude pieces that would be practiced only for the sake of an understaffed register (e.g. Saxophones)
  if (sessionAttendanceContext) {
    const understaffedList = getUnderstaffedRegistersForSession(
      sessionAttendanceContext.absentInstruments,
      sessionAttendanceContext.attendanceJson
    );

    if (understaffedList.length > 0) {
      const understaffedLower = new Set(
        understaffedList.map((u) => u.toLowerCase())
      );

      const matchesUnderstaffed = (instOrTag: string): string | null => {
        const clean = (instOrTag || "").trim();
        if (!clean) return null;
        const lower = clean.toLowerCase();
        const fam = getRegisterFamily(clean);
        const famLower = fam.toLowerCase();

        if (understaffedLower.has(lower)) return clean;
        if (fam && understaffedLower.has(famLower)) return fam;
        return null;
      };

      const focusTags = splitTags(piece.focusInstruments || "");
      const matchedFocusRegisters: string[] = [];
      const nonMatchedFocusRegisters: string[] = [];

      for (const ft of focusTags) {
        const m = matchesUnderstaffed(ft);
        if (m) matchedFocusRegisters.push(m);
        else nonMatchedFocusRegisters.push(ft);
      }

      const votes = piece.votes || [];
      const understaffedVotes: typeof votes = [];
      const presentRegisterVotes: typeof votes = [];
      let triggeredRegisterLabel = matchedFocusRegisters[0] || "";

      for (const v of votes) {
        const inst = (v.user?.instrument || "").trim();
        const matched = inst ? matchesUnderstaffed(inst) : null;
        if (matched) {
          understaffedVotes.push(v);
          if (!triggeredRegisterLabel) triggeredRegisterLabel = matched;
        } else {
          presentRegisterVotes.push(v);
        }
      }

      const understaffedAvgPractice =
        understaffedVotes.length > 0
          ? understaffedVotes.reduce(
              (acc, v) => acc + v.practiceNeededScore,
              0
            ) / understaffedVotes.length
          : 0;
      const understaffedAvgDiff =
        understaffedVotes.length > 0
          ? understaffedVotes.reduce((acc, v) => acc + v.confidenceScore, 0) /
            understaffedVotes.length
          : 0;

      const presentAvgPractice =
        presentRegisterVotes.length > 0
          ? presentRegisterVotes.reduce(
              (acc, v) => acc + v.practiceNeededScore,
              0
            ) / presentRegisterVotes.length
          : 0;
      const presentAvgDiff =
        presentRegisterVotes.length > 0
          ? presentRegisterVotes.reduce(
              (acc, v) => acc + v.confidenceScore,
              0
            ) / presentRegisterVotes.length
          : 0;

      const understaffedNeedsIt =
        matchedFocusRegisters.length > 0 ||
        understaffedAvgPractice >= 3.6 ||
        understaffedAvgDiff >= 3.8;

      const restOfBandDoesNotNeedItUrgently =
        nonMatchedFocusRegisters.length === 0 &&
        (presentRegisterVotes.length === 0 ||
          (presentAvgPractice < 3.4 && presentAvgDiff < 3.6));

      if (understaffedNeedsIt && restOfBandDoesNotNeedItUrgently) {
        const regName = triggeredRegisterLabel || understaffedList[0];
        return {
          eligible: false,
          reason: `Ausgeschlossen: Probebedarf hauptsächlich für ${regName} (zu viele ${regName}-Spieler in dieser Probe abwesend)`,
        };
      }
    }
  }

  return { eligible: true };
}

/**
 * Synchronizes and recalculates unlocked PLANNED rehearsal sessions.
 */
export async function recalculateSchedule(options?: {
  forceSessionId?: string;
}): Promise<void> {
  let config = await prisma.rehearsalConfig.findUnique({
    where: { id: "default" },
  });
  if (!config) {
    config = await prisma.rehearsalConfig.create({
      data: {
        id: "default",
        planningMode: "SIMPLE_COUNT",
        totalSessionsLeft: 4,
        piecesPerSession: 6,
      },
    });
  }

  const allSessions = await prisma.rehearsalSession.findMany({
    include: { pieces: { orderBy: { sortOrder: "asc" } } },
    orderBy: [{ sessionNumber: "asc" }, { createdAt: "asc" }],
  });

  const nonCompleted = allSessions.filter((s) => s.status !== "COMPLETED");

  if (config.planningMode === "SIMPLE_COUNT" && !options?.forceSessionId) {
    const targetCount = Math.max(1, config.totalSessionsLeft);
    if (nonCompleted.length < targetCount) {
      const maxNum =
        allSessions.length > 0
          ? Math.max(...allSessions.map((s) => s.sessionNumber))
          : 0;
      const toCreate = targetCount - nonCompleted.length;
      for (let i = 1; i <= toCreate; i++) {
        await prisma.rehearsalSession.create({
          data: {
            sessionNumber: maxNum + i,
            title: `Probe ${maxNum + i}`,
            status: "PLANNED",
          },
        });
      }
    } else if (nonCompleted.length > targetCount) {
      const removable = nonCompleted
        .filter((s) => s.status === "PLANNED" && !s.isLocked)
        .reverse();
      const excess = nonCompleted.length - targetCount;
      for (let i = 0; i < Math.min(excess, removable.length); i++) {
        await prisma.rehearsalSession.delete({
          where: { id: removable[i].id },
        });
      }
    }
  }

  if (config.planningMode === "MANUAL" && !options?.forceSessionId) {
    await savePersistentSnapshot();
    return;
  }

  const updatedSessions = await prisma.rehearsalSession.findMany({
    include: { pieces: { orderBy: { sortOrder: "asc" } } },
    orderBy: [{ scheduledDate: "asc" }, { sessionNumber: "asc" }],
  });

  const allPieces = await prisma.piece.findMany({
    include: {
      votes: {
        include: {
          user: { select: { id: true, name: true, instrument: true } },
        },
      },
    },
  });

  if (allPieces.length === 0) {
    await savePersistentSnapshot();
    return;
  }

  const simulatedDays = new Map<string, number | undefined>();
  for (const p of allPieces) {
    if (p.lastPracticedAt) {
      const diffMs = Date.now() - new Date(p.lastPracticedAt).getTime();
      simulatedDays.set(
        p.id,
        Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
      );
    } else {
      simulatedDays.set(p.id, undefined);
    }
  }

  for (const session of updatedSessions) {
    if (session.status === "COMPLETED") continue;

    for (const [pieceId, days] of simulatedDays.entries()) {
      if (typeof days === "number") {
        simulatedDays.set(pieceId, days + 7);
      }
    }

    const shouldRecalculateThisSession =
      options?.forceSessionId === session.id ||
      (!options?.forceSessionId &&
        session.status === "PLANNED" &&
        !session.isLocked);

    if (!shouldRecalculateThisSession) {
      for (const sp of session.pieces) {
        simulatedDays.set(sp.pieceId, 0);
      }
      continue;
    }

    const prevMetaByPieceId = new Map<
      string,
      {
        estimatedMinutes: number;
        sessionBpm: number;
        sessionBpmComment: string;
      }
    >();
    for (const sp of session.pieces) {
      prevMetaByPieceId.set(sp.pieceId, {
        estimatedMinutes: sp.estimatedMinutes || 0,
        sessionBpm: sp.sessionBpm || 0,
        sessionBpmComment: sp.sessionBpmComment || "",
      });
    }

    const eligiblePieces = allPieces.filter(
      (p) =>
        isPieceEligibleForSession(
          p,
          session.presentSingers,
          session.absentSoloists,
          {
            absentInstruments: session.absentInstruments,
            attendanceJson: session.attendanceJson,
          }
        ).eligible
    );

    const scored = eligiblePieces
      .map((p) => {
        const calc = calculatePiecePriority(p, simulatedDays.get(p.id));
        return {
          piece: p,
          score: calc.priorityScore,
        };
      })
      .sort((a, b) => b.score - a.score);

    const selected = scored.slice(0, Math.max(1, config.piecesPerSession));

    await prisma.rehearsalSessionPiece.deleteMany({
      where: { sessionId: session.id },
    });

    for (let idx = 0; idx < selected.length; idx++) {
      const item = selected[idx];
      const prev = prevMetaByPieceId.get(item.piece.id);
      await prisma.rehearsalSessionPiece.create({
        data: {
          sessionId: session.id,
          pieceId: item.piece.id,
          sortOrder: idx + 1,
          isManualOverride: false,
          estimatedMinutes: prev?.estimatedMinutes ?? 0,
          sessionBpm: prev?.sessionBpm ?? 0,
          sessionBpmComment: prev?.sessionBpmComment ?? "",
        },
      });
      simulatedDays.set(item.piece.id, 0);
    }
  }

  await savePersistentSnapshot();
}
