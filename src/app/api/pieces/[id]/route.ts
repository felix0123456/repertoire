import { NextRequest, NextResponse } from "next/server";
import { prisma, savePersistentSnapshot } from "@/lib/prisma";
import {
  normalizeTags,
  parseMeasureNotes,
  recalculateSchedule,
} from "@/lib/scheduler";

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
    if (body.bpm !== undefined) {
      data.bpm = Math.max(0, Math.min(400, Math.round(Number(body.bpm) || 0)));
    }
    if (typeof body.notes === "string") {
      data.notes = body.notes.trim();
    }
    if (typeof body.referenceUrl === "string") {
      data.referenceUrl = body.referenceUrl.trim();
    }
    if (
      typeof body.focusInstruments === "string" ||
      Array.isArray(body.focusInstruments)
    ) {
      data.focusInstruments = normalizeTags(body.focusInstruments);
    }
    if (Array.isArray(body.measureNotes)) {
      data.measureNotesJson = JSON.stringify(body.measureNotes);
    } else if (typeof body.measureNotesJson === "string") {
      data.measureNotesJson = body.measureNotesJson;
    }

    // Convenience action: add or remove a single measure note
    if (body.addMeasureNote && typeof body.addMeasureNote === "object") {
      const existingPiece = await prisma.piece.findUnique({
        where: { id },
        select: { measureNotesJson: true },
      });
      const currentNotes = parseMeasureNotes(existingPiece?.measureNotesJson);
      const noteText = String(body.addMeasureNote.note || "").trim();
      if (noteText) {
        currentNotes.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          measure: String(body.addMeasureNote.measure || "").trim(),
          instrument: String(body.addMeasureNote.instrument || "").trim(),
          note: noteText,
          author: String(body.addMeasureNote.author || "").trim(),
          createdAt: new Date().toISOString(),
        });
        data.measureNotesJson = JSON.stringify(currentNotes);
      }
    }

    if (typeof body.removeMeasureNoteId === "string") {
      const existingPiece = await prisma.piece.findUnique({
        where: { id },
        select: { measureNotesJson: true },
      });
      const currentNotes = parseMeasureNotes(
        existingPiece?.measureNotesJson
      ).filter((n) => n.id !== body.removeMeasureNoteId);
      data.measureNotesJson = JSON.stringify(currentNotes);
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
