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
              notes: item.notes,
              createdBy: "Setlist Dance & Talk 2026",
            },
          });
        }
        await tx.concertEvent.create({
          data: {
            title: DEFAULT_CONCERT.title,
            location: DEFAULT_CONCERT.location,
            additionalInfo: DEFAULT_CONCERT.additionalInfo,
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
      (!data.pieces?.length && !data.concerts?.length && !data.users?.length)
    ) {
      return;
    }

    await prisma.$transaction(async (tx) => {
      if (Array.isArray(data.users)) {
        for (const u of data.users) {
          await tx.user.upsert({
            where: { id: u.id },
            update: { name: u.name },
            create: {
              id: u.id,
              name: u.name,
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
  } catch (err) {
    console.error("Failed to auto-restore from persistent snapshot:", err);
  }
}
