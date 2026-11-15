import { NextRequest, NextResponse } from "next/server";
import {
  ensurePersistentDataLoaded,
  prisma,
  savePersistentSnapshot,
} from "@/lib/prisma";
import {
  calculatePiecePriority,
  normalizeTags,
  recalculateSchedule,
  splitTags,
} from "@/lib/scheduler";

export async function GET(req: NextRequest) {
  try {
    await ensurePersistentDataLoaded();
    const userId = req.nextUrl.searchParams.get("userId") || "";
    const userName = (req.nextUrl.searchParams.get("userName") || "").trim();

    const pieces = await prisma.piece.findMany({
      include: {
        votes: {
          include: {
            user: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const singerSet = new Set<string>();
    const soloistSet = new Set<string>();
    const songTypeSet = new Set<string>();

    const enriched = pieces.map((p) => {
      const singerList = splitTags(p.singers);
      const soloistList = splitTags(p.soloists);
      singerList.forEach((s) => singerSet.add(s));
      soloistList.forEach((s) => soloistSet.add(s));
      if (p.songType.trim()) songTypeSet.add(p.songType.trim());

      const stats = calculatePiecePriority(p);
      const myVote =
        userId || userName
          ? p.votes.find(
              (v) =>
                (userId && v.userId === userId) ||
                (userName &&
                  v.user.name.toLowerCase() === userName.toLowerCase())
            ) || null
          : null;

      return {
        id: p.id,
        title: p.title,
        folderNumber: p.folderNumber,
        artist: p.artist,
        singers: p.singers,
        singerList,
        soloists: p.soloists,
        soloistList,
        songType: p.songType,
        difficulty: p.difficulty,
        notes: p.notes,
        lastPracticedAt: p.lastPracticedAt
          ? p.lastPracticedAt.toISOString()
          : null,
        createdBy: p.createdBy,
        createdAt: p.createdAt.toISOString(),
        voteCount: p.votes.length,
        avgLike: stats.avgLike,
        avgConfidence: stats.avgConfidence,
        avgPracticeNeeded: stats.avgPracticeNeeded,
        priorityScore: stats.priorityScore,
        priorityReasons: stats.priorityReasons,
        myVote: myVote
          ? {
              likeScore: myVote.likeScore,
              confidenceScore: myVote.confidenceScore,
              practiceNeededScore: myVote.practiceNeededScore,
            }
          : null,
        votes: p.votes.map((v) => ({
          userId: v.userId,
          userName: v.user.name,
          likeScore: v.likeScore,
          confidenceScore: v.confidenceScore,
          practiceNeededScore: v.practiceNeededScore,
        })),
      };
    });

    return NextResponse.json({
      pieces: enriched,
      suggestions: {
        singers: Array.from(singerSet).sort((a, b) => a.localeCompare(b, "de")),
        soloists: Array.from(soloistSet).sort((a, b) =>
          a.localeCompare(b, "de")
        ),
        songTypes: Array.from(songTypeSet).sort((a, b) =>
          a.localeCompare(b, "de")
        ),
      },
    });
  } catch (error) {
    console.error("Error in GET /api/pieces:", error);
    return NextResponse.json(
      { error: "Fehler beim Laden des Repertoires." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const title = (body.title || "").trim();
    if (!title) {
      return NextResponse.json(
        { error: "Bitte gib einen Titel für das Stück an." },
        { status: 400 }
      );
    }

    const piece = await prisma.piece.create({
      data: {
        title,
        folderNumber: (body.folderNumber || "").trim(),
        artist: (body.artist || "").trim(),
        singers: normalizeTags(body.singers || ""),
        soloists: normalizeTags(body.soloists || ""),
        songType: (body.songType || "").trim(),
        difficulty: ["EASY", "MEDIUM", "HARD"].includes(body.difficulty)
          ? body.difficulty
          : "MEDIUM",
        notes: (body.notes || "").trim(),
        createdBy: (body.createdBy || "").trim(),
      },
    });

    // Optional initial vote if user provided one when adding the piece
    if (body.userId) {
      await prisma.pieceVote.upsert({
        where: {
          userId_pieceId: {
            userId: body.userId,
            pieceId: piece.id,
          },
        },
        update: {
          likeScore: Number(body.likeScore ?? 4),
          confidenceScore: Number(body.confidenceScore ?? 3),
          practiceNeededScore: Number(body.practiceNeededScore ?? 3),
        },
        create: {
          userId: body.userId,
          pieceId: piece.id,
          likeScore: Number(body.likeScore ?? 4),
          confidenceScore: Number(body.confidenceScore ?? 3),
          practiceNeededScore: Number(body.practiceNeededScore ?? 3),
        },
      });
    }

    await recalculateSchedule();
    await savePersistentSnapshot();

    return NextResponse.json({ piece });
  } catch (error) {
    console.error("Error in POST /api/pieces:", error);
    return NextResponse.json(
      { error: "Fehler beim Anlegen des Stücks." },
      { status: 500 }
    );
  }
}

