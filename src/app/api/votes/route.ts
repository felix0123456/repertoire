import { NextRequest, NextResponse } from "next/server";
import {
  ensurePersistentDataLoaded,
  prisma,
  savePersistentSnapshot,
} from "@/lib/prisma";
import { recalculateSchedule } from "@/lib/scheduler";

function clampScore(val: unknown, fallback = 3): number {
  const num = Number(val);
  if (Number.isNaN(num)) return fallback;
  return Math.max(1, Math.min(5, Math.round(num)));
}

export async function POST(req: NextRequest) {
  try {
    await ensurePersistentDataLoaded();
    const body = await req.json();
    let { userId } = body;
    const { pieceId, userName } = body;

    if ((!userId && !userName) || !pieceId) {
      return NextResponse.json(
        { error: "Spieler-ID und Stück-ID sind erforderlich." },
        { status: 400 }
      );
    }

    // Ensure user exists (resolve by id first, then case-insensitive name, or create)
    let userRecord = userId
      ? await prisma.user.findUnique({ where: { id: userId } })
      : null;

    if (!userRecord && userName) {
      const trimmedName = String(userName).trim();
      const allUsers = await prisma.user.findMany();
      userRecord =
        allUsers.find(
          (u) => u.name.toLowerCase() === trimmedName.toLowerCase()
        ) || null;
      if (!userRecord && trimmedName) {
        userRecord = await prisma.user.create({
          data: { id: userId || undefined, name: trimmedName },
        });
      }
    }

    if (userRecord) {
      userId = userRecord.id;
    }

    const existing = await prisma.pieceVote.findUnique({
      where: {
        userId_pieceId: { userId, pieceId },
      },
    });

    const likeScore =
      body.likeScore !== undefined
        ? clampScore(body.likeScore)
        : existing?.likeScore ?? 3;
    const confidenceScore =
      body.confidenceScore !== undefined
        ? clampScore(body.confidenceScore)
        : existing?.confidenceScore ?? 3;
    const practiceNeededScore =
      body.practiceNeededScore !== undefined
        ? clampScore(body.practiceNeededScore)
        : existing?.practiceNeededScore ?? 3;

    const vote = await prisma.pieceVote.upsert({
      where: {
        userId_pieceId: { userId, pieceId },
      },
      update: {
        likeScore,
        confidenceScore,
        practiceNeededScore,
      },
      create: {
        userId,
        pieceId,
        likeScore,
        confidenceScore,
        practiceNeededScore,
      },
    });

    await recalculateSchedule();
    await savePersistentSnapshot();

    return NextResponse.json({ vote });
  } catch (error) {
    console.error("Error in POST /api/votes:", error);
    return NextResponse.json(
      { error: "Fehler beim Speichern der Bewertung." },
      { status: 500 }
    );
  }
}
