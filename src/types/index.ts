export interface PieceVoteItem {
  userId: string;
  userName: string;
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
  notes: string;
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
    notes: string;
    lastPracticedAt: string | null;
    avgLike: number;
    avgConfidence: number;
    avgPracticeNeeded: number;
    priorityScore: number;
    priorityReasons: string[];
  };
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
  isLocked: boolean;
  completedAt: string | null;
  pieces: SessionPieceItem[];
  logs: RehearsalLogItem[];
}

export interface ConcertEventItem {
  id: string;
  title: string;
  scheduledDate: string | null;
  location: string;
  additionalInfo: string;
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
}

