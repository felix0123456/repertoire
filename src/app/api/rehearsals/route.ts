import { NextRequest, NextResponse } from "next/server";
import {
  ensurePersistentDataLoaded,
  prisma,
  savePersistentSnapshot,
} from "@/lib/prisma";
import {
  calculatePiecePriority,
  getEffectivePieceMinutes,
  getUnderstaffedRegistersForSession,
  isPieceEligibleForSession,
  normalizeTags,
  parseMeasureNotes,
  parseSessionAttendance,
  recalculateSchedule,
  splitTags,
} from "@/lib/scheduler";
import { ConcertSetBlock } from "@/types";

function parseConcertSetlist(
  rawJson: string | null | undefined
): ConcertSetBlock[] {
  if (!rawJson) return [];
  try {
    const parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    await ensurePersistentDataLoaded();
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
      await recalculateSchedule();
    }

    const sessions = await prisma.rehearsalSession.findMany({
      include: {
        pieces: {
          include: {
            piece: {
              include: {
                votes: {
                  include: {
                    user: { select: { id: true, name: true, instrument: true } },
                  },
                },
              },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
        logs: {
          include: {
            user: { select: { id: true, name: true } },
            piece: { select: { id: true, title: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ sessionNumber: "asc" }, { createdAt: "asc" }],
    });

    const concerts = await prisma.concertEvent.findMany({
      orderBy: [{ scheduledDate: "asc" }, { createdAt: "asc" }],
    });

    // Track latest recorded session BPM per piece across sessions in chronological order
    const lastBpmByPiece = new Map<
      string,
      { bpm: number; comment: string }
    >();

    const formattedSessions = sessions.map((s) => {
      const presentSingerList = splitTags(s.presentSingers);
      const absentSoloistList = splitTags(s.absentSoloists);
      const absentInstrumentList = splitTags(s.absentInstruments);
      const attendance = parseSessionAttendance(s.attendanceJson);
      const understaffedRegisterList = getUnderstaffedRegistersForSession(
        s.absentInstruments,
        s.attendanceJson
      );

      let piecesMinutesSum = 0;

      const enrichedPieces = s.pieces.map((sp) => {
        const stats = calculatePiecePriority(sp.piece);
        const eligibility = isPieceEligibleForSession(
          sp.piece,
          s.presentSingers,
          s.absentSoloists,
          {
            absentInstruments: s.absentInstruments,
            attendanceJson: s.attendanceJson,
          }
        );

        const effectiveMinutes = getEffectivePieceMinutes(
          sp.estimatedMinutes,
          stats.avgPracticeNeeded,
          stats.avgConfidence,
          sp.piece.difficulty
        );
        piecesMinutesSum += effectiveMinutes;

        const prevBpmEntry = lastBpmByPiece.get(sp.pieceId);
        const lastSessionBpm = prevBpmEntry?.bpm || 0;
        const lastSessionBpmComment = prevBpmEntry?.comment || "";

        if (sp.sessionBpm > 0 || (sp.sessionBpmComment || "").trim()) {
          lastBpmByPiece.set(sp.pieceId, {
            bpm: sp.sessionBpm || prevBpmEntry?.bpm || 0,
            comment: (sp.sessionBpmComment || "").trim(),
          });
        }

        return {
          id: sp.id,
          pieceId: sp.pieceId,
          sortOrder: sp.sortOrder,
          isManualOverride: sp.isManualOverride,
          estimatedMinutes: sp.estimatedMinutes || 0,
          effectiveMinutes,
          sessionBpm: sp.sessionBpm || 0,
          sessionBpmComment: sp.sessionBpmComment || "",
          lastSessionBpm,
          lastSessionBpmComment,
          eligible: eligibility.eligible,
          ineligibleReason: eligibility.reason || null,
          piece: {
            id: sp.piece.id,
            title: sp.piece.title,
            folderNumber: sp.piece.folderNumber,
            artist: sp.piece.artist,
            singers: sp.piece.singers,
            singerList: splitTags(sp.piece.singers),
            soloists: sp.piece.soloists,
            soloistList: splitTags(sp.piece.soloists),
            songType: sp.piece.songType,
            difficulty: sp.piece.difficulty,
            bpm: sp.piece.bpm || 0,
            notes: sp.piece.notes,
            referenceUrl: sp.piece.referenceUrl || "",
            focusInstruments: sp.piece.focusInstruments || "",
            focusInstrumentList: splitTags(sp.piece.focusInstruments),
            measureNotes: parseMeasureNotes(sp.piece.measureNotesJson),
            instrumentStats: stats.instrumentStats,
            lastPracticedAt: sp.piece.lastPracticedAt
              ? sp.piece.lastPracticedAt.toISOString()
              : null,
            avgLike: stats.avgLike,
            avgConfidence: stats.avgConfidence,
            avgPracticeNeeded: stats.avgPracticeNeeded,
            priorityScore: stats.priorityScore,
            priorityReasons: stats.priorityReasons,
          },
        };
      });

      const breakMins = s.hasBreak ? Math.max(5, s.breakDurationMinutes || 15) : 0;
      const totalEstimatedMinutes = piecesMinutesSum + breakMins;

      return {
        id: s.id,
        sessionNumber: s.sessionNumber,
        title: s.title,
        status: s.status,
        scheduledDate: s.scheduledDate ? s.scheduledDate.toISOString() : null,
        location: s.location,
        additionalInfo: s.additionalInfo,
        presentSingers: s.presentSingers,
        presentSingerList,
        absentSoloists: s.absentSoloists,
        absentSoloistList,
        absentInstruments: s.absentInstruments || "",
        absentInstrumentList,
        understaffedRegisterList,
        isLocked: s.isLocked,
        hasBreak: Boolean(s.hasBreak),
        breakDurationMinutes: s.breakDurationMinutes || 15,
        breakAfterPieceIndex: s.breakAfterPieceIndex || 3,
        attendance,
        konzertmeisterId: s.konzertmeisterId || "",
        totalEstimatedMinutes,
        completedAt: s.completedAt ? s.completedAt.toISOString() : null,
        pieces: enrichedPieces,
        logs: s.logs.map((l) => ({
          id: l.id,
          pieceId: l.pieceId,
          pieceTitle: l.piece.title,
          userId: l.userId,
          userName: l.user.name,
          prevConfidence: l.prevConfidence,
          newConfidence: l.newConfidence,
          prevPracticeNeeded: l.prevPracticeNeeded,
          newPracticeNeeded: l.newPracticeNeeded,
          comment: l.comment,
          createdAt: l.createdAt.toISOString(),
        })),
      };
    });

    return NextResponse.json({
      config,
      sessions: formattedSessions,
      concerts: concerts.map((c) => ({
        id: c.id,
        title: c.title,
        scheduledDate: c.scheduledDate ? c.scheduledDate.toISOString() : null,
        location: c.location,
        additionalInfo: c.additionalInfo,
        setlist: parseConcertSetlist(c.setlistJson),
        konzertmeisterId: c.konzertmeisterId || "",
      })),
    });
  } catch (error) {
    console.error("Error in GET /api/rehearsals:", error);
    return NextResponse.json(
      { error: "Fehler beim Laden des Probeplans." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || "update-config";

    if (action === "update-config") {
      const planningMode = ["SIMPLE_COUNT", "EXACT_DATES", "MANUAL"].includes(
        body.planningMode
      )
        ? body.planningMode
        : "SIMPLE_COUNT";
      const totalSessionsLeft = Math.max(
        1,
        Math.min(50, Number(body.totalSessionsLeft) || 4)
      );
      const piecesPerSession = Math.max(
        1,
        Math.min(30, Number(body.piecesPerSession) || 6)
      );

      const config = await prisma.rehearsalConfig.upsert({
        where: { id: "default" },
        update: {
          planningMode,
          totalSessionsLeft,
          piecesPerSession,
        },
        create: {
          id: "default",
          planningMode,
          totalSessionsLeft,
          piecesPerSession,
        },
      });

      await recalculateSchedule();
      await savePersistentSnapshot();
      return NextResponse.json({ config });
    }

    if (action === "create-session") {
      const existing = await prisma.rehearsalSession.findMany();
      const nextNum =
        existing.length > 0
          ? Math.max(...existing.map((s) => s.sessionNumber)) + 1
          : 1;

      const isManual = Boolean(body.isLocked);
      const session = await prisma.rehearsalSession.create({
        data: {
          sessionNumber: nextNum,
          title: (body.title || `Probe ${nextNum}`).trim(),
          status: "PLANNED",
          scheduledDate: body.scheduledDate
            ? new Date(body.scheduledDate)
            : null,
          location: (body.location || "").trim(),
          additionalInfo: (body.additionalInfo || "").trim(),
          presentSingers: normalizeTags(body.presentSingers || ""),
          absentSoloists: normalizeTags(body.absentSoloists || ""),
          absentInstruments: normalizeTags(body.absentInstruments || ""),
          hasBreak: Boolean(body.hasBreak),
          breakDurationMinutes: Math.max(
            5,
            Math.min(60, Number(body.breakDurationMinutes) || 15)
          ),
          breakAfterPieceIndex: Math.max(
            1,
            Number(body.breakAfterPieceIndex) || 3
          ),
          isLocked: isManual,
        },
      });

      const nonCompletedCount = await prisma.rehearsalSession.count({
        where: { status: { not: "COMPLETED" } },
      });
      await prisma.rehearsalConfig.upsert({
        where: { id: "default" },
        update: { totalSessionsLeft: nonCompletedCount },
        create: {
          id: "default",
          planningMode: "EXACT_DATES",
          totalSessionsLeft: nonCompletedCount,
          piecesPerSession: 6,
        },
      });

      if (!isManual) {
        await recalculateSchedule({ forceSessionId: session.id });
      } else {
        await savePersistentSnapshot();
      }

      return NextResponse.json({ session });
    }

    if (action === "recalculate-all") {
      if (body.unlockAll) {
        await prisma.rehearsalSession.updateMany({
          where: { status: "PLANNED" },
          data: { isLocked: false },
        });
      }
      await recalculateSchedule();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unbekannte Aktion." }, { status: 400 });
  } catch (error) {
    console.error("Error in POST /api/rehearsals:", error);
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren des Probeplans." },
      { status: 500 }
    );
  }
}
