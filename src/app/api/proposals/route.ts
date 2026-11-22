import { NextRequest, NextResponse } from "next/server";
import {
  ensurePersistentDataLoaded,
  prisma,
  savePersistentSnapshot,
} from "@/lib/prisma";
import { normalizeTags, recalculateSchedule } from "@/lib/scheduler";
import { ProposalDecision } from "@/types";

async function resolveOrCreateUser(
  userId?: string,
  userName?: string
): Promise<{ id: string; name: string } | null> {
  if (!userId && !userName) return null;

  let userRecord = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : null;

  if (!userRecord && userName) {
    const trimmedName = String(userName).trim();
    if (trimmedName) {
      const allUsers = await prisma.user.findMany();
      userRecord =
        allUsers.find(
          (u) => u.name.toLowerCase() === trimmedName.toLowerCase()
        ) || null;
      if (!userRecord) {
        userRecord = await prisma.user.create({
          data: { id: userId || undefined, name: trimmedName },
        });
      }
    }
  }

  return userRecord ? { id: userRecord.id, name: userRecord.name } : null;
}

export async function GET(req: NextRequest) {
  try {
    await ensurePersistentDataLoaded();
    const userId = req.nextUrl.searchParams.get("userId") || "";
    const userName = (req.nextUrl.searchParams.get("userName") || "").trim();

    const rawProposals = await prisma.songProposal.findMany({
      include: {
        votes: {
          include: {
            user: { select: { id: true, name: true } },
          },
          orderBy: { updatedAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const proposals = rawProposals.map((p) => {
      let yesCount = 0;
      let superCount = 0;
      let noCount = 0;

      for (const v of p.votes) {
        if (v.decision === "SUPER") superCount++;
        else if (v.decision === "YES") yesCount++;
        else if (v.decision === "NO") noCount++;
      }

      const totalVotes = p.votes.length;
      const approvalPercent =
        totalVotes > 0
          ? Math.round(((yesCount + superCount) / totalVotes) * 100)
          : 0;
      const popularityScore = Number(
        (superCount * 2 + yesCount * 1 - noCount * 0.5).toFixed(2)
      );

      const myVoteRecord =
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
        artist: p.artist,
        platform: (p.platform === "SPOTIFY" ? "SPOTIFY" : "YOUTUBE") as
          | "YOUTUBE"
          | "SPOTIFY",
        externalId: p.externalId,
        sourceUrl: p.sourceUrl,
        embedUrl: p.embedUrl,
        thumbnailUrl: p.thumbnailUrl,
        previewAudioUrl: p.previewAudioUrl,
        startSeconds: p.startSeconds,
        notes: p.notes,
        proposedBy: p.proposedBy,
        transferredPieceId: p.transferredPieceId,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        yesCount,
        superCount,
        noCount,
        totalVotes,
        approvalPercent,
        popularityScore,
        myVote: myVoteRecord
          ? {
              decision: (["YES", "NO", "SUPER"].includes(myVoteRecord.decision)
                ? myVoteRecord.decision
                : "YES") as ProposalDecision,
              comment: myVoteRecord.comment,
            }
          : null,
        votes: p.votes.map((v) => ({
          id: v.id,
          userId: v.userId,
          userName: v.user.name,
          decision: (["YES", "NO", "SUPER"].includes(v.decision)
            ? v.decision
            : "YES") as ProposalDecision,
          comment: v.comment,
          updatedAt: v.updatedAt.toISOString(),
        })),
      };
    });

    return NextResponse.json({ proposals });
  } catch (error) {
    console.error("Error in GET /api/proposals:", error);
    return NextResponse.json(
      { error: "Fehler beim Laden der Liedvorschläge." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensurePersistentDataLoaded();
    const body = await req.json();

    // =========================================================================
    // ACTION: PROMOTE PROPOSAL TO MAIN REPERTOIRE (TAB 01)
    // =========================================================================
    if (body.action === "promoteToRepertoire") {
      const proposalId = String(body.proposalId || "").trim();
      if (!proposalId) {
        return NextResponse.json(
          { error: "Vorschlags-ID fehlt." },
          { status: 400 }
        );
      }

      const proposal = await prisma.songProposal.findUnique({
        where: { id: proposalId },
        include: { votes: true },
      });

      if (!proposal) {
        return NextResponse.json(
          { error: "Liedvorschlag wurde nicht gefunden." },
          { status: 404 }
        );
      }

      // Check if already transferred to a still-existing piece
      if (proposal.transferredPieceId) {
        const existingPiece = await prisma.piece.findUnique({
          where: { id: proposal.transferredPieceId },
        });
        if (existingPiece) {
          return NextResponse.json({
            piece: existingPiece,
            alreadyTransferred: true,
          });
        }
      }

      const title = String(body.title || proposal.title).trim();
      const artist = String(body.artist ?? proposal.artist).trim();
      const singers = normalizeTags(String(body.singers || ""));
      const soloists = normalizeTags(String(body.soloists || ""));
      const songType = String(body.songType || "").trim();
      const folderNumber = String(body.folderNumber || "").trim();
      const difficulty = ["EASY", "MEDIUM", "HARD"].includes(body.difficulty)
        ? body.difficulty
        : "MEDIUM";
      const notes = String(
        body.notes !== undefined ? body.notes : proposal.notes
      ).trim();
      const createdBy = String(
        body.createdBy || proposal.proposedBy || "Liedvorschlag"
      ).trim();

      const piece = await prisma.piece.create({
        data: {
          title,
          artist,
          folderNumber,
          singers,
          soloists,
          songType,
          difficulty,
          notes,
          createdBy,
        },
      });

      // Carry over positive/negative votes as initial Beliebtheit (likeScore) in Repertoire
      for (const v of proposal.votes) {
        const likeScore =
          v.decision === "SUPER" ? 5 : v.decision === "YES" ? 4 : 2;
        await prisma.pieceVote.upsert({
          where: {
            userId_pieceId: {
              userId: v.userId,
              pieceId: piece.id,
            },
          },
          update: {},
          create: {
            userId: v.userId,
            pieceId: piece.id,
            likeScore,
            confidenceScore: 3,
            practiceNeededScore: 4,
          },
        });
      }

      await prisma.songProposal.update({
        where: { id: proposal.id },
        data: { transferredPieceId: piece.id },
      });

      await recalculateSchedule();
      await savePersistentSnapshot();

      return NextResponse.json({ piece });
    }

    // =========================================================================
    // CREATE SINGLE OR BATCH PROPOSALS (PLAYLIST IMPORT)
    // =========================================================================
    const rawItems = Array.isArray(body.items) ? body.items : [body];
    if (rawItems.length === 0) {
      return NextResponse.json(
        { error: "Keine Lieder zum Importieren übergeben." },
        { status: 400 }
      );
    }

    const userRecord = await resolveOrCreateUser(body.userId, body.userName);
    const defaultProposedBy =
      String(body.proposedBy || userRecord?.name || "").trim();
    const skipDuplicates = body.skipDuplicates !== false;
    const autoVoteDecision = ["YES", "SUPER"].includes(body.autoVoteDecision)
      ? (body.autoVoteDecision as ProposalDecision)
      : null;

    const existing = await prisma.songProposal.findMany({
      select: { platform: true, externalId: true },
    });
    const existingKeys = new Set(
      existing
        .filter((e) => e.externalId)
        .map((e) => `${e.platform}:${e.externalId}`)
    );

    const createdProposals = [];
    let skippedCount = 0;

    for (const item of rawItems) {
      const title = String(item.title || "").trim();
      const sourceUrl = String(item.sourceUrl || "").trim();
      if (!title || !sourceUrl) {
        skippedCount++;
        continue;
      }

      let platform: "YOUTUBE" | "SPOTIFY" =
        String(item.platform || "").toUpperCase() === "SPOTIFY" ||
        sourceUrl.toLowerCase().includes("spotify.com") ||
        sourceUrl.toLowerCase().startsWith("spotify:")
          ? "SPOTIFY"
          : "YOUTUBE";
      let externalId = String(item.externalId || "").trim();
      let embedUrl = String(item.embedUrl || "").trim();
      let thumbnailUrl = String(item.thumbnailUrl || "").trim();

      // Fallback URL parsing if user saved directly without clicking "LINK AUSLESEN"
      if (!externalId) {
        try {
          if (sourceUrl.startsWith("spotify:track:")) {
            platform = "SPOTIFY";
            externalId = sourceUrl.split(":")[2] || "";
          } else {
            const u = new URL(
              sourceUrl.startsWith("http://") || sourceUrl.startsWith("https://")
                ? sourceUrl
                : `https://${sourceUrl}`
            );
            const h = u.hostname.toLowerCase();
            if (h.includes("spotify.com")) {
              platform = "SPOTIFY";
              const tm = u.pathname.match(/\/track\/([a-zA-Z0-9]+)/);
              if (tm?.[1]) externalId = tm[1];
            } else if (h.includes("youtu.be")) {
              platform = "YOUTUBE";
              externalId = u.pathname.replace(/^\//, "").split("/")[0] || "";
            } else if (h.includes("youtube.com")) {
              platform = "YOUTUBE";
              if (u.pathname.startsWith("/watch")) {
                externalId = u.searchParams.get("v") || "";
              } else if (
                u.pathname.startsWith("/shorts/") ||
                u.pathname.startsWith("/embed/")
              ) {
                externalId = u.pathname.split("/")[2] || "";
              }
            }
          }
        } catch {
          // ignore malformed fallback URL
        }
      }

      if (platform === "YOUTUBE" && externalId) {
        if (!embedUrl) embedUrl = `https://www.youtube.com/embed/${externalId}`;
        if (!thumbnailUrl)
          thumbnailUrl = `https://i.ytimg.com/vi/${externalId}/hqdefault.jpg`;
      } else if (platform === "SPOTIFY" && externalId) {
        if (!embedUrl)
          embedUrl = `https://open.spotify.com/embed/track/${externalId}?utm_source=generator`;
      }

      const key = externalId ? `${platform}:${externalId}` : "";

      if (skipDuplicates && key && existingKeys.has(key)) {
        skippedCount++;
        continue;
      }

      if (key) existingKeys.add(key);

      const startSeconds = Math.max(0, Math.round(Number(item.startSeconds || 0)));
      const notes = String(item.notes ?? body.notes ?? "").trim();

      const created = await prisma.songProposal.create({
        data: {
          title,
          artist: String(item.artist || "").trim(),
          platform,
          externalId,
          sourceUrl,
          embedUrl,
          thumbnailUrl,
          previewAudioUrl: String(item.previewAudioUrl || "").trim(),
          startSeconds: Number.isNaN(startSeconds) ? 0 : startSeconds,
          notes,
          proposedBy: String(item.proposedBy || defaultProposedBy).trim(),
        },
      });

      if (userRecord && autoVoteDecision) {
        await prisma.songProposalVote.upsert({
          where: {
            userId_proposalId: {
              userId: userRecord.id,
              proposalId: created.id,
            },
          },
          update: {
            decision: autoVoteDecision,
            comment: String(body.proposerComment || "").trim(),
          },
          create: {
            userId: userRecord.id,
            proposalId: created.id,
            decision: autoVoteDecision,
            comment: String(body.proposerComment || "").trim(),
          },
        });
      }

      createdProposals.push(created);
    }

    await savePersistentSnapshot();

    return NextResponse.json({
      createdCount: createdProposals.length,
      skippedCount,
      proposals: createdProposals,
    });
  } catch (error) {
    console.error("Error in POST /api/proposals:", error);
    return NextResponse.json(
      { error: "Fehler beim Speichern des Liedvorschlags." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await ensurePersistentDataLoaded();
    const body = await req.json();
    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json({ error: "ID fehlt." }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) {
      data.title = body.title.trim();
    }
    if (typeof body.artist === "string") {
      data.artist = body.artist.trim();
    }
    if (body.startSeconds !== undefined) {
      const s = Math.max(0, Math.round(Number(body.startSeconds || 0)));
      data.startSeconds = Number.isNaN(s) ? 0 : s;
    }
    if (typeof body.notes === "string") {
      data.notes = body.notes.trim();
    }
    if (typeof body.thumbnailUrl === "string") {
      data.thumbnailUrl = body.thumbnailUrl.trim();
    }

    const updated = await prisma.songProposal.update({
      where: { id },
      data,
    });

    await savePersistentSnapshot();
    return NextResponse.json({ proposal: updated });
  } catch (error) {
    console.error("Error in PATCH /api/proposals:", error);
    return NextResponse.json(
      { error: "Fehler beim Aktualisieren des Vorschlags." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensurePersistentDataLoaded();
    let id = req.nextUrl.searchParams.get("id") || "";
    if (!id) {
      try {
        const body = await req.json();
        id = String(body.id || "");
      } catch {
        // ignore
      }
    }
    if (!id) {
      return NextResponse.json({ error: "ID fehlt." }, { status: 400 });
    }

    await prisma.songProposal.delete({ where: { id } });
    await savePersistentSnapshot();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/proposals:", error);
    return NextResponse.json(
      { error: "Fehler beim Löschen des Vorschlags." },
      { status: 500 }
    );
  }
}
