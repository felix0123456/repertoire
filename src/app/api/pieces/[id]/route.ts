import { NextRequest, NextResponse } from "next/server";
import { prisma, savePersistentSnapshot } from "@/lib/prisma";
import { normalizeTags, recalculateSchedule } from "@/lib/scheduler";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const data: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) {
      data.title = body.title.trim();
    }
    if (typeof body.folderNumber === "string") {
      data.folderNumber = body.folderNumber.trim();
    }
    if (typeof body.artist === "string") {
      data.artist = body.artist.trim();
    }
    if (typeof body.singers === "string" || Array.isArray(body.singers)) {
      data.singers = normalizeTags(body.singers);
    }
    if (typeof body.soloists === "string" || Array.isArray(body.soloists)) {
      data.soloists = normalizeTags(body.soloists);
    }
    if (typeof body.songType === "string") {
      data.songType = body.songType.trim();
    }
    if (
      typeof body.difficulty === "string" &&
      ["EASY", "MEDIUM", "HARD"].includes(body.difficulty)
    ) {
      data.difficulty = body.difficulty;
    }
    if (typeof body.notes === "string") {
      data.notes = body.notes.trim();
    }
    if (body.lastPracticedAt !== undefined) {
      data.lastPracticedAt = body.lastPracticedAt
        ? new Date(body.lastPracticedAt)
        : null;
    }

    const updated = await prisma.piece.update({
      where: { id },
      data,
    });

    await recalculateSchedule();
    await savePersistentSnapshot();

    return NextResponse.json({ piece: updated });
  } catch (error) {
    console.error("Error in PATCH /api/pieces/[id]:", error);
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren des Stücks." },
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
    await prisma.piece.delete({ where: { id } });
    await recalculateSchedule();
    await savePersistentSnapshot();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/pieces/[id]:", error);
    return NextResponse.json(
      { error: "Fehler beim Löschen des Stücks." },
      { status: 500 }
    );
  }
}

