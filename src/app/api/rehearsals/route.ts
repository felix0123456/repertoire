import { NextRequest, NextResponse } from "next/server";
import {
  ensurePersistentDataLoaded,
  prisma,
  savePersistentSnapshot,
} from "@/lib/prisma";
import {
  calculatePiecePriority,
  isPieceEligibleForSession,
  normalizeTags,
  recalculateSchedule,
  splitTags,
} from "@/lib/scheduler";

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
              include: { votes: true },
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

    const formattedSessions = sessions.map((s) => {
      const presentSingerList = splitTags(s.presentSingers);
      const absentSoloistList = splitTags(s.absentSoloists);

      const enrichedPieces = s.pieces.map((sp) => {
        const stats = calculatePiecePriority(sp.piece);
        const eligibility = isPieceEligibleForSession(
          sp.piece,
          s.presentSingers,
          s.absentSoloists
        );
        return {
          id: sp.id,
          pieceId: sp.pieceId,
          sortOrder: sp.sortOrder,
          isManualOverride: sp.isManualOverride,
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
            notes: sp.piece.notes,
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
        isLocked: s.isLocked,
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
          isLocked: isManual,
        },
      });

      // Update totalSessionsLeft count to reflect active/planned sessions
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
      // Unlock all PLANNED sessions if user explicitly requests full recalculation
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

