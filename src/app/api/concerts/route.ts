import { NextRequest, NextResponse } from "next/server";
import { prisma, savePersistentSnapshot } from "@/lib/prisma";

function parseSetlist(rawJson: string | null | undefined) {
  if (!rawJson) return [];
  try {
    const parsed = JSON.parse(rawJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const concerts = await prisma.concertEvent.findMany({
      orderBy: [{ scheduledDate: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({
      concerts: concerts.map((c) => ({
        ...c,
        setlist: parseSetlist(c.setlistJson),
      })),
    });
  } catch (error) {
    console.error("Error in GET /api/concerts:", error);
    return NextResponse.json(
      { error: "Fehler beim Laden der Auftritte." },
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
        { error: "Bitte gib einen Titel für den Auftritt ein." },
        { status: 400 }
      );
    }

    const setlistJson = Array.isArray(body.setlist)
      ? JSON.stringify(body.setlist)
      : typeof body.setlistJson === "string"
      ? body.setlistJson
      : "[]";

    const concert = await prisma.concertEvent.create({
      data: {
        title,
        scheduledDate: body.scheduledDate ? new Date(body.scheduledDate) : null,
        location: (body.location || "").trim(),
        additionalInfo: (body.additionalInfo || "").trim(),
        setlistJson,
      },
    });

    await savePersistentSnapshot();
    return NextResponse.json({ concert });
  } catch (error) {
    console.error("Error in POST /api/concerts:", error);
    return NextResponse.json(
      { error: "Fehler beim Anlegen des Auftritts." },
      { status: 500 }
    );
  }
}
