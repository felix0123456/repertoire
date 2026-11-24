import { NextRequest, NextResponse } from "next/server";
import { ensurePersistentDataLoaded, prisma } from "@/lib/prisma";
import { ResolvedTrackMetadata } from "@/types";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
  Cookie: "CONSENT=YES+cb.20210328-17-p0.de+FX+111",
};

function parseTimeOffsetToSeconds(raw: string | null | undefined): number {
  if (!raw) return 0;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return 0;

  // Format mm:ss or hh:mm:ss
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":").map((p) => Number(p));
    if (parts.some((n) => Number.isNaN(n))) return 0;
    if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1]);
    if (parts.length === 3)
      return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }

  // Format 1h2m30s / 2m15s / 45s
  const hmsMatch = trimmed.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  if (hmsMatch && (hmsMatch[1] || hmsMatch[2] || hmsMatch[3])) {
    const h = Number(hmsMatch[1] || 0);
    const m = Number(hmsMatch[2] || 0);
    const s = Number(hmsMatch[3] || 0);
    return Math.max(0, h * 3600 + m * 60 + s);
  }

  const num = Number(trimmed.replace(/[^\d]/g, ""));
  return Number.isNaN(num) ? 0 : Math.max(0, num);
}

function splitTitleAndArtist(
  rawTitle: string,
  rawAuthor: string
): { title: string; artist: string } {
  let cleanedTitle = (rawTitle || "")
    .replace(/\u00a0/g, " ")
    .replace(
      /\s*[\(\[]\s*(?:official\s*(?:music\s*)?(?:video|audio|lyric\s*video|visualizer|hd|4k)|lyrics?|audio|hd|hq|remastered(?:\s*\d{4})?|video\s*oficial|offizielles\s*musikvideo)\s*[\)\]]/gi,
      ""
    )
    .trim();

  const cleanedAuthor = (rawAuthor || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/VEVO$/i, "")
    .trim();

  // Check if title contains "Artist - Song Title"
  const dashSeparators = [" - ", " – ", " — "];
  for (const sep of dashSeparators) {
    const idx = cleanedTitle.indexOf(sep);
    if (idx > 1 && idx < cleanedTitle.length - sep.length - 1) {
      const left = cleanedTitle.slice(0, idx).trim();
      const right = cleanedTitle
        .slice(idx + sep.length)
        .replace(/^["„”']+|["“”']+$/g, "")
        .trim();
      if (left && right) {
        return {
          artist: left,
          title: right,
        };
      }
    }
  }

  return {
    title: cleanedTitle || rawTitle.trim(),
    artist: cleanedAuthor,
  };
}

function extractBalancedJson(html: string, marker: string): unknown | null {
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const startBrace = html.indexOf("{", idx + marker.length);
  if (startBrace === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startBrace; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
    } else {
      if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const jsonStr = html.slice(startBrace, i + 1);
          try {
            return JSON.parse(jsonStr);
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

async function resolveYouTubeSingleVideo(
  videoId: string,
  startSeconds = 0
): Promise<ResolvedTrackMetadata> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const embedUrl = `https://www.youtube.com/embed/${videoId}`;
  const defaultThumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      watchUrl
    )}&format=json`;
    const res = await fetch(oembedUrl, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const data = await res.json();
      const { title, artist } = splitTitleAndArtist(
        data.title || "",
        data.author_name || ""
      );
      return {
        title: title || `YouTube Video (${videoId})`,
        artist,
        platform: "YOUTUBE",
        externalId: videoId,
        sourceUrl: watchUrl,
        embedUrl,
        thumbnailUrl: data.thumbnail_url || defaultThumb,
        previewAudioUrl: "",
        startSeconds,
      };
    }
  } catch {
    // Fallback to noembed
  }

  try {
    const noembedRes = await fetch(
      `https://noembed.com/embed?url=${encodeURIComponent(watchUrl)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (noembedRes.ok) {
      const data = await noembedRes.json();
      const { title, artist } = splitTitleAndArtist(
        data.title || "",
        data.author_name || ""
      );
      return {
        title: title || `YouTube Video (${videoId})`,
        artist,
        platform: "YOUTUBE",
        externalId: videoId,
        sourceUrl: watchUrl,
        embedUrl,
        thumbnailUrl: data.thumbnail_url || defaultThumb,
        previewAudioUrl: "",
        startSeconds,
      };
    }
  } catch {
    // Ignore
  }

  return {
    title: `YouTube Track (${videoId})`,
    artist: "",
    platform: "YOUTUBE",
    externalId: videoId,
    sourceUrl: watchUrl,
    embedUrl,
    thumbnailUrl: defaultThumb,
    previewAudioUrl: "",
    startSeconds,
  };
}

async function resolveYouTubePlaylist(listId: string): Promise<{
  playlistTitle: string;
  tracks: ResolvedTrackMetadata[];
}> {
  const tracks: ResolvedTrackMetadata[] = [];
  const seenIds = new Set<string>();
  let playlistTitle = "YouTube Playlist";

  try {
    const playlistUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(
      listId
    )}`;
    const res = await fetch(playlistUrl, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(9000),
    });

    if (res.ok) {
      const html = await res.text();
      const initialData =
        extractBalancedJson(html, "var ytInitialData =") ||
        extractBalancedJson(html, 'window["ytInitialData"] =');

      if (initialData && typeof initialData === "object") {
        // Recursive walk to find playlistTitle and playlistVideoRenderer
        const walk = (node: unknown) => {
          if (!node || typeof node !== "object") return;
          if (Array.isArray(node)) {
            for (const item of node) walk(item);
            return;
          }
          const obj = node as Record<string, unknown>;

          if (
            obj.playlistMetadataRenderer &&
            typeof obj.playlistMetadataRenderer === "object"
          ) {
            const meta = obj.playlistMetadataRenderer as Record<string, unknown>;
            if (typeof meta.title === "string" && meta.title.trim()) {
              playlistTitle = meta.title.trim();
            }
          }

          if (
            obj.pageHeaderRenderer &&
            typeof obj.pageHeaderRenderer === "object"
          ) {
            const phr = obj.pageHeaderRenderer as Record<string, unknown>;
            if (typeof phr.pageTitle === "string" && phr.pageTitle.trim()) {
              playlistTitle = phr.pageTitle.trim();
            }
          }

          // Modern YouTube playlist renderer (lockupViewModel)
          if (
            obj.lockupViewModel &&
            typeof obj.lockupViewModel === "object"
          ) {
            const lvm = obj.lockupViewModel as Record<string, unknown>;
            const videoId =
              typeof lvm.contentId === "string" ? lvm.contentId.trim() : "";
            const contentType = String(lvm.contentType || "");
            if (
              videoId &&
              (!contentType || contentType === "LOCKUP_CONTENT_TYPE_VIDEO") &&
              !seenIds.has(videoId)
            ) {
              const metaVm = (
                lvm.metadata as {
                  lockupMetadataViewModel?: {
                    title?: { content?: string };
                    metadata?: {
                      contentMetadataViewModel?: {
                        metadataRows?: Array<{
                          metadataParts?: Array<{
                            text?: { content?: string };
                          }>;
                        }>;
                      };
                    };
                  };
                }
              )?.lockupMetadataViewModel;

              const rawTitle = String(metaVm?.title?.content || "").trim();
              const rawAuthor = String(
                metaVm?.metadata?.contentMetadataViewModel?.metadataRows?.[0]
                  ?.metadataParts?.[0]?.text?.content || ""
              ).trim();

              if (
                rawTitle &&
                rawTitle !== "[Private video]" &&
                rawTitle !== "[Deleted video]" &&
                rawTitle !== "[Privates Video]" &&
                rawTitle !== "[Gelöschtes Video]"
              ) {
                seenIds.add(videoId);
                const { title, artist } = splitTitleAndArtist(
                  rawTitle,
                  rawAuthor
                );
                tracks.push({
                  title,
                  artist,
                  platform: "YOUTUBE",
                  externalId: videoId,
                  sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
                  embedUrl: `https://www.youtube.com/embed/${videoId}`,
                  thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                  previewAudioUrl: "",
                  startSeconds: 0,
                });
              }
            }
          }

          // Classic YouTube playlistVideoRenderer & playlistPanelVideoRenderer
          const videoRenderer = (obj.playlistVideoRenderer ||
            obj.playlistPanelVideoRenderer) as
            | Record<string, unknown>
            | undefined;

          if (videoRenderer && typeof videoRenderer === "object") {
            const pvr = videoRenderer;
            const videoId =
              typeof pvr.videoId === "string" ? pvr.videoId.trim() : "";
            if (videoId && !seenIds.has(videoId)) {
              seenIds.add(videoId);
              let rawTitle = "";
              const titleObj = pvr.title as
                | {
                    runs?: Array<{ text?: string }>;
                    simpleText?: string;
                  }
                | undefined;
              if (titleObj?.runs?.[0]?.text) {
                rawTitle = titleObj.runs.map((r) => r.text || "").join("");
              } else if (titleObj?.simpleText) {
                rawTitle = titleObj.simpleText;
              }

              let rawAuthor = "";
              const bylineObj = (pvr.shortBylineText || pvr.longBylineText) as
                | { runs?: Array<{ text?: string }> }
                | undefined;
              if (bylineObj?.runs?.[0]?.text) {
                rawAuthor = bylineObj.runs[0].text;
              }

              const lengthSec = Number(pvr.lengthSeconds || 0);
              const { title, artist } = splitTitleAndArtist(
                rawTitle,
                rawAuthor
              );

              if (
                title &&
                title !== "[Private video]" &&
                title !== "[Deleted video]" &&
                title !== "[Privates Video]" &&
                title !== "[Gelöschtes Video]"
              ) {
                tracks.push({
                  title,
                  artist,
                  platform: "YOUTUBE",
                  externalId: videoId,
                  sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
                  embedUrl: `https://www.youtube.com/embed/${videoId}`,
                  thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                  previewAudioUrl: "",
                  startSeconds: 0,
                  durationMs: lengthSec > 0 ? lengthSec * 1000 : undefined,
                });
              }
            }
          }

          for (const key of Object.keys(obj)) {
            if (
              key !== "playlistVideoRenderer" &&
              key !== "playlistPanelVideoRenderer" &&
              key !== "lockupViewModel"
            ) {
              walk(obj[key]);
            }
          }
        };

        walk(initialData);
      }
    }
  } catch {
    // Fallback to XML feed below
  }

  // Fallback: YouTube public XML feed for playlists
  if (tracks.length === 0) {
    try {
      const feedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(
        listId
      )}`;
      const feedRes = await fetch(feedUrl, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(6000),
      });
      if (feedRes.ok) {
        const xml = await feedRes.text();
        const feedTitleMatch = xml.match(/<title>([^<]+)<\/title>/);
        if (feedTitleMatch?.[1]) {
          playlistTitle = feedTitleMatch[1].trim();
        }
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let match: RegExpExecArray | null;
        while ((match = entryRegex.exec(xml)) !== null) {
          const block = match[1];
          const vidMatch = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
          const titleMatch = block.match(/<title>([^<]+)<\/title>/);
          const authorMatch = block.match(
            /<author>\s*<name>([^<]+)<\/name>\s*<\/author>/
          );
          const videoId = vidMatch?.[1]?.trim() || "";
          if (videoId && !seenIds.has(videoId)) {
            seenIds.add(videoId);
            const { title, artist } = splitTitleAndArtist(
              titleMatch?.[1] || "",
              authorMatch?.[1] || ""
            );
            tracks.push({
              title: title || `YouTube Video (${videoId})`,
              artist,
              platform: "YOUTUBE",
              externalId: videoId,
              sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
              embedUrl: `https://www.youtube.com/embed/${videoId}`,
              thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              previewAudioUrl: "",
              startSeconds: 0,
            });
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  return { playlistTitle, tracks };
}

function parseSpotifyEmbedNextData(html: string): Record<string, unknown> | null {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return (
      parsed?.props?.pageProps?.state?.data?.entity ||
      parsed?.props?.pageProps?.state?.data ||
      null
    );
  } catch {
    return null;
  }
}

async function resolveSpotifyTrack(
  trackId: string,
  startSeconds = 0
): Promise<ResolvedTrackMetadata> {
  const sourceUrl = `https://open.spotify.com/track/${trackId}`;
  const embedUrl = `https://open.spotify.com/embed/track/${trackId}?utm_source=generator`;

  let title = "";
  let artist = "";
  let thumbnailUrl = "";
  let previewAudioUrl = "";
  let durationMs: number | undefined;

  try {
    const embedRes = await fetch(
      `https://open.spotify.com/embed/track/${trackId}`,
      {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(7000),
      }
    );
    if (embedRes.ok) {
      const html = await embedRes.text();
      const entity = parseSpotifyEmbedNextData(html);
      if (entity) {
        title = String(entity.title || entity.name || "").trim();
        if (Array.isArray(entity.artists)) {
          artist = entity.artists
            .map((a: { name?: string }) => a?.name || "")
            .filter(Boolean)
            .join(", ");
        } else if (typeof entity.subtitle === "string") {
          artist = entity.subtitle.replace(/\u00a0/g, " ").trim();
        }

        const visualImages = (
          entity.visualIdentity as { image?: Array<{ url?: string }> }
        )?.image;
        const coverSources = (
          entity.coverArt as { sources?: Array<{ url?: string }> }
        )?.sources;
        if (Array.isArray(visualImages) && visualImages.length > 0) {
          thumbnailUrl =
            visualImages[visualImages.length - 1]?.url ||
            visualImages[0]?.url ||
            "";
        } else if (Array.isArray(coverSources) && coverSources.length > 0) {
          thumbnailUrl = coverSources[0]?.url || "";
        }

        const audioPreview = entity.audioPreview as { url?: string } | undefined;
        if (audioPreview?.url) {
          previewAudioUrl = audioPreview.url;
        }
        if (typeof entity.duration === "number") {
          durationMs = entity.duration;
        }
      }
    }
  } catch {
    // Fallback to oembed below
  }

  if (!title || !thumbnailUrl) {
    try {
      const oembedRes = await fetch(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(sourceUrl)}`,
        {
          headers: BROWSER_HEADERS,
          signal: AbortSignal.timeout(5000),
        }
      );
      if (oembedRes.ok) {
        const oData = await oembedRes.json();
        if (!title && oData.title) title = String(oData.title).trim();
        if (!thumbnailUrl && oData.thumbnail_url)
          thumbnailUrl = String(oData.thumbnail_url).trim();
      }
    } catch {
      // Ignore
    }
  }

  return {
    title: title || `Spotify Track (${trackId})`,
    artist,
    platform: "SPOTIFY",
    externalId: trackId,
    sourceUrl,
    embedUrl,
    thumbnailUrl,
    previewAudioUrl,
    startSeconds,
    durationMs,
  };
}

async function resolveSpotifyCollection(
  kind: "playlist" | "album",
  collectionId: string
): Promise<{
  playlistTitle: string;
  tracks: ResolvedTrackMetadata[];
}> {
  let playlistTitle =
    kind === "album" ? "Spotify Album" : "Spotify Playlist";
  const tracks: ResolvedTrackMetadata[] = [];

  try {
    const embedRes = await fetch(
      `https://open.spotify.com/embed/${kind}/${collectionId}`,
      {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(9000),
      }
    );
    if (embedRes.ok) {
      const html = await embedRes.text();
      const entity = parseSpotifyEmbedNextData(html);
      if (entity) {
        if (typeof entity.title === "string" || typeof entity.name === "string") {
          playlistTitle = String(entity.title || entity.name).trim();
        }
        const visualImages = (
          entity.visualIdentity as { image?: Array<{ url?: string }> }
        )?.image;
        const coverSources = (
          entity.coverArt as { sources?: Array<{ url?: string }> }
        )?.sources;
        const defaultThumb =
          visualImages?.[0]?.url || coverSources?.[0]?.url || "";

        const trackList = Array.isArray(entity.trackList)
          ? (entity.trackList as Array<{
              uri?: string;
              title?: string;
              subtitle?: string;
              duration?: number;
              audioPreview?: { url?: string };
            }>)
          : [];

        for (const item of trackList) {
          const uri = item.uri || "";
          const parts = uri.split(":");
          const trackId = parts[parts.length - 1] || "";
          if (!trackId) continue;

          const title = (item.title || "").replace(/\u00a0/g, " ").trim();
          const artist = (item.subtitle || "").replace(/\u00a0/g, " ").trim();
          if (!title) continue;

          tracks.push({
            title,
            artist,
            platform: "SPOTIFY",
            externalId: trackId,
            sourceUrl: `https://open.spotify.com/track/${trackId}`,
            embedUrl: `https://open.spotify.com/embed/track/${trackId}?utm_source=generator`,
            thumbnailUrl: defaultThumb,
            previewAudioUrl: item.audioPreview?.url || "",
            startSeconds: 0,
            durationMs: item.duration,
          });
        }

        // Enrich first 24 tracks with individual Spotify oEmbed cover art in parallel (fast)
        const toEnrich = tracks.slice(0, 24);
        await Promise.allSettled(
          toEnrich.map(async (tr) => {
            try {
              const r = await fetch(
                `https://open.spotify.com/oembed?url=${encodeURIComponent(
                  tr.sourceUrl
                )}`,
                { signal: AbortSignal.timeout(2200) }
              );
              if (r.ok) {
                const d = await r.json();
                if (d?.thumbnail_url) {
                  tr.thumbnailUrl = d.thumbnail_url;
                }
              }
            } catch {
              // keep defaultThumb
            }
          })
        );
      }
    }
  } catch (err) {
    console.error("Failed to resolve Spotify collection:", err);
  }

  return { playlistTitle, tracks };
}

export async function POST(req: NextRequest) {
  try {
    await ensurePersistentDataLoaded();
    const body = await req.json();
    const rawUrl = String(body.url || "").trim();

    if (!rawUrl) {
      return NextResponse.json(
        { error: "Bitte gib einen gültigen YouTube- oder Spotify-Link ein." },
        { status: 400 }
      );
    }

    // Load existing proposals and repertoire pieces to flag duplicates
    const [existingProposals, existingPieces] = await Promise.all([
      prisma.songProposal.findMany({
        select: { platform: true, externalId: true, title: true, artist: true },
      }),
      prisma.piece.findMany({
        select: { title: true },
      }),
    ]);
    const existingKeys = new Set(
      existingProposals
        .filter((p) => p.externalId)
        .map((p) => `${p.platform}:${p.externalId}`)
    );

    const normalizeSongTitle = (raw: string): string =>
      (raw || "")
        .toLowerCase()
        .replace(/[\(\[][^\)\]]*[\)\]]/g, " ")
        .replace(/[^a-z0-9äöüß]+/gi, " ")
        .trim();

    const existingProposalTitles = new Set(
      existingProposals.map((p) => normalizeSongTitle(p.title)).filter(Boolean)
    );
    const existingPieceTitles = new Set(
      existingPieces.map((p) => normalizeSongTitle(p.title)).filter(Boolean)
    );

    const markExists = (t: ResolvedTrackMetadata): ResolvedTrackMetadata => {
      const normTitle = normalizeSongTitle(t.title);
      const inRep = Boolean(normTitle && existingPieceTitles.has(normTitle));
      const inProps = Boolean(
        (t.externalId && existingKeys.has(`${t.platform}:${t.externalId}`)) ||
          (normTitle && existingProposalTitles.has(normTitle))
      );
      return {
        ...t,
        alreadyExists: inProps || inRep,
        alreadyInRepertoire: inRep,
      };
    };

    // 1. Handle spotify: URIs directly
    if (rawUrl.startsWith("spotify:")) {
      const parts = rawUrl.split(":");
      const type = parts[1];
      const id = parts[2];
      if (type === "track" && id) {
        const track = markExists(await resolveSpotifyTrack(id, 0));
        return NextResponse.json({
          kind: "single",
          platform: "SPOTIFY",
          track,
          tracks: [track],
        });
      }
      if ((type === "playlist" || type === "album") && id) {
        const { playlistTitle, tracks } = await resolveSpotifyCollection(
          type,
          id
        );
        return NextResponse.json({
          kind: "playlist",
          platform: "SPOTIFY",
          playlistTitle,
          tracks: tracks.map(markExists),
        });
      }
    }

    // Parse URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(
        rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
          ? rawUrl
          : `https://${rawUrl}`
      );
    } catch {
      return NextResponse.json(
        {
          error:
            "Ungültige URL. Bitte füge einen Link von YouTube oder Spotify ein.",
        },
        { status: 400 }
      );
    }

    let host = parsedUrl.hostname.toLowerCase();

    if (host.includes("spotify.link") || host.includes("spoti.fi")) {
      try {
        const redirRes = await fetch(parsedUrl.toString(), {
          headers: BROWSER_HEADERS,
          redirect: "follow",
          signal: AbortSignal.timeout(5000),
        });
        if (redirRes.url) {
          parsedUrl = new URL(redirRes.url);
          host = parsedUrl.hostname.toLowerCase();
        }
      } catch {
        // ignore
      }
    }

    // =========================================================================
    // SPOTIFY LINKS
    // =========================================================================
    if (host.includes("spotify.com")) {
      const trackMatch = parsedUrl.pathname.match(/\/track\/([a-zA-Z0-9]+)/);
      if (trackMatch?.[1]) {
        const track = markExists(await resolveSpotifyTrack(trackMatch[1], 0));
        return NextResponse.json({
          kind: "single",
          platform: "SPOTIFY",
          track,
          tracks: [track],
        });
      }

      const playlistMatch = parsedUrl.pathname.match(
        /\/(playlist|album)\/([a-zA-Z0-9]+)/
      );
      if (playlistMatch?.[1] && playlistMatch?.[2]) {
        const kind = playlistMatch[1] as "playlist" | "album";
        const { playlistTitle, tracks } = await resolveSpotifyCollection(
          kind,
          playlistMatch[2]
        );
        if (tracks.length === 0) {
          return NextResponse.json(
            {
              error:
                "Die Spotify-Playlist konnte nicht ausgelesen werden oder ist privat.",
            },
            { status: 422 }
          );
        }
        return NextResponse.json({
          kind: "playlist",
          platform: "SPOTIFY",
          playlistTitle,
          tracks: tracks.map(markExists),
        });
      }

      return NextResponse.json(
        {
          error:
            "Bitte füge einen direkten Spotify-Track-, Album- oder Playlist-Link ein.",
        },
        { status: 400 }
      );
    }

    // =========================================================================
    // YOUTUBE LINKS
    // =========================================================================
    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      const listId = parsedUrl.searchParams.get("list") || "";
      let videoId = "";

      if (host.includes("youtu.be")) {
        videoId = parsedUrl.pathname.replace(/^\//, "").split("/")[0] || "";
      } else if (parsedUrl.pathname.startsWith("/watch")) {
        videoId = parsedUrl.searchParams.get("v") || "";
      } else if (parsedUrl.pathname.startsWith("/shorts/")) {
        videoId = parsedUrl.pathname.split("/")[2] || "";
      } else if (parsedUrl.pathname.startsWith("/embed/")) {
        videoId = parsedUrl.pathname.split("/")[2] || "";
      }

      const startSeconds = parseTimeOffsetToSeconds(
        parsedUrl.searchParams.get("t") ||
          parsedUrl.searchParams.get("start") ||
          ""
      );

      // Pure playlist link OR user explicitly requested playlist extraction
      if (
        (parsedUrl.pathname.startsWith("/playlist") && listId) ||
        (!videoId && listId)
      ) {
        const { playlistTitle, tracks } = await resolveYouTubePlaylist(listId);
        if (tracks.length === 0) {
          return NextResponse.json(
            {
              error:
                "Die YouTube-Playlist konnte nicht geladen werden (ggf. privat oder leer).",
            },
            { status: 422 }
          );
        }
        return NextResponse.json({
          kind: "playlist",
          platform: "YOUTUBE",
          playlistTitle,
          tracks: tracks.map(markExists),
        });
      }

      // Single video (optionally with a &list= parameter attached)
      if (videoId) {
        const singleTrack = markExists(
          await resolveYouTubeSingleVideo(videoId, startSeconds)
        );

        // If the URL also has a non-radio playlist parameter, resolve playlist in parallel so user can choose
        if (listId && !listId.startsWith("RD")) {
          const { playlistTitle, tracks } = await resolveYouTubePlaylist(listId);
          if (tracks.length > 1) {
            return NextResponse.json({
              kind: body.preferPlaylist ? "playlist" : "single",
              platform: "YOUTUBE",
              track: singleTrack,
              playlistTitle,
              tracks: tracks.map(markExists),
              hasPlaylistOption: true,
            });
          }
        }

        return NextResponse.json({
          kind: "single",
          platform: "YOUTUBE",
          track: singleTrack,
          tracks: [singleTrack],
        });
      }

      return NextResponse.json(
        {
          error:
            "Konnte keine YouTube-Video-ID oder Playlist-ID im Link finden.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error:
          "Nur Links von YouTube (youtube.com / youtu.be) und Spotify (open.spotify.com) werden unterstützt.",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error in POST /api/proposals/resolve:", error);
    return NextResponse.json(
      { error: "Metadaten konnten nicht vom Link geladen werden." },
      { status: 500 }
    );
  }
}
