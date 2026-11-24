import { NextRequest, NextResponse } from "next/server";
import {
  ensurePersistentDataLoaded,
  prisma,
  savePersistentSnapshot,
} from "@/lib/prisma";
import {
  getUnderstaffedRegistersForSession,
  normalizeTags,
  recalculateSchedule,
  splitTags,
} from "@/lib/scheduler";
import { getRegisterFamily, SessionAttendanceEntry } from "@/types";

function mapToStandardInstrument(raw: string): string {
  const s = (raw || "").trim();
  const low = s.toLowerCase();
  if (!low) return "";
  if (low.includes("altsax") || low.includes("alt-sax") || low.includes("alto"))
    return "Altsaxophon";
  if (low.includes("tenorsax") || low.includes("tenor")) return "Tenorsaxophon";
  if (low.includes("baritonsax") || low.includes("bari"))
    return "Baritonsaxophon";
  if (low.includes("sax")) return "Altsaxophon";
  if (low.includes("posaune") || low.includes("trombone")) return "Posaune";
  if (
    low.includes("trompete") ||
    low.includes("flügelhorn") ||
    low.includes("trumpet")
  )
    return "Trompete";
  if (
    low.includes("klarinette") ||
    low.includes("flöte") ||
    low.includes("holz")
  )
    return "Klarinette / Holz";
  if (
    low.includes("klavier") ||
    low.includes("piano") ||
    low.includes("key") ||
    low.includes("epiano")
  )
    return "Klavier / Keys";
  if (low.includes("gitarre") || low.includes("guitar")) return "Gitarre";
  if (low.includes("bass") && !low.includes("posaune") && !low.includes("klar"))
    return "Bass";
  if (
    low.includes("schlagzeug") ||
    low.includes("drum") ||
    low.includes("percussion")
  )
    return "Schlagzeug";
  if (
    low.includes("gesang") ||
    low.includes("vokal") ||
    low.includes("sänger") ||
    low.includes("vocal")
  )
    return "Gesang";
  if (
    low.includes("dirigent") ||
    low.includes("leitung") ||
    low.includes("bandleader")
  )
    return "Dirigent / Leitung";
  return s;
}

function parseIcalDate(raw: string): Date | null {
  const clean = (raw || "").trim();
  if (!clean) return null;
  // Format: 20261127T193000Z or 20261127T193000 or 20261127
  const m = clean.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/
  );
  if (!m) {
    const d = new Date(clean);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const hour = Number(m[4] || 19);
  const minute = Number(m[5] || 30);
  const second = Number(m[6] || 0);
  if (m[7] === "Z") {
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }
  return new Date(year, month, day, hour, minute, second);
}

interface ParsedAppointment {
  konzertmeisterId: string;
  title: string;
  kind: "REHEARSAL" | "CONCERT";
  scheduledDate: Date | null;
  location: string;
  additionalInfo: string;
  attendance: SessionAttendanceEntry[];
}

function parseIcalContent(
  icsText: string,
  filterKeyword: string
): ParsedAppointment[] {
  const unfolded = icsText.replace(/\r?\n[ \t]/g, "");
  const blocks = unfolded.split("BEGIN:VEVENT").slice(1);
  const results: ParsedAppointment[] = [];
  const kw = filterKeyword.trim().toLowerCase();

  for (const block of blocks) {
    const endIdx = block.indexOf("END:VEVENT");
    const content = endIdx !== -1 ? block.slice(0, endIdx) : block;
    const lines = content.split(/\r?\n/);

    let uid = "";
    let summary = "";
    let location = "";
    let description = "";
    let dtStart: Date | null = null;

    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const keyPart = line.slice(0, colonIdx).toUpperCase();
      const val = line
        .slice(colonIdx + 1)
        .replace(/\\n/g, "\n")
        .replace(/\\,/g, ",")
        .replace(/\\;/g, ";")
        .trim();

      if (keyPart === "UID" || keyPart.startsWith("UID;")) uid = val;
      else if (keyPart === "SUMMARY" || keyPart.startsWith("SUMMARY;"))
        summary = val;
      else if (keyPart === "LOCATION" || keyPart.startsWith("LOCATION;"))
        location = val;
      else if (keyPart === "DESCRIPTION" || keyPart.startsWith("DESCRIPTION;"))
        description = val;
      else if (keyPart === "DTSTART" || keyPart.startsWith("DTSTART;"))
        dtStart = parseIcalDate(val);
    }

    if (!summary) continue;
    const combinedText = `${summary} ${description} ${location}`.toLowerCase();
    if (kw && !combinedText.includes(kw)) {
      continue;
    }

    const isConcert =
      summary.toLowerCase().includes("auftritt") ||
      summary.toLowerCase().includes("konzert") ||
      summary.toLowerCase().includes("dance & talk") ||
      summary.toLowerCase().includes("dance and talk");

    results.push({
      konzertmeisterId: uid || `ical-${summary}-${dtStart?.toISOString() || ""}`,
      title: summary,
      kind: isConcert ? "CONCERT" : "REHEARSAL",
      scheduledDate: dtStart,
      location,
      additionalInfo: description,
      attendance: parseAttendanceFromText(description),
    });
  }

  return results;
}

/**
 * Parses Konzertmeister attendance text / CSV / copy-pasted web view into SessionAttendanceEntry[].
 * Supports:
 * - Register headings ("Saxophon", "Posaune", "Trompete", "Rhythmusgruppe", "Gesang", etc.)
 * - Status headings ("Zugesagt", "Anwesend", "Abgesagt", "Abwesend", "Vielleicht")
 * - CSV / semicolon / tab lines: "Name;Instrument;Zugesagt;Kommentar"
 * - Inline format: "Max Mustermann (Altsaxophon) - Abgesagt"
 */
function parseAttendanceFromText(
  rawText: string
): SessionAttendanceEntry[] {
  if (!rawText || !rawText.trim()) return [];
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const entries: SessionAttendanceEntry[] = [];
  const seenNames = new Set<string>();

  let currentStatus: "PRESENT" | "ABSENT" | "MAYBE" = "PRESENT";
  let currentInstrument = "";

  const statusHeaderRegex =
    /^(?:[✗✘❌✓✔✅\+\-\?❓•\*]\s*)?(zugesagt|anwesend|dabei|positive|ja|abgesagt|abwesend|nicht dabei|negative|nein|vielleicht|unsicher|maybe)(?:\s*[\(\[]\s*\d+(?:\s*\/\s*\d+)?\s*[\)\]])?(?:\s*[-–—:]\s*\d+)?\s*:?$/i;

  const instrumentHeaderKeywords = [
    "posaune",
    "trompete",
    "flügelhorn",
    "altsax",
    "tenorsax",
    "baritonsax",
    "saxophon",
    "saxofon",
    "klarinette",
    "flöte",
    "holz",
    "blech",
    "bläser",
    "klavier",
    "keyboard",
    "piano",
    "keys",
    "gitarre",
    "bass",
    "schlagzeug",
    "drums",
    "percussion",
    "rhythmusgruppe",
    "rhythmus",
    "gesang",
    "vokal",
    "sänger",
    "dirigent",
    "leitung",
  ];

  for (const line of lines) {
    const low = line.toLowerCase();

    // Skip obvious metadata lines
    if (
      low.startsWith("http://") ||
      low.startsWith("https://") ||
      low.startsWith("begin:") ||
      low.startsWith("end:")
    ) {
      continue;
    }

    // 1. Check if line is a pure status header like "Zugesagt (14)" or "Abgesagt (4)"
    const statusMatch = line.match(statusHeaderRegex);
    if (statusMatch) {
      const word = statusMatch[1].toLowerCase();
      if (
        word.startsWith("ab") ||
        word === "negative" ||
        word === "nein" ||
        word.startsWith("nicht")
      ) {
        currentStatus = "ABSENT";
      } else if (
        word === "vielleicht" ||
        word === "unsicher" ||
        word === "maybe"
      ) {
        currentStatus = "MAYBE";
      } else {
        currentStatus = "PRESENT";
      }
      continue;
    }

    // 2. Check if line is a Register / Instrument section header like "Saxophon (2 / 4)" or "Rhythmusgruppe:"
    const strippedCounts = line
      .replace(/[\(\[]\s*\d+(?:\s*\/\s*\d+)?\s*[\)\]]/g, "")
      .replace(/:$/, "")
      .trim();
    const strippedLow = strippedCounts.toLowerCase();
    if (
      strippedCounts.length <= 32 &&
      !line.includes(";") &&
      !line.includes("\t") &&
      !/^[✗✘❌✓✔✅\+\?❓]\s+/.test(line) &&
      !/\b(zugesagt|abgesagt|anwesend|abwesend|vielleicht)\b/i.test(line) &&
      instrumentHeaderKeywords.some(
        (kw) =>
          strippedLow === kw ||
          strippedLow === `${kw}e` ||
          strippedLow === `${kw}n` ||
          strippedLow === `${kw}gruppe` ||
          strippedLow === `${kw}satz` ||
          strippedLow === `${kw}-satz` ||
          strippedLow === `${kw}register` ||
          strippedLow === `${kw}-register` ||
          strippedLow.startsWith(`${kw} `)
      )
    ) {
      currentInstrument = mapToStandardInstrument(strippedCounts);
      continue;
    }

    // 3. Check CSV / semicolon / tab / comma separated line: Name ; Instrument ; Status ; Comment
    const isCommaCsv =
      !line.includes(";") &&
      !line.includes("\t") &&
      line.split(",").length >= 3 &&
      /\b(zugesagt|abgesagt|anwesend|abwesend|vielleicht|positive|negative|maybe)\b/i.test(
        line
      );
    if (line.includes(";") || line.includes("\t") || isCommaCsv) {
      const parts = (isCommaCsv ? line.split(",") : line.split(/[;\t]/))
        .map((p) => p.trim().replace(/^"|"$/g, ""));
      if (parts.length >= 2) {
        const firstLow = parts[0].toLowerCase();
        if (
          firstLow === "name" ||
          firstLow === "vorname" ||
          firstLow === "mitglied" ||
          firstLow === "termin"
        ) {
          continue; // CSV header
        }

        let name = parts[0];
        let inst = currentInstrument;
        let status: "PRESENT" | "ABSENT" | "MAYBE" = currentStatus;
        let comment = "";

        for (let i = 1; i < parts.length; i++) {
          const cell = parts[i];
          const cellLow = cell.toLowerCase();
          if (
            cellLow === "zugesagt" ||
            cellLow === "anwesend" ||
            cellLow === "positive" ||
            cellLow === "ja" ||
            cellLow === "+" ||
            cellLow === "1"
          ) {
            status = "PRESENT";
          } else if (
            cellLow === "abgesagt" ||
            cellLow === "abwesend" ||
            cellLow === "negative" ||
            cellLow === "nein" ||
            cellLow === "-" ||
            cellLow === "0"
          ) {
            status = "ABSENT";
          } else if (
            cellLow === "vielleicht" ||
            cellLow === "maybe" ||
            cellLow === "?"
          ) {
            status = "MAYBE";
          } else if (
            instrumentHeaderKeywords.some((kw) => cellLow.includes(kw))
          ) {
            inst = mapToStandardInstrument(cell);
          } else if (cell && !comment) {
            comment = cell;
          }
        }

        if (name && name.length >= 2) {
          const key = name.toLowerCase();
          if (!seenNames.has(key)) {
            seenNames.add(key);
            entries.push({
              userName: name,
              instrument: inst,
              registerFamily: getRegisterFamily(inst),
              status,
              comment,
              updatedAt: new Date().toISOString(),
            });
          }
          continue;
        }
      }
    }

    // 4. Parse natural line from Konzertmeister web view:
    // e.g. "Max Mustermann (Altsaxophon) - Abgesagt: Urlaub"
    // or "✓ Lisa Beispiel (Gesang)" or "✗ Tom Posaune (Posaune)"
    let status: "PRESENT" | "ABSENT" | "MAYBE" = currentStatus;
    let working = line;

    if (/^[✗✘❌\-]\s+/.test(working) || /\b(abgesagt|abwesend|fehlt)\b/i.test(working)) {
      status = "ABSENT";
    } else if (/^[✓✔✅\+]\s+/.test(working) || /\b(zugesagt|anwesend|dabei)\b/i.test(working)) {
      status = "PRESENT";
    } else if (/^[\?❓]\s+/.test(working) || /\b(vielleicht|unsicher)\b/i.test(working)) {
      status = "MAYBE";
    }

    working = working.replace(/^[✗✘❌✓✔✅\+\-\?❓•\*]\s*/, "").trim();

    let extractedInstrument = currentInstrument;
    const parenMatch = working.match(/\(([^)]+)\)/);
    if (parenMatch) {
      const inside = parenMatch[1].trim();
      if (
        instrumentHeaderKeywords.some((kw) =>
          inside.toLowerCase().includes(kw)
        )
      ) {
        extractedInstrument = mapToStandardInstrument(inside);
        working = working.replace(parenMatch[0], "").trim();
      }
    }

    let comment = "";
    const statusSplit = working.split(
      /\s*[-–—:]\s*(?:zugesagt|abgesagt|anwesend|abwesend|vielleicht)\s*[:\-–—]?\s*/i
    );
    if (statusSplit.length > 1) {
      working = statusSplit[0].trim();
      comment = statusSplit.slice(1).join(" ").trim();
    } else if (working.includes(":")) {
      const colonParts = working.split(":");
      if (colonParts[0].trim().length >= 2) {
        working = colonParts[0].trim();
        comment = colonParts.slice(1).join(":").trim();
      }
    }

    // Also check if instrument is written after a dash/comma: "Max Mustermann - Tenorsaxophon"
    if (working.includes(" - ") || working.includes(", ")) {
      const segs = working.split(/\s+-\s+|,\s+/);
      if (segs.length >= 2) {
        const tail = segs[segs.length - 1].trim();
        if (
          instrumentHeaderKeywords.some((kw) => tail.toLowerCase().includes(kw))
        ) {
          extractedInstrument = mapToStandardInstrument(tail);
          working = segs.slice(0, -1).join(" ").trim();
        }
      }
    }

    const cleanName = working
      .replace(/\b(zugesagt|abgesagt|anwesend|abwesend|vielleicht)\b/gi, "")
      .replace(/[\(\[]\s*\d+(?:\s*\/\s*\d+)?\s*[\)\]]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (
      cleanName.length >= 2 &&
      cleanName.length <= 50 &&
      /[a-zA-ZäöüÄÖÜß]{2,}/.test(cleanName)
    ) {
      const key = cleanName.toLowerCase();
      if (!seenNames.has(key)) {
        seenNames.add(key);
        entries.push({
          userName: cleanName,
          instrument: extractedInstrument,
          registerFamily: getRegisterFamily(extractedInstrument),
          status,
          comment,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  return entries;
}

/**
 * Applies attendance entries to a session, syncing:
 * - User records (creating/updating their `instrument`)
 * - `presentSingers` (matching repertoire singers against PRESENT/ABSENT attendees)
 * - `absentSoloists` (matching repertoire soloists against ABSENT attendees)
 * - `absentInstruments` (registers where too many players are ABSENT, e.g. "Saxophon")
 */
async function applyAttendanceToSession(
  sessionId: string,
  attendance: SessionAttendanceEntry[]
) {
  const [allUsers, allPieces, session] = await Promise.all([
    prisma.user.findMany(),
    prisma.piece.findMany({ select: { singers: true, soloists: true } }),
    prisma.rehearsalSession.findUnique({ where: { id: sessionId } }),
  ]);

  if (!session) return null;

  const userByNameLower = new Map(
    allUsers.map((u) => [u.name.toLowerCase(), u])
  );

  // Sync user instruments
  for (const entry of attendance) {
    const lower = entry.userName.toLowerCase();
    // Also match by first name if unique
    const firstName = lower.split(/\s+/)[0];
    let matchedUser = userByNameLower.get(lower);
    if (!matchedUser && firstName.length >= 3) {
      const firstMatches = allUsers.filter(
        (u) => u.name.toLowerCase().split(/\s+/)[0] === firstName
      );
      if (firstMatches.length === 1) {
        matchedUser = firstMatches[0];
      }
    }

    if (matchedUser) {
      entry.userId = matchedUser.id;
      if (entry.instrument && entry.instrument !== matchedUser.instrument) {
        await prisma.user.update({
          where: { id: matchedUser.id },
          data: { instrument: entry.instrument },
        });
      } else if (!entry.instrument && matchedUser.instrument) {
        entry.instrument = matchedUser.instrument;
        entry.registerFamily = getRegisterFamily(matchedUser.instrument);
      }
    } else if (entry.instrument) {
      const created = await prisma.user.create({
        data: {
          name: entry.userName,
          instrument: entry.instrument,
        },
      });
      entry.userId = created.id;
      userByNameLower.set(lower, created);
    }
  }

  // Collect known repertoire singers and soloists
  const knownSingers = new Set<string>();
  const knownSoloists = new Set<string>();
  for (const p of allPieces) {
    for (const s of splitTags(p.singers)) {
      if (!s.toLowerCase().includes("rhythmusgruppe")) knownSingers.add(s);
    }
    for (const sol of splitTags(p.soloists)) {
      knownSoloists.add(sol);
    }
  }

  const matchesPerson = (attendeeName: string, tagName: string): boolean => {
    const aLow = attendeeName.toLowerCase().trim();
    const tLow = tagName.toLowerCase().trim();
    if (!aLow || !tLow) return false;
    if (aLow === tLow) return true;
    const aFirst = aLow.split(/\s+/)[0];
    const tFirst = tLow.split(/\s+/)[0];
    return aFirst.length >= 3 && aFirst === tFirst;
  };

  // Derive presentSingers if any known singers are in the attendance list
  const presentSingersSet = new Set<string>(splitTags(session.presentSingers));
  const absentSingerFound = attendance.some(
    (a) =>
      a.status === "ABSENT" &&
      (a.instrument === "Gesang" ||
        Array.from(knownSingers).some((ks) => matchesPerson(a.userName, ks)))
  );
  const presentSingersFromAttendance: string[] = [];
  for (const ks of knownSingers) {
    const att = attendance.find((a) => matchesPerson(a.userName, ks));
    if (att && att.status === "PRESENT") {
      presentSingersFromAttendance.push(ks);
    }
  }
  if (absentSingerFound && presentSingersFromAttendance.length > 0) {
    presentSingersSet.clear();
    presentSingersFromAttendance.forEach((s) => presentSingersSet.add(s));
  }

  // Derive absentSoloists
  const absentSoloistsSet = new Set<string>(splitTags(session.absentSoloists));
  for (const sol of knownSoloists) {
    const att = attendance.find((a) => matchesPerson(a.userName, sol));
    if (att) {
      if (att.status === "ABSENT") absentSoloistsSet.add(sol);
      else if (att.status === "PRESENT") absentSoloistsSet.delete(sol);
    }
  }

  const attendanceJson = JSON.stringify(attendance);
  const understaffedRegisters = getUnderstaffedRegistersForSession(
    "",
    attendanceJson
  );

  const updated = await prisma.rehearsalSession.update({
    where: { id: sessionId },
    data: {
      attendanceJson,
      presentSingers: normalizeTags(Array.from(presentSingersSet)),
      absentSoloists: normalizeTags(Array.from(absentSoloistsSet)),
      absentInstruments: normalizeTags(understaffedRegisters),
    },
  });

  return {
    session: updated,
    understaffedRegisters,
    presentCount: attendance.filter((a) => a.status === "PRESENT").length,
    absentCount: attendance.filter((a) => a.status === "ABSENT").length,
  };
}

export async function POST(req: NextRequest) {
  try {
    await ensurePersistentDataLoaded();
    const body = await req.json();
    const mode = String(body.mode || "PASTE_ATTENDANCE");
    const filterKeyword = String(body.filterKeyword ?? "").trim();

    // =========================================================================
    // MODE 1: KONZERTMEISTER OFFICIAL REST API (X-KM-ORG-API-KEY)
    // =========================================================================
    if (mode === "REST_API") {
      const apiKey = String(body.apiKey || "").trim();
      if (!apiKey) {
        return NextResponse.json(
          {
            error:
              "Bitte gib den Konzertmeister API-Key (X-KM-ORG-API-KEY) ein.",
          },
          { status: 400 }
        );
      }

      const headers = {
        "Content-Type": "application/json",
        "X-KM-ORG-API-KEY": apiKey,
      };

      const [appRes, memRes] = await Promise.all([
        fetch("https://rest.konzertmeister.app/api/v4/org/m2m/appointments", {
          method: "POST",
          headers,
          body: JSON.stringify({
            typeIds: [1, 2, 3, 4, 5, 6],
            activationStatusList: ["ACTIVE"],
            publishedStatus: "ALL",
            dateMode: "UPCOMING",
            sortMode: "STARTDATE",
          }),
          signal: AbortSignal.timeout(10000),
        }),
        fetch("https://rest.konzertmeister.app/api/v4/org/m2m/members", {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(10000),
        }),
      ]);

      if (!appRes.ok) {
        return NextResponse.json(
          {
            error: `Konzertmeister API antwortete mit Status ${appRes.status}. Bitte prüfe den X-KM-ORG-API-KEY.`,
          },
          { status: 400 }
        );
      }

      const appointmentsRaw = await appRes.json();
      const membersRaw = memRes.ok ? await memRes.json() : [];

      // Map kmUserId -> instrument
      const memberInstrumentMap = new Map<number, string>();
      if (Array.isArray(membersRaw)) {
        for (const m of membersRaw) {
          const uid = Number(m.kmUserId || m.id);
          let inst = "";
          if (Array.isArray(m.properties)) {
            for (const prop of m.properties) {
              const val =
                prop?.valueSelectOption?.name || prop?.valueString || "";
              const mapped = mapToStandardInstrument(String(val));
              if (mapped) {
                inst = mapped;
                break;
              }
            }
          }
          if (uid && inst) memberInstrumentMap.set(uid, inst);
        }
      }

      const appointments = Array.isArray(appointmentsRaw)
        ? appointmentsRaw
        : [];
      const kw = filterKeyword.toLowerCase();

      let importedSessions = 0;
      let importedConcerts = 0;

      for (const app of appointments) {
        const name = String(app.name || "").trim();
        const desc = String(app.description || "").trim();
        const tagsStr = Array.isArray(app.tags) ? app.tags.join(" ") : "";
        const combined = `${name} ${desc} ${tagsStr}`.toLowerCase();
        if (kw && !combined.includes(kw)) continue;

        const kmId = String(app.id || "");
        const startDate = app.start ? new Date(app.start) : null;
        const loc = app.address
          ? [app.address.streetline1, app.address.postalCode, app.address.city]
              .filter(Boolean)
              .join(", ")
          : String(app.locationText || "");

        const isConcert =
          Number(app.typeId) === 2 ||
          name.toLowerCase().includes("auftritt") ||
          name.toLowerCase().includes("konzert") ||
          name.toLowerCase().includes("dance & talk");

        if (isConcert) {
          const existingConcert = kmId
            ? await prisma.concertEvent.findFirst({
                where: { konzertmeisterId: kmId },
              })
            : null;
          if (existingConcert) {
            await prisma.concertEvent.update({
              where: { id: existingConcert.id },
              data: {
                title: name,
                scheduledDate: startDate,
                location: loc,
                additionalInfo: desc,
              },
            });
          } else {
            await prisma.concertEvent.create({
              data: {
                title: name,
                scheduledDate: startDate,
                location: loc,
                additionalInfo: desc,
                konzertmeisterId: kmId,
              },
            });
          }
          importedConcerts++;
          continue;
        }

        // Fetch replies for this rehearsal appointment
        const attendance: SessionAttendanceEntry[] = [];
        if (kmId) {
          try {
            const attRes = await fetch(
              `https://rest.konzertmeister.app/api/v4/att/m2m/${encodeURIComponent(
                kmId
              )}`,
              { headers, signal: AbortSignal.timeout(8000) }
            );
            if (attRes.ok) {
              const replies = await attRes.json();
              if (Array.isArray(replies)) {
                for (const r of replies) {
                  const fullName = [r.kmUserFirstName, r.kmUserLastName]
                    .filter(Boolean)
                    .join(" ")
                    .trim();
                  if (!fullName) continue;
                  const inst =
                    memberInstrumentMap.get(Number(r.kmUserId)) || "";
                  const status: "PRESENT" | "ABSENT" | "MAYBE" =
                    r.reply === "NEGATIVE"
                      ? "ABSENT"
                      : r.reply === "MAYBE"
                      ? "MAYBE"
                      : r.reply === "POSITIVE"
                      ? "PRESENT"
                      : "MAYBE";
                  if (r.reply === "UNANSWERED") continue;
                  attendance.push({
                    userName: fullName,
                    instrument: inst,
                    registerFamily: getRegisterFamily(inst),
                    status,
                    comment: String(r.replyComment || "").trim(),
                    updatedAt: new Date().toISOString(),
                  });
                }
              }
            }
          } catch {
            // ignore single attendance fetch error
          }
        }

        let session = kmId
          ? await prisma.rehearsalSession.findFirst({
              where: { konzertmeisterId: kmId },
            })
          : null;

        if (!session && startDate) {
          // Match existing session on the same calendar day
          const allSess = await prisma.rehearsalSession.findMany();
          session =
            allSess.find(
              (s) =>
                s.scheduledDate &&
                s.scheduledDate.toISOString().slice(0, 10) ===
                  startDate.toISOString().slice(0, 10)
            ) || null;
        }

        if (!session) {
          const allSess = await prisma.rehearsalSession.findMany();
          const nextNum =
            allSess.length > 0
              ? Math.max(...allSess.map((s) => s.sessionNumber)) + 1
              : 1;
          session = await prisma.rehearsalSession.create({
            data: {
              sessionNumber: nextNum,
              title: name || `Probe ${nextNum}`,
              status: "PLANNED",
              scheduledDate: startDate,
              location: loc,
              additionalInfo: desc,
              konzertmeisterId: kmId,
            },
          });
        } else {
          session = await prisma.rehearsalSession.update({
            where: { id: session.id },
            data: {
              title: name || session.title,
              scheduledDate: startDate ?? session.scheduledDate,
              location: loc || session.location,
              additionalInfo: desc || session.additionalInfo,
              konzertmeisterId: kmId || session.konzertmeisterId,
            },
          });
        }

        if (attendance.length > 0) {
          await applyAttendanceToSession(session.id, attendance);
        }
        importedSessions++;
      }

      const nonCompletedCount = await prisma.rehearsalSession.count({
        where: { status: { not: "COMPLETED" } },
      });
      await prisma.rehearsalConfig.upsert({
        where: { id: "default" },
        update: {
          planningMode: "EXACT_DATES",
          totalSessionsLeft: Math.max(1, nonCompletedCount),
        },
        create: {
          id: "default",
          planningMode: "EXACT_DATES",
          totalSessionsLeft: Math.max(1, nonCompletedCount),
          piecesPerSession: 6,
        },
      });

      await recalculateSchedule();
      await savePersistentSnapshot();

      return NextResponse.json({
        success: true,
        importedSessions,
        importedConcerts,
      });
    }

    // =========================================================================
    // MODE 2: KONZERTMEISTER ICAL URL OR ICS CONTENT
    // =========================================================================
    if (mode === "ICAL") {
      let icsContent = String(body.icsContent || "").trim();
      const icalUrl = String(body.icalUrl || "")
        .trim()
        .replace(/^webcal:\/\//i, "https://");

      if (!icsContent && icalUrl) {
        const res = await fetch(icalUrl, {
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
          return NextResponse.json(
            {
              error: `iCal-Feed konnte nicht geladen werden (HTTP ${res.status}).`,
            },
            { status: 400 }
          );
        }
        icsContent = await res.text();
      }

      if (!icsContent || !icsContent.includes("BEGIN:VCALENDAR")) {
        return NextResponse.json(
          {
            error:
              "Kein gültiger Konzertmeister iCal-Feed (.ics) gefunden.",
          },
          { status: 400 }
        );
      }

      const parsed = parseIcalContent(icsContent, filterKeyword);
      let importedSessions = 0;
      let importedConcerts = 0;

      for (const item of parsed) {
        if (item.kind === "CONCERT") {
          const existing = await prisma.concertEvent.findFirst({
            where: { konzertmeisterId: item.konzertmeisterId },
          });
          if (existing) {
            await prisma.concertEvent.update({
              where: { id: existing.id },
              data: {
                title: item.title,
                scheduledDate: item.scheduledDate,
                location: item.location,
                additionalInfo: item.additionalInfo,
              },
            });
          } else {
            await prisma.concertEvent.create({
              data: {
                title: item.title,
                scheduledDate: item.scheduledDate,
                location: item.location,
                additionalInfo: item.additionalInfo,
                konzertmeisterId: item.konzertmeisterId,
              },
            });
          }
          importedConcerts++;
        } else {
          let session = await prisma.rehearsalSession.findFirst({
            where: { konzertmeisterId: item.konzertmeisterId },
          });
          if (!session && item.scheduledDate) {
            const allSess = await prisma.rehearsalSession.findMany();
            session =
              allSess.find(
                (s) =>
                  s.scheduledDate &&
                  s.scheduledDate.toISOString().slice(0, 10) ===
                    item.scheduledDate!.toISOString().slice(0, 10)
              ) || null;
          }

          if (!session) {
            const allSess = await prisma.rehearsalSession.findMany();
            const nextNum =
              allSess.length > 0
                ? Math.max(...allSess.map((s) => s.sessionNumber)) + 1
                : 1;
            session = await prisma.rehearsalSession.create({
              data: {
                sessionNumber: nextNum,
                title: item.title,
                status: "PLANNED",
                scheduledDate: item.scheduledDate,
                location: item.location,
                additionalInfo: item.additionalInfo,
                konzertmeisterId: item.konzertmeisterId,
              },
            });
          } else {
            session = await prisma.rehearsalSession.update({
              where: { id: session.id },
              data: {
                title: item.title,
                scheduledDate: item.scheduledDate ?? session.scheduledDate,
                location: item.location || session.location,
                additionalInfo: item.additionalInfo || session.additionalInfo,
                konzertmeisterId: item.konzertmeisterId,
              },
            });
          }

          if (item.attendance.length > 0) {
            await applyAttendanceToSession(session.id, item.attendance);
          }
          importedSessions++;
        }
      }

      if (importedSessions > 0) {
        const nonCompletedCount = await prisma.rehearsalSession.count({
          where: { status: { not: "COMPLETED" } },
        });
        await prisma.rehearsalConfig.upsert({
          where: { id: "default" },
          update: {
            planningMode: "EXACT_DATES",
            totalSessionsLeft: Math.max(1, nonCompletedCount),
          },
          create: {
            id: "default",
            planningMode: "EXACT_DATES",
            totalSessionsLeft: Math.max(1, nonCompletedCount),
            piecesPerSession: 6,
          },
        });
      }

      await recalculateSchedule();
      await savePersistentSnapshot();

      return NextResponse.json({
        success: true,
        importedSessions,
        importedConcerts,
      });
    }

    // =========================================================================
    // MODE 3: PASTE / CSV ATTENDANCE FOR A SPECIFIC REHEARSAL SESSION
    // =========================================================================
    if (mode === "PASTE_ATTENDANCE") {
      const sessionId = String(body.sessionId || "").trim();
      const rawText = String(body.rawText || "").trim();

      if (!sessionId) {
        return NextResponse.json(
          { error: "Bitte wähle eine Probe aus." },
          { status: 400 }
        );
      }
      if (!rawText) {
        return NextResponse.json(
          {
            error:
              "Bitte füge die Rückmeldungen / Anwesenheitsliste aus Konzertmeister ein.",
          },
          { status: 400 }
        );
      }

      const attendance = parseAttendanceFromText(rawText);
      if (attendance.length === 0) {
        return NextResponse.json(
          {
            error:
              "Es konnten keine Spielernamen oder Rückmeldungen erkannt werden. Bitte füge die Liste aus Konzertmeister ein.",
          },
          { status: 400 }
        );
      }

      const result = await applyAttendanceToSession(sessionId, attendance);
      await recalculateSchedule();
      await savePersistentSnapshot();

      return NextResponse.json({
        success: true,
        attendanceCount: attendance.length,
        presentCount: result?.presentCount ?? 0,
        absentCount: result?.absentCount ?? 0,
        understaffedRegisters: result?.understaffedRegisters ?? [],
      });
    }

    // =========================================================================
    // MODE 4: PASTE / CSV SCHEDULE (TERMINE EXPORT CSV FROM KONZERTMEISTER)
    // =========================================================================
    if (mode === "PASTE_SCHEDULE") {
      const rawText = String(body.rawText || "").trim();
      if (!rawText) {
        return NextResponse.json(
          {
            error:
              "Bitte füge die Terminliste / CSV aus Konzertmeister ein.",
          },
          { status: 400 }
        );
      }

      if (rawText.includes("BEGIN:VCALENDAR")) {
        const parsed = parseIcalContent(rawText, filterKeyword);
        let importedSessions = 0;
        for (const item of parsed) {
          if (item.kind === "REHEARSAL") {
            const allSess = await prisma.rehearsalSession.findMany();
            const nextNum =
              allSess.length > 0
                ? Math.max(...allSess.map((s) => s.sessionNumber)) + 1
                : 1;
            await prisma.rehearsalSession.create({
              data: {
                sessionNumber: nextNum,
                title: item.title,
                status: "PLANNED",
                scheduledDate: item.scheduledDate,
                location: item.location,
                additionalInfo: item.additionalInfo,
                konzertmeisterId: item.konzertmeisterId,
              },
            });
            importedSessions++;
          }
        }
        await recalculateSchedule();
        await savePersistentSnapshot();
        return NextResponse.json({
          success: true,
          importedSessions,
          importedConcerts: 0,
        });
      }

      // Parse German date lines from Konzertmeister CSV or copy-pasted schedule
      // e.g. "Fr., 27.11.2026 19:30 - 21:30;BigBand Probe;Proberaum Neumarkt"
      const lines = rawText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      let importedSessions = 0;
      let importedConcerts = 0;
      const kw = filterKeyword.toLowerCase();

      for (const line of lines) {
        if (kw && !line.toLowerCase().includes(kw)) continue;
        const dateMatch = line.match(
          /(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[^\d]+(\d{1,2}):(\d{2}))?/
        );
        if (!dateMatch) continue;

        const day = Number(dateMatch[1]);
        const month = Number(dateMatch[2]) - 1;
        const year = Number(dateMatch[3]);
        const hour = Number(dateMatch[4] ?? 19);
        const minute = Number(dateMatch[5] ?? 30);
        const dt = new Date(year, month, day, hour, minute, 0);

        const parts = line
          .split(/[;\t]/)
          .map((p) => p.trim().replace(/^"|"$/g, ""))
          .filter(Boolean);

        let title =
          parts.find(
            (p) =>
              !p.match(/^\d{1,2}\.\d{1,2}\.\d{4}/) &&
              !p.match(/^(Mo|Di|Mi|Do|Fr|Sa|So)\.?$/i)
          ) || "BigBand Probe";
        const location = parts.length >= 3 ? parts[parts.length - 1] : "";

        const isConcert =
          title.toLowerCase().includes("auftritt") ||
          title.toLowerCase().includes("konzert") ||
          title.toLowerCase().includes("dance & talk");

        if (isConcert) {
          await prisma.concertEvent.create({
            data: {
              title,
              scheduledDate: dt,
              location: location !== title ? location : "",
            },
          });
          importedConcerts++;
        } else {
          const allSess = await prisma.rehearsalSession.findMany();
          const existingSameDay = allSess.find(
            (s) =>
              s.scheduledDate &&
              s.scheduledDate.toISOString().slice(0, 10) ===
                dt.toISOString().slice(0, 10)
          );
          if (!existingSameDay) {
            const nextNum =
              allSess.length > 0
                ? Math.max(...allSess.map((s) => s.sessionNumber)) + 1
                : 1;
            await prisma.rehearsalSession.create({
              data: {
                sessionNumber: nextNum,
                title,
                status: "PLANNED",
                scheduledDate: dt,
                location: location !== title ? location : "",
              },
            });
            importedSessions++;
          }
        }
      }

      if (importedSessions > 0) {
        const nonCompletedCount = await prisma.rehearsalSession.count({
          where: { status: { not: "COMPLETED" } },
        });
        await prisma.rehearsalConfig.upsert({
          where: { id: "default" },
          update: {
            planningMode: "EXACT_DATES",
            totalSessionsLeft: Math.max(1, nonCompletedCount),
          },
          create: {
            id: "default",
            planningMode: "EXACT_DATES",
            totalSessionsLeft: Math.max(1, nonCompletedCount),
            piecesPerSession: 6,
          },
        });
      }

      await recalculateSchedule();
      await savePersistentSnapshot();

      return NextResponse.json({
        success: true,
        importedSessions,
        importedConcerts,
      });
    }

    return NextResponse.json(
      { error: "Unbekannter Konzertmeister-Import-Modus." },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error in POST /api/konzertmeister:", error);
    return NextResponse.json(
      { error: "Fehler beim Konzertmeister-Import." },
      { status: 500 }
    );
  }
}
