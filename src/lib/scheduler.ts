import { prisma, savePersistentSnapshot } from "./prisma";

export interface EnrichedPiece {
  id: string;
  title: string;
  artist: string;
  singers: string;
  singerList: string[];
  soloists: string;
  soloistList: string[];
  songType: string;
  difficulty: string;
  notes: string;
  lastPracticedAt: string | null;
  createdBy: string;
  createdAt: string;
  voteCount: number;
  avgLike: number;
  avgConfidence: number;
  avgPracticeNeeded: number;
  priorityScore: number;
  priorityReasons: string[];
}

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

/**
 * Computes the urgency/priority score S(p) for a piece and human-readable German reasons.
 */
export function calculatePiecePriority(
  piece: {
    difficulty: string;
    lastPracticedAt: Date | null;
    votes: {
      likeScore: number;
      confidenceScore: number;
      practiceNeededScore: number;
    }[];
  },
  simulatedDaysSincePractice?: number
): {
  avgLike: number;
  avgConfidence: number;
  avgPracticeNeeded: number;
  priorityScore: number;
  priorityReasons: string[];
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

  let timeFactor = 5.0; // Never practiced = maximum urgency 5.0
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

  // S(p) = 3.0 * avgPracticeNeeded + 2.5 * avgConfidence (Schwierigkeit 1-5) + 2.0 * timeFactor + 1.0 * diffBonus
  const rawScore =
    3.0 * avgPracticeNeeded +
    2.5 * avgConfidence +
    2.0 * timeFactor +
    1.0 * diffBonus;

  const priorityScore = Math.round(rawScore * 10) / 10;

  const reasons: string[] = [];
  if (avgPracticeNeeded >= 3.8) {
    reasons.push(`Hoher Übungsbedarf (Ø ${avgPracticeNeeded.toFixed(1)})`);
  }
  if (avgConfidence >= 3.6) {
    reasons.push(`Hohe Schwierigkeit (Ø ${avgConfidence.toFixed(1)})`);
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
  };
}

/**
 * Checks whether a piece is eligible for a session given:
 * 1) presentSingers: if non-empty, only pieces sung by the present singers are eligible.
 *    (Specifically: a piece must have singers and every singer of the piece must be in presentSingers)
 * 2) absentSoloists: if non-empty, any piece that features one of the absent soloists is excluded.
 */
export function isPieceEligibleForSession(
  piece: { singers: string; soloists: string },
  presentSingersRaw: string,
  absentSoloistsRaw: string
): { eligible: boolean; reason?: string } {
  const presentSingers = splitTags(presentSingersRaw).map((s) =>
    s.toLowerCase()
  );
  const absentSoloists = splitTags(absentSoloistsRaw).map((s) =>
    s.toLowerCase()
  );

  const pieceSingers = splitTags(piece.singers);
  const pieceSoloists = splitTags(piece.soloists);

  // Check absent soloists first: exclude if any soloist of the piece is marked absent
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

  // Check present singers: when presentSingers is specified on a session,
  // only pieces sung by those present singers are scheduled
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

  return { eligible: true };
}

/**
 * Synchronizes and recalculates unlocked PLANNED rehearsal sessions.
 * Locked sessions (isLocked = true), ACTIVE sessions, and COMPLETED sessions are preserved untouched.
 * If planningMode === 'MANUAL', no automatic overwriting happens unless forceSessionId is specified.
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

  // In SIMPLE_COUNT mode, ensure the number of non-completed sessions matches config.totalSessionsLeft
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
      // Only remove unlocked PLANNED sessions from the end
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

  // If global mode is MANUAL and we are not forcing a specific session's auto-fill, stop here
  if (config.planningMode === "MANUAL" && !options?.forceSessionId) {
    await savePersistentSnapshot();
    return;
  }

  const updatedSessions = await prisma.rehearsalSession.findMany({
    include: { pieces: { orderBy: { sortOrder: "asc" } } },
    orderBy: [{ scheduledDate: "asc" }, { sessionNumber: "asc" }],
  });

  const allPieces = await prisma.piece.findMany({
    include: { votes: true },
  });

  if (allPieces.length === 0) {
    await savePersistentSnapshot();
    return;
  }

  // Track simulated days since practice across sessions so pieces rotate evenly across Probe 1..N
  const simulatedDays = new Map<string, number | undefined>();
  for (const p of allPieces) {
    if (p.lastPracticedAt) {
      const diffMs = Date.now() - new Date(p.lastPracticedAt).getTime();
      simulatedDays.set(
        p.id,
        Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
      );
    } else {
      simulatedDays.set(p.id, undefined); // never practiced
    }
  }

  for (const session of updatedSessions) {
    if (session.status === "COMPLETED") continue;

    // Advance simulated time by 7 days per upcoming session
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
      // Even if locked or ACTIVE, mark its already-assigned pieces as "just practiced" for subsequent sessions
      for (const sp of session.pieces) {
        simulatedDays.set(sp.pieceId, 0);
      }
      continue;
    }

    // Filter eligible pieces for this session based on presentSingers & absentSoloists
    const eligiblePieces = allPieces.filter(
      (p) =>
        isPieceEligibleForSession(
          p,
          session.presentSingers,
          session.absentSoloists
        ).eligible
    );

    // Score each eligible piece with current simulatedDays
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

    // Replace session pieces for this unlocked/forced session
    await prisma.rehearsalSessionPiece.deleteMany({
      where: { sessionId: session.id },
    });

    for (let idx = 0; idx < selected.length; idx++) {
      const item = selected[idx];
      await prisma.rehearsalSessionPiece.create({
        data: {
          sessionId: session.id,
          pieceId: item.piece.id,
          sortOrder: idx + 1,
          isManualOverride: false,
        },
      });
      // Reset simulated days so next session prefers other unpracticed pieces
      simulatedDays.set(item.piece.id, 0);
    }
  }

  await savePersistentSnapshot();
}

