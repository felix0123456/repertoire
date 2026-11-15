import { NextRequest, NextResponse } from "next/server";
import { prisma, savePersistentSnapshot } from "@/lib/prisma";

export async function GET() {
  try {
    const [
      users,
      pieces,
      votes,
      rehearsalConfigs,
      concerts,
      sessions,
      sessionPieces,
      logs,
    ] = await Promise.all([
      prisma.user.findMany(),
      prisma.piece.findMany(),
      prisma.pieceVote.findMany(),
      prisma.rehearsalConfig.findMany(),
      prisma.concertEvent.findMany(),
      prisma.rehearsalSession.findMany(),
      prisma.rehearsalSessionPiece.findMany(),
      prisma.rehearsalLog.findMany(),
    ]);

    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      users,
      pieces,
      votes,
      rehearsalConfigs,
      concerts,
      sessions,
      sessionPieces,
      logs,
    });
  } catch (error) {
    console.error("Error in GET /api/backup:", error);
    return NextResponse.json(
      { error: "Backup-Export fehlgeschlagen." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    if (!data || !Array.isArray(data.pieces)) {
      return NextResponse.json(
        { error: "Ungültiges Backup-Format." },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.rehearsalLog.deleteMany();
      await tx.rehearsalSessionPiece.deleteMany();
      await tx.pieceVote.deleteMany();
      await tx.rehearsalSession.deleteMany();
      await tx.concertEvent.deleteMany();
      await tx.piece.deleteMany();
      await tx.user.deleteMany();

      if (Array.isArray(data.users)) {
        for (const u of data.users) {
          await tx.user.create({
            data: {
              id: u.id,
              name: u.name,
              createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
            },
          });
        }
      }

      if (Array.isArray(data.pieces)) {
        for (const p of data.pieces) {
          await tx.piece.create({
            data: {
              id: p.id,
              title: p.title,
              folderNumber: p.folderNumber || "",
              artist: p.artist || "",
              singers: p.singers || "",
              soloists: p.soloists || "",
              songType: p.songType || "",
              difficulty: p.difficulty || "MEDIUM",
              notes: p.notes || "",
              lastPracticedAt: p.lastPracticedAt
                ? new Date(p.lastPracticedAt)
                : null,
              createdBy: p.createdBy || "",
              createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
            },
          });
        }
      }

      if (Array.isArray(data.votes)) {
        for (const v of data.votes) {
          await tx.pieceVote.create({
            data: {
              id: v.id,
              userId: v.userId,
              pieceId: v.pieceId,
              likeScore: v.likeScore ?? 3,
              confidenceScore: v.confidenceScore ?? 3,
              practiceNeededScore: v.practiceNeededScore ?? 3,
            },
          });
        }
      }

      if (Array.isArray(data.concerts)) {
        for (const c of data.concerts) {
          await tx.concertEvent.create({
            data: {
              id: c.id,
              title: c.title,
              scheduledDate: c.scheduledDate ? new Date(c.scheduledDate) : null,
              location: c.location || "",
              additionalInfo: c.additionalInfo || "",
            },
          });
        }
      }

      if (Array.isArray(data.sessions)) {
        for (const s of data.sessions) {
          await tx.rehearsalSession.create({
            data: {
              id: s.id,
              sessionNumber: s.sessionNumber,
              title: s.title,
              status: s.status || "PLANNED",
              scheduledDate: s.scheduledDate ? new Date(s.scheduledDate) : null,
              location: s.location || "",
              additionalInfo: s.additionalInfo || "",
              presentSingers: s.presentSingers || "",
              absentSoloists: s.absentSoloists || "",
              isLocked: Boolean(s.isLocked),
              completedAt: s.completedAt ? new Date(s.completedAt) : null,
            },
          });
        }
      }

      if (Array.isArray(data.sessionPieces)) {
        for (const sp of data.sessionPieces) {
          await tx.rehearsalSessionPiece.create({
            data: {
              id: sp.id,
              sessionId: sp.sessionId,
              pieceId: sp.pieceId,
              sortOrder: sp.sortOrder ?? 1,
              isManualOverride: Boolean(sp.isManualOverride),
            },
          });
        }
      }

      if (Array.isArray(data.logs)) {
        for (const l of data.logs) {
          await tx.rehearsalLog.create({
            data: {
              id: l.id,
              sessionId: l.sessionId,
              pieceId: l.pieceId,
              userId: l.userId,
              prevConfidence: l.prevConfidence ?? 3,
              newConfidence: l.newConfidence ?? 3,
              prevPracticeNeeded: l.prevPracticeNeeded ?? 3,
              newPracticeNeeded: l.newPracticeNeeded ?? 3,
              comment: l.comment || "",
              createdAt: l.createdAt ? new Date(l.createdAt) : new Date(),
            },
          });
        }
      }
    });

    await savePersistentSnapshot();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in POST /api/backup:", error);
    return NextResponse.json(
      { error: "Backup-Wiederherstellung fehlgeschlagen." },
      { status: 500 }
    );
  }
}

