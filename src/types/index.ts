export const BIGBAND_INSTRUMENTS = [
  "Posaune",
  "Trompete",
  "Altsaxophon",
  "Tenorsaxophon",
  "Baritonsaxophon",
  "Klarinette / Holz",
  "Klavier / Keys",
  "Gitarre",
  "Bass",
  "Schlagzeug",
  "Gesang",
  "Dirigent / Leitung",
] as const;

export const BIGBAND_REGISTER_FAMILIES = [
  "Saxophon",
  "Posaune",
  "Trompete",
  "Rhythmusgruppe",
  "Gesang",
] as const;

export type BigBandInstrument = (typeof BIGBAND_INSTRUMENTS)[number] | string;

export type InstrumentSection =
  | "BLAESER"
  | "RHYTHMUS"
  | "GESANG"
  | "LEITUNG"
  | "SONSTIGE";

export function getInstrumentSection(instrument: string): InstrumentSection {
  const norm = (instrument || "").trim().toLowerCase();
  if (!norm) return "SONSTIGE";
  if (
    norm.includes("posaune") ||
    norm.includes("trompete") ||
    norm.includes("flügelhorn") ||
    norm.includes("sax") ||
    norm.includes("klarinette") ||
    norm.includes("flöte") ||
    norm.includes("holz") ||
    norm.includes("horn") ||
    norm.includes("bläser")
  ) {
    return "BLAESER";
  }
  if (
    norm.includes("klavier") ||
    norm.includes("key") ||
    norm.includes("piano") ||
    norm.includes("gitarre") ||
    norm.includes("bass") ||
    norm.includes("schlagzeug") ||
    norm.includes("drum") ||
    norm.includes("percussion") ||
    norm.includes("rhythmus")
  ) {
    return "RHYTHMUS";
  }
  if (norm.includes("gesang") || norm.includes("vokal") || norm.includes("sänger")) {
    return "GESANG";
  }
  if (norm.includes("dirigent") || norm.includes("leitung") || norm.includes("bandleader")) {
    return "LEITUNG";
  }
  return "SONSTIGE";
}

export function getRegisterFamily(instrument: string): string {
  const norm = (instrument || "").trim().toLowerCase();
  if (!norm) return "";
  if (
    norm.includes("sax") ||
    norm.includes("klarinette") ||
    norm.includes("flöte") ||
    norm.includes("holz")
  ) {
    return "Saxophon";
  }
  if (norm.includes("posaune")) {
    return "Posaune";
  }
  if (norm.includes("trompete") || norm.includes("flügelhorn")) {
    return "Trompete";
  }
  if (
    norm.includes("klavier") ||
    norm.includes("key") ||
    norm.includes("piano") ||
    norm.includes("gitarre") ||
    norm.includes("bass") ||
    norm.includes("schlagzeug") ||
    norm.includes("drum") ||
    norm.includes("percussion") ||
    norm.includes("rhythmus")
  ) {
    return "Rhythmusgruppe";
  }
  if (norm.includes("gesang") || norm.includes("vokal") || norm.includes("sänger")) {
    return "Gesang";
  }
  return instrument.trim();
}

export interface InstrumentPracticeStat {
  instrument: string;
  registerFamily: string;
  section: InstrumentSection;
  voteCount: number;
  avgPracticeNeeded: number;
  avgConfidence: number;
  avgLike: number;
  isFlaggedFocus: boolean;
}

export interface MeasureNoteItem {
  id: string;
  measure: string;     // z.B. "Takt 48–64" oder "Intro / Coda"
  instrument: string;  // z.B. "Posaune", "Trompete", "Saxophon", "Tutti"
  note: string;        // z.B. "Kurz absetzen auf 2+"
  author: string;
  createdAt: string;
}

export interface PieceVoteItem {
  userId: string;
  userName: string;
  userInstrument?: string;
  likeScore: number;
  confidenceScore: number;
  practiceNeededScore: number;
}

export interface PieceItem {
  id: string;
  title: string;
  folderNumber: string;
  artist: string;
  singers: string;
  singerList: string[];
  soloists: string;
  soloistList: string[];
  songType: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  bpm: number; // 0 = nicht gesetzt, >0 = Ziel-Tempo in BPM
  notes: string;
  referenceUrl: string;
  focusInstruments: string;
  focusInstrumentList: string[];
  measureNotes: MeasureNoteItem[];
  instrumentStats: InstrumentPracticeStat[];
  lastPracticedAt: string | null;
  createdBy: string;
  createdAt: string;
  voteCount: number;
  avgLike: number;
  avgConfidence: number;
  avgPracticeNeeded: number;
  priorityScore: number;
  priorityReasons: string[];
  myVote: {
    likeScore: number;
    confidenceScore: number;
    practiceNeededScore: number;
  } | null;
  votes: PieceVoteItem[];
}

export interface SessionPieceItem {
  id: string;
  pieceId: string;
  sortOrder: number;
  isManualOverride: boolean;
  estimatedMinutes: number;       // 0 = auto, >0 = manuell
  effectiveMinutes: number;       // Tatsächlich angezeigte Minuten (10..45)
  sessionBpm: number;             // Optionales Proben-Tempo dieser Session (z.B. 160)
  sessionBpmComment: string;      // Optionaler Tempo-Kommentar (z.B. "160 BPM, nächstes Mal schneller")
  lastSessionBpm?: number;        // Letztes dokumentiertes Proben-Tempo aus früheren Sessions
  lastSessionBpmComment?: string; // Letzter Tempo-Kommentar aus früheren Sessions
  eligible: boolean;
  ineligibleReason: string | null;
  piece: {
    id: string;
    title: string;
    folderNumber: string;
    artist: string;
    singers: string;
    singerList: string[];
    soloists: string;
    soloistList: string[];
    songType: string;
    difficulty: string;
    bpm: number;
    notes: string;
    referenceUrl: string;
    focusInstruments: string;
    focusInstrumentList: string[];
    measureNotes: MeasureNoteItem[];
    instrumentStats: InstrumentPracticeStat[];
    lastPracticedAt: string | null;
    avgLike: number;
    avgConfidence: number;
    avgPracticeNeeded: number;
    priorityScore: number;
    priorityReasons: string[];
  };
}

export interface SessionAttendanceEntry {
  userId?: string;
  userName: string;
  instrument: string;
  registerFamily?: string;
  status: "PRESENT" | "ABSENT" | "MAYBE";
  comment?: string;
  updatedAt?: string;
}

export interface RehearsalLogItem {
  id: string;
  pieceId: string;
  pieceTitle: string;
  userId: string;
  userName: string;
  prevConfidence: number;
  newConfidence: number;
  prevPracticeNeeded: number;
  newPracticeNeeded: number;
  comment: string;
  createdAt: string;
}

export interface RehearsalSessionItem {
  id: string;
  sessionNumber: number;
  title: string;
  status: "PLANNED" | "ACTIVE" | "COMPLETED";
  scheduledDate: string | null;
  location: string;
  additionalInfo: string;
  presentSingers: string;
  presentSingerList: string[];
  absentSoloists: string;
  absentSoloistList: string[];
  absentInstruments: string;
  absentInstrumentList: string[];
  understaffedRegisterList: string[];
  isLocked: boolean;
  hasBreak: boolean;
  breakDurationMinutes: number;
  breakAfterPieceIndex: number;
  attendance: SessionAttendanceEntry[];
  konzertmeisterId: string;
  totalEstimatedMinutes: number;
  completedAt: string | null;
  pieces: SessionPieceItem[];
  logs: RehearsalLogItem[];
}

export interface ConcertSetlistEntry {
  id: string;
  type: "PIECE" | "TALK";
  pieceId?: string;
  talkTitle?: string;
  durationMinutes?: number;
  notes?: string;
}

export interface ConcertSetBlock {
  id: string;
  title: string; // z.B. "Set 1 – Eröffnung & Swing"
  entries: ConcertSetlistEntry[];
}

export interface ConcertEventItem {
  id: string;
  title: string;
  scheduledDate: string | null;
  location: string;
  additionalInfo: string;
  setlist: ConcertSetBlock[];
  konzertmeisterId?: string;
}

export interface RehearsalConfigItem {
  id: string;
  planningMode: "SIMPLE_COUNT" | "EXACT_DATES" | "MANUAL";
  totalSessionsLeft: number;
  piecesPerSession: number;
}

export interface SuggestionsData {
  singers: string[];
  soloists: string[];
  songTypes: string[];
  instruments?: string[];
}

export type ProposalDecision = "YES" | "NO" | "SUPER";

export interface SongProposalVoteItem {
  id: string;
  userId: string;
  userName: string;
  decision: ProposalDecision;
  comment: string;
  updatedAt: string;
}

export interface SongProposalItem {
  id: string;
  title: string;
  artist: string;
  platform: "YOUTUBE" | "SPOTIFY";
  externalId: string;
  sourceUrl: string;
  embedUrl: string;
  thumbnailUrl: string;
  previewAudioUrl: string;
  startSeconds: number;
  notes: string;
  proposedBy: string;
  transferredPieceId: string | null;
  createdAt: string;
  updatedAt: string;
  yesCount: number;
  superCount: number;
  noCount: number;
  totalVotes: number;
  approvalPercent: number;
  popularityScore: number;
  myVote: {
    decision: ProposalDecision;
    comment: string;
  } | null;
  votes: SongProposalVoteItem[];
}

export interface ResolvedTrackMetadata {
  title: string;
  artist: string;
  platform: "YOUTUBE" | "SPOTIFY";
  externalId: string;
  sourceUrl: string;
  embedUrl: string;
  thumbnailUrl: string;
  previewAudioUrl: string;
  startSeconds: number;
  durationMs?: number;
  alreadyExists?: boolean;
  alreadyInRepertoire?: boolean;
}
