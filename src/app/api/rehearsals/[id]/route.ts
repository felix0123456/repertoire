import { NextRequest, NextResponse } from "next/server";
import { prisma, savePersistentSnapshot } from "@/lib/prisma";
import {
  calculatePiecePriority,
  isPieceEligibleForSession,
  normalizeTags,
  recalculateSchedule,
} from "@/lib/scheduler";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const action = body.action || "update-meta";

    const session = await prisma.rehearsalSession.findUnique({
      where: { id },
      include: {
        pieces: { orderBy: { sortOrder: "asc" } },
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Probe wurde nicht gefunden." },
        { status: 404 }
      );
    }

    if (action === "update-meta") {
      const data: Record<string, unknown> = {};
      if (typeof body.title === "string" && body.title.trim()) {
        data.title = body.title.trim();
      }
      if (body.scheduledDate !== undefined) {
        data.scheduledDate = body.scheduledDate
          ? new Date(body.scheduledDate)
          : null;
      }
      if (typeof body.location === "string") {
        data.location = body.location.trim();
      }
      if (typeof body.additionalInfo === "string") {
        data.additionalInfo = body.additionalInfo.trim();
      }
      let filtersChanged = false;
      if (
        typeof body.presentSingers === "string" ||
        Array.isArray(body.presentSingers)
      ) {
        const normalized = normalizeTags(body.presentSingers);
        if (normalized !== session.presentSingers) filtersChanged = true;
        data.presentSingers = normalized;
      }
      if (
        typeof body.absentSoloists === "string" ||
        Array.isArray(body.absentSoloists)
      ) {
        const normalized = normalizeTags(body.absentSoloists);
        if (normalized !== session.absentSoloists) filtersChanged = true;
        data.absentSoloists = normalized;
      }
      if (
        typeof body.absentInstruments === "string" ||
        Array.isArray(body.absentInstruments)
      ) {
        const normalized = normalizeTags(body.absentInstruments);
        if (normalized !== session.absentInstruments) filtersChanged = true;
        data.absentInstruments = normalized;

        if (session.attendanceJson && session.attendanceJson !== "[]") {
          try {
            const parsedAtt = JSON.parse(session.attendanceJson);
            if (Array.isArray(parsedAtt) && parsedAtt.length > 0) {
              parsedAtt[0] = {
                ...parsedAtt[0],
                manualRegisterOverride: true,
              };
              data.attendanceJson = JSON.stringify(parsedAtt);
              filtersChanged = true;
            }
          } catch {
            // ignore json parse error
          }
        }
      }
      if (typeof body.isLocked === "boolean") {
        data.isLocked = body.isLocked;
      }
      if (typeof body.hasBreak === "boolean") {
        data.hasBreak = body.hasBreak;
      }
      if (body.breakDurationMinutes !== undefined) {
        data.breakDurationMinutes = Math.max(
          5,
          Math.min(60, Math.round(Number(body.breakDurationMinutes) || 15))
        );
      }
      if (body.breakAfterPieceIndex !== undefined) {
        data.breakAfterPieceIndex = Math.max(
          1,
          Math.min(30, Math.round(Number(body.breakAfterPieceIndex) || 3))
        );
      }

      const updated = await prisma.rehearsalSession.update({
        where: { id },
        data,
      });

      if (filtersChanged && !updated.isLocked && updated.status === "PLANNED") {
        await recalculateSchedule({ forceSessionId: id });
      } else {
        await savePersistentSnapshot();
      }

      return NextResponse.json({ session: updated });
    }

    if (action === "update-break") {
      const data: Record<string, unknown> = {};
      if (typeof body.hasBreak === "boolean") {
        data.hasBreak = body.hasBreak;
      }
      if (body.breakDurationMinutes !== undefined) {
        data.breakDurationMinutes = Math.max(
          5,
          Math.min(60, Math.round(Number(body.breakDurationMinutes) || 15))
        );
      }
      if (body.breakAfterPieceIndex !== undefined) {
        data.breakAfterPieceIndex = Math.max(
          1,
          Math.min(30, Math.round(Number(body.breakAfterPieceIndex) || 3))
        );
      }
      const updated = await prisma.rehearsalSession.update({
        where: { id },
        data,
      });
      await savePersistentSnapshot();
      return NextResponse.json({ session: updated });
    }

    if (action === "update-piece-duration") {
      const { pieceId, estimatedMinutes } = body;
      if (!pieceId) {
        return NextResponse.json(
          { error: "pieceId ist erforderlich." },
          { status: 400 }
        );
      }
      const mins = Math.max(0, Math.min(90, Math.round(Number(estimatedMinutes) || 0)));
      await prisma.rehearsalSessionPiece.updateMany({
        where: { sessionId: id, pieceId },
        data: { estimatedMinutes: mins },
      });
      await savePersistentSnapshot();
      return NextResponse.json({ success: true });
    }

    if (action === "update-piece-bpm") {
      const { pieceId, sessionBpm, sessionBpmComment, updatePieceTargetBpm } =
        body;
      if (!pieceId) {
        return NextResponse.json(
          { error: "pieceId ist erforderlich." },
          { status: 400 }
        );
      }
      const bpmVal = Math.max(
        0,
        Math.min(400, Math.round(Number(sessionBpm) || 0))
      );
      const commentVal =
        typeof sessionBpmComment === "string"
          ? sessionBpmComment.trim()
          : undefined;

      const updateData: Record<string, unknown> = {
        sessionBpm: bpmVal,
      };
      if (commentVal !== undefined) {
        updateData.sessionBpmComment = commentVal;
      }

      await prisma.rehearsalSessionPiece.updateMany({
        where: { sessionId: id, pieceId },
        data: updateData,
      });

      if (updatePieceTargetBpm && bpmVal > 0) {
        await prisma.piece.update({
          where: { id: pieceId },
          data: { bpm: bpmVal },
        });
      }

      await savePersistentSnapshot();
      return NextResponse.json({ success: true });
    }

    if (action === "toggle-lock") {
      const updated = await prisma.rehearsalSession.update({
        where: { id },
        data: { isLocked: !session.isLocked },
      });
      await savePersistentSnapshot();
      return NextResponse.json({ session: updated });
    }

    if (action === "auto-fill") {
      await prisma.rehearsalSession.update({
        where: { id },
        data: { isLocked: false },
      });
      await recalculateSchedule({ forceSessionId: id });
      return NextResponse.json({ success: true });
    }

    if (action === "clear-pieces") {
      await prisma.rehearsalSessionPiece.deleteMany({
        where: { sessionId: id },
      });
      await prisma.rehearsalSession.update({
        where: { id },
        data: { isLocked: true },
      });
      await savePersistentSnapshot();
      return NextResponse.json({ success: true });
    }

    if (action === "add-piece") {
      const { pieceId } = body;
      if (!pieceId) {
        return NextResponse.json(
          { error: "Bitte wähle ein Stück aus." },
          { status: 400 }
        );
      }

      const alreadyIn = session.pieces.find((p) => p.pieceId === pieceId);
      if (alreadyIn) {
        return NextResponse.json(
          { error: "Dieses Stück ist bereits in dieser Probe enthalten." },
          { status: 400 }
        );
      }

      const maxOrder =
        session.pieces.length > 0
          ? Math.max(...session.pieces.map((p) => p.sortOrder))
          : 0;

      await prisma.rehearsalSessionPiece.create({
        data: {
          sessionId: id,
          pieceId,
          sortOrder: maxOrder + 1,
          isManualOverride: true,
        },
      });

      await prisma.rehearsalSession.update({
        where: { id },
        data: { isLocked: true },
      });

      await savePersistentSnapshot();
      return NextResponse.json({ success: true });
    }

    if (action === "remove-piece") {
      const { pieceId } = body;
      await prisma.rehearsalSessionPiece.deleteMany({
        where: { sessionId: id, pieceId },
      });

      const remaining = await prisma.rehearsalSessionPiece.findMany({
        where: { sessionId: id },
        orderBy: { sortOrder: "asc" },
      });
      for (let i = 0; i < remaining.length; i++) {
        await prisma.rehearsalSessionPiece.update({
          where: { id: remaining[i].id },
          data: { sortOrder: i + 1 },
        });
      }

      await prisma.rehearsalSession.update({
        where: { id },
        data: { isLocked: true },
      });

      await savePersistentSnapshot();
      return NextResponse.json({ success: true });
    }

    if (action === "reorder-pieces") {
      const pieceIds: string[] = Array.isArray(body.pieceIds)
        ? body.pieceIds
        : [];

      for (let i = 0; i < pieceIds.length; i++) {
        await prisma.rehearsalSessionPiece.updateMany({
          where: { sessionId: id, pieceId: pieceIds[i] },
          data: { sortOrder: i + 1, isManualOverride: true },
        });
      }

      await prisma.rehearsalSession.update({
        where: { id },
        data: { isLocked: true },
      });

      await savePersistentSnapshot();
      return NextResponse.json({ success: true });
    }

    if (action === "pull-next") {
      const currentPieceIds = new Set(session.pieces.map((p) => p.pieceId));
      const allPieces = await prisma.piece.findMany({
        include: {
          votes: {
            include: {
              user: { select: { id: true, name: true, instrument: true } },
            },
          },
        },
      });

      const candidates = allPieces
        .filter((p) => !currentPieceIds.has(p.id))
        .filter(
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
        )
        .map((p) => ({
          piece: p,
          score: calculatePiecePriority(p).priorityScore,
        }))
        .sort((a, b) => b.score - a.score);

      if (candidates.length === 0) {
        return NextResponse.json(
          {
            error:
              "Kein weiteres passendes Stück verfügbar (evtl. wegen Sänger-/Solisten-/Register-Filter oder alle Stücke sind bereits in der Probe).",
          },
          { status: 400 }
        );
      }

      const best = candidates[0].piece;
      const maxOrder =
        session.pieces.length > 0
          ? Math.max(...session.pieces.map((p) => p.sortOrder))
          : 0;

      await prisma.rehearsalSessionPiece.create({
        data: {
          sessionId: id,
          pieceId: best.id,
          sortOrder: maxOrder + 1,
          isManualOverride: true,
        },
      });

      await recalculateSchedule();
      await savePersistentSnapshot();

      return NextResponse.json({ pulledPiece: best });
    }

    if (action === "start") {
      const updated = await prisma.rehearsalSession.update({
        where: { id },
        data: { status: "ACTIVE" },
      });
      await savePersistentSnapshot();
      return NextResponse.json({ session: updated });
    }

    if (action === "reopen") {
      const updated = await prisma.rehearsalSession.update({
        where: { id },
        data: { status: "PLANNED", completedAt: null },
      });
      await savePersistentSnapshot();
      return NextResponse.json({ session: updated });
    }

    if (action === "complete") {
      const now = new Date();
      await prisma.rehearsalSession.update({
        where: { id },
        data: {
          status: "COMPLETED",
          completedAt: now,
        },
      });

      const pieceIds = session.pieces.map((p) => p.pieceId);
      if (pieceIds.length > 0) {
        await prisma.piece.updateMany({
          where: { id: { in: pieceIds } },
          data: { lastPracticedAt: now },
        });
      }

      const remainingCount = await prisma.rehearsalSession.count({
        where: { status: { not: "COMPLETED" } },
      });
      await prisma.rehearsalConfig.updateMany({
        where: { id: "default" },
        data: { totalSessionsLeft: Math.max(1, remainingCount) },
      });

      await recalculateSchedule();
      await savePersistentSnapshot();
      return NextResponse.json({ success: true });
    }

    if (action === "log-piece") {
      const { userId, pieceId, comment, sessionBpm, sessionBpmComment } = body;
      if (!userId || !pieceId) {
        return NextResponse.json(
          { error: "Spieler und Stück sind erforderlich." },
          { status: 400 }
        );
      }

      const newConfidence = Math.max(
        1,
        Math.min(5, Math.round(Number(body.newConfidence) || 3))
      );
      const newPracticeNeeded = Math.max(
        1,
        Math.min(5, Math.round(Number(body.newPracticeNeeded) || 3))
      );

      const existingVote = await prisma.pieceVote.findUnique({
        where: {
          userId_pieceId: { userId, pieceId },
        },
      });

      const prevConfidence = existingVote?.confidenceScore ?? 3;
      const prevPracticeNeeded = existingVote?.practiceNeededScore ?? 3;
      const likeScore =
        body.likeScore !== undefined
          ? Math.max(1, Math.min(5, Math.round(Number(body.likeScore))))
          : existingVote?.likeScore ?? 3;

      await prisma.pieceVote.upsert({
        where: {
          userId_pieceId: { userId, pieceId },
        },
        update: {
          likeScore,
          confidenceScore: newConfidence,
          practiceNeededScore: newPracticeNeeded,
        },
        create: {
          userId,
          pieceId,
          likeScore,
          confidenceScore: newConfidence,
          practiceNeededScore: newPracticeNeeded,
        },
      });

      if (sessionBpm !== undefined || sessionBpmComment !== undefined) {
        const bpmUpdate: Record<string, unknown> = {};
        if (sessionBpm !== undefined) {
          bpmUpdate.sessionBpm = Math.max(
            0,
            Math.min(400, Math.round(Number(sessionBpm) || 0))
          );
        }
        if (typeof sessionBpmComment === "string") {
          bpmUpdate.sessionBpmComment = sessionBpmComment.trim();
        }
        await prisma.rehearsalSessionPiece.updateMany({
          where: { sessionId: id, pieceId },
          data: bpmUpdate,
        });
      }

      const existingLog = await prisma.rehearsalLog.findFirst({
        where: {
          sessionId: id,
          pieceId,
          userId,
        },
      });

      let log;
      if (existingLog) {
        log = await prisma.rehearsalLog.update({
          where: { id: existingLog.id },
          data: {
            newConfidence,
            newPracticeNeeded,
            comment: (comment || "").trim(),
          },
        });
      } else {
        log = await prisma.rehearsalLog.create({
          data: {
            sessionId: id,
            pieceId,
            userId,
            prevConfidence,
            newConfidence,
            prevPracticeNeeded,
            newPracticeNeeded,
            comment: (comment || "").trim(),
          },
        });
      }

      await prisma.piece.update({
        where: { id: pieceId },
        data: { lastPracticedAt: new Date() },
      });

      await recalculateSchedule();
      await savePersistentSnapshot();
      return NextResponse.json({ log });
    }

    return NextResponse.json({ error: "Unbekannte Aktion." }, { status: 400 });
  } catch (error) {
    console.error("Error in PATCH /api/rehearsals/[id]:", error);
    return NextResponse.json(
      { error: "Fehler beim Bearbeiten der Probe." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.rehearsalSession.delete({ where: { id } });

    const remaining = await prisma.rehearsalSession.findMany({
      orderBy: [{ scheduledDate: "asc" }, { sessionNumber: "asc" }],
    });
    for (let i = 0; i < remaining.length; i++) {
      await prisma.rehearsalSession.update({
        where: { id: remaining[i].id },
        data: { sessionNumber: i + 1 },
      });
    }

    const nonCompletedCount = remaining.filter(
      (s) => s.status !== "COMPLETED"
    ).length;
    await prisma.rehearsalConfig.updateMany({
      where: { id: "default" },
      data: { totalSessionsLeft: Math.max(1, nonCompletedCount) },
    });

    await savePersistentSnapshot();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/rehearsals/[id]:", error);
    return NextResponse.json(
      { error: "Fehler beim Löschen der Probe." },
      { status: 500 }
    );
  }
}
