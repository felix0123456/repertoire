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
    let { userId } = body;
    const { proposalId, userName, decision } = body;

    if ((!userId && !userName) || !proposalId) {
      return NextResponse.json(
        { error: "Spieler-ID und Vorschlags-ID sind erforderlich." },
        { status: 400 }
      );
    }

    // Resolve or create user
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

    if (!userId) {
      return NextResponse.json(
        { error: "Spieler konnte nicht aufgelöst werden." },
        { status: 400 }
      );
    }

    // Handle UNDO (delete existing vote)
    if (decision === "UNDO" || decision === null) {
      await prisma.songProposalVote.deleteMany({
        where: {
          userId,
          proposalId,
        },
      });
      await savePersistentSnapshot();
      return NextResponse.json({ deleted: true });
    }

    const validDecision = ["YES", "NO", "SUPER"].includes(decision)
      ? decision
      : "YES";

    const existing = await prisma.songProposalVote.findUnique({
      where: {
        userId_proposalId: { userId, proposalId },
      },
    });

    const comment =
      typeof body.comment === "string"
        ? body.comment.trim()
        : existing?.comment ?? "";

    const vote = await prisma.songProposalVote.upsert({
      where: {
        userId_proposalId: { userId, proposalId },
      },
      update: {
        decision: validDecision,
        comment,
      },
      create: {
        userId,
        proposalId,
        decision: validDecision,
        comment,
      },
    });

    await savePersistentSnapshot();

    return NextResponse.json({ vote });
  } catch (error) {
    console.error("Error in POST /api/proposals/vote:", error);
    return NextResponse.json(
      { error: "Fehler beim Speichern der Stimme." },
      { status: 500 }
    );
  }
}
