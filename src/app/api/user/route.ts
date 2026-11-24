import { NextRequest, NextResponse } from "next/server";
import {
  ensurePersistentDataLoaded,
  prisma,
  savePersistentSnapshot,
} from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    await ensurePersistentDataLoaded();
    const body = await req.json();
    const rawName = (body.name || "").trim();
    const rawInstrument =
      typeof body.instrument === "string" ? body.instrument.trim() : undefined;

    if (!rawName) {
      return NextResponse.json(
        { error: "Bitte gib einen gültigen Namen ein." },
        { status: 400 }
      );
    }

    // Find case-insensitively or create user without exposing a user list
    const allUsers = await prisma.user.findMany();
    let user = allUsers.find(
      (u) => u.name.toLowerCase() === rawName.toLowerCase()
    );
    let isNewUser = false;

    if (!user) {
      user = await prisma.user.create({
        data: {
          name: rawName,
          instrument: rawInstrument || "",
        },
      });
      isNewUser = true;
      await savePersistentSnapshot();
    } else if (
      rawInstrument !== undefined &&
      rawInstrument !== user.instrument
    ) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { instrument: rawInstrument },
      });
      await savePersistentSnapshot();
    }

    const voteCount = await prisma.pieceVote.count({
      where: { userId: user.id },
    });

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        instrument: user.instrument || "",
      },
      isNewUser,
      voteCount,
      isFirstTimeOnboarding: isNewUser && voteCount === 0,
    });
  } catch (error) {
    console.error("Error in /api/user:", error);
    return NextResponse.json(
      { error: "Fehler beim Anmelden des Spielers." },
      { status: 500 }
    );
  }
}
