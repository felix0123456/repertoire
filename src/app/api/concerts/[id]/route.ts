import { NextRequest, NextResponse } from "next/server";
import { prisma, savePersistentSnapshot } from "@/lib/prisma";

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
    if (Array.isArray(body.setlist)) {
      data.setlistJson = JSON.stringify(body.setlist);
    } else if (typeof body.setlistJson === "string") {
      data.setlistJson = body.setlistJson;
    }

    const updated = await prisma.concertEvent.update({
      where: { id },
      data,
    });

    await savePersistentSnapshot();
    return NextResponse.json({ concert: updated });
  } catch (error) {
    console.error("Error in PATCH /api/concerts/[id]:", error);
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren des Auftritts." },
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
    await prisma.concertEvent.delete({ where: { id } });
    await savePersistentSnapshot();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/concerts/[id]:", error);
    return NextResponse.json(
      { error: "Fehler beim Löschen des Auftritts." },
      { status: 500 }
    );
  }
}
