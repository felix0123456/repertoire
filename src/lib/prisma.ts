import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { DEFAULT_SETLIST_PIECES, DEFAULT_CONCERT } from "./defaultSetlist";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  restoredChecked: boolean | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export function getPersistentDataDir(): string {
  const prodDir = "/app/data";
  if (process.env.NODE_ENV === "production" || fs.existsSync(prodDir)) {
    try {
      if (!fs.existsSync(prodDir)) {
        fs.mkdirSync(prodDir, { recursive: true });
      }
      return prodDir;
    } catch {
      // Fallback to local data dir
    }
  }
  const localDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  return localDir;
}

export async function savePersistentSnapshot(): Promise<void> {
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
      songProposals,
      songProposalVotes,
    ] = await Promise.all([
      prisma.user.findMany(),
      prisma.piece.findMany(),
      prisma.pieceVote.findMany(),
      prisma.rehearsalConfig.findMany(),
      prisma.concertEvent.findMany(),
      prisma.rehearsalSession.findMany(),
      prisma.rehearsalSessionPiece.findMany(),
      prisma.rehearsalLog.findMany(),
      prisma.songProposal.findMany(),
      prisma.songProposalVote.findMany(),
    ]);

    const snapshot = {
      updatedAt: new Date().toISOString(),
      users,
      pieces,
      votes,
      rehearsalConfigs,
      concerts,
      sessions,
      sessionPieces,
      logs,
      songProposals,
      songProposalVotes,
    };

    const dataDir = getPersistentDataDir();
    const snapshotPath = path.join(dataDir, "backup-latest.json");
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write persistent backup snapshot:", err);
  }
}

export async function ensurePersistentDataLoaded(): Promise<void> {
  if (globalForPrisma.restoredChecked) return;
  globalForPrisma.restoredChecked = true;

  try {
    const [pieceCount, concertCount, userCount] = await Promise.all([
      prisma.piece.count(),
      prisma.concertEvent.count(),
      prisma.user.count(),
    ]);

    if (pieceCount > 0 || concertCount > 0 || userCount > 0) {
      // Ensure any legacy setlist number prefixes ("01. ") are stripped from piece titles
      const allPieces = await prisma.piece.findMany({
        select: { id: true, title: true },
      });
      let updatedAny = false;
      for (const p of allPieces) {
        const cleaned = p.title.replace(/^\d{1,2}\.\s+/, "");
        if (cleaned !== p.title) {
          await prisma.piece.update({
            where: { id: p.id },
            data: { title: cleaned },
          });
          updatedAny = true;
        }
      }
      if (updatedAny) {
        await savePersistentSnapshot();
      }
      return;
    }

    const dataDir = getPersistentDataDir();
    const snapshotPath = path.join(dataDir, "backup-latest.json");
    if (!fs.existsSync(snapshotPath)) {
      // Seed default 44-piece setlist ("BigBand MV Neumarkt – Programm Dance & Talk 2026")
      await prisma.$transaction(async (tx) => {
        for (const item of DEFAULT_SETLIST_PIECES) {
          await tx.piece.create({
            data: {
              title: item.title,
              folderNumber: "",
              artist: "BigBand MV Neumarkt",
              singers: item.singers,
              soloists: "",
              songType: item.songType,
              difficulty: "MEDIUM",
              bpm: 0,
              notes: item.notes,
              referenceUrl: "",
              focusInstruments: "",
              measureNotesJson: "[]",
              createdBy: "Setlist Dance & Talk 2026",
            },
          });
        }
        await tx.concertEvent.create({
          data: {
            title: DEFAULT_CONCERT.title,
            location: DEFAULT_CONCERT.location,
            additionalInfo: DEFAULT_CONCERT.additionalInfo,
            setlistJson: "[]",
          },
        });
      });
      await savePersistentSnapshot();
      return;
    }

    const raw = fs.readFileSync(snapshotPath, "utf-8");
    const data = JSON.parse(raw);
    if (
      !data ||
      (!data.pieces?.length &&
        !data.concerts?.length &&
        !data.users?.length &&
        !data.songProposals?.length)
    ) {
      return;
    }

    await prisma.$transaction(async (tx) => {
      if (Array.isArray(data.users)) {
        for (const u of data.users) {
          await tx.user.upsert({
            where: { id: u.id },
            update: {
              name: u.name,
              instrument: u.instrument || "",
            },
            create: {
              id: u.id,
              name: u.name,
              instrument: u.instrument || "",
              createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
            },
          });
        }
      }

      if (Array.isArray(data.pieces)) {
        for (const p of data.pieces) {
          const cleanTitle = String(p.title || "").replace(/^\d{1,2}\.\s+/, "");
          await tx.piece.upsert({
            where: { id: p.id },
            update: {},
            create: {
              id: p.id,
              title: cleanTitle,
              folderNumber: p.folderNumber || "",
              artist: p.artist || "",
              singers: p.singers || "",
              soloists: p.soloists || "",
              songType: p.songType || "",
              difficulty: p.difficulty || "MEDIUM",
              bpm: Number(p.bpm ?? 0) || 0,
              notes: p.notes || "",
              referenceUrl: p.referenceUrl || "",
              focusInstruments: p.focusInstruments || "",
              measureNotesJson: p.measureNotesJson || "[]",
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
          await tx.pieceVote.upsert({
            where: { id: v.id },
            update: {},
            create: {
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
          await tx.concertEvent.upsert({
            where: { id: c.id },
            update: {},
            create: {
              id: c.id,
              title: c.title,
              scheduledDate: c.scheduledDate ? new Date(c.scheduledDate) : null,
              location: c.location || "",
              additionalInfo: c.additionalInfo || "",
              setlistJson: c.setlistJson || "[]",
              konzertmeisterId: c.konzertmeisterId || "",
            },
          });
        }
      }

      if (Array.isArray(data.sessions)) {
        await tx.rehearsalSession.deleteMany();
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
              absentInstruments: s.absentInstruments || "",
              isLocked: Boolean(s.isLocked),
              hasBreak: Boolean(s.hasBreak),
              breakDurationMinutes: Number(s.breakDurationMinutes ?? 15) || 15,
              breakAfterPieceIndex: Number(s.breakAfterPieceIndex ?? 3) || 3,
              attendanceJson: s.attendanceJson || "[]",
              konzertmeisterId: s.konzertmeisterId || "",
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
              estimatedMinutes: Number(sp.estimatedMinutes ?? 0) || 0,
              sessionBpm: Number(sp.sessionBpm ?? 0) || 0,
              sessionBpmComment: sp.sessionBpmComment || "",
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

      if (Array.isArray(data.songProposals)) {
        for (const sp of data.songProposals) {
          await tx.songProposal.upsert({
            where: { id: sp.id },
            update: {},
            create: {
              id: sp.id,
              title: sp.title || "",
              artist: sp.artist || "",
              platform: sp.platform || "YOUTUBE",
              externalId: sp.externalId || "",
              sourceUrl: sp.sourceUrl || "",
              embedUrl: sp.embedUrl || "",
              thumbnailUrl: sp.thumbnailUrl || "",
              previewAudioUrl: sp.previewAudioUrl || "",
              startSeconds: Number(sp.startSeconds ?? 0),
              notes: sp.notes || "",
              proposedBy: sp.proposedBy || "",
              transferredPieceId: sp.transferredPieceId || null,
              createdAt: sp.createdAt ? new Date(sp.createdAt) : new Date(),
            },
          });
        }
      }

      if (Array.isArray(data.songProposalVotes)) {
        for (const pv of data.songProposalVotes) {
          await tx.songProposalVote.upsert({
            where: { id: pv.id },
            update: {},
            create: {
              id: pv.id,
              proposalId: pv.proposalId,
              userId: pv.userId,
              decision: pv.decision || "YES",
              comment: pv.comment || "",
              updatedAt: pv.updatedAt ? new Date(pv.updatedAt) : new Date(),
            },
          });
        }
      }
    });
  } catch (err) {
    console.error("Failed to auto-restore from persistent snapshot:", err);
  }
}
