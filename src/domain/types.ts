export type GameStage =
  | "LOBBY_OPEN"
  | "LOBBY_CLOSED"
  | "CONFIGURING"
  | "PREPARE_WORDS"
  | "READY_WAIT"
  | "IN_PROGRESS"
  | "FINISHED"
  | "CANCELED";

export type GameMode = "NORMAL" | "REVERSE";
export type PlayMode = "ONLINE" | "OFFLINE";
export type PairingMode = "RANDOM" | "MANUAL";

export type PlayerStage =
  | "JOINED"
  | "WORD_DRAFT"
  | "WORD_CONFIRMED"
  | "READY"
  | "GUESSED"
  | "GAVE_UP"
  | "BLOCKED_DM";

export type VoteDecision = "YES" | "NO" | "GUESSED";

export interface PlayerState {
  id: string;
  telegramUserId: string;
  username?: string;
  displayName: string;
  stage: PlayerStage;
  dmOpened: boolean;
  joinedAt: string;
}

export interface GameConfig {
  mode: GameMode;
  playMode: PlayMode;
  pairingMode?: PairingMode;
}

export interface WordEntry {
  ownerPlayerId: string;
  targetPlayerId?: string;
  word?: string;
  clue?: string;
  wordConfirmed: boolean;
  finalConfirmed: boolean;
  solved: boolean;
}

export interface PendingVote {
  id: string;
  gameId: string;
  round: number;
  askerPlayerId: string;
  targetWordOwnerId?: string;
  questionText?: string;
  eligibleVoterIds: string[];
  votes: Record<string, VoteDecision>;
  createdAt: string;
}

export interface VoteRecord {
  id: string;
  pendingVoteId: string;
  voterPlayerId: string;
  decision: VoteDecision;
  createdAt: string;
}

export interface TurnRecord {
  id: string;
  round: number;
  askerPlayerId: string;
  targetWordOwnerId?: string;
  questionText?: string;
  outcome: "YES" | "NO" | "GUESSED" | "GIVEUP";
  createdAt: string;
}

export interface PlayerProgress {
  playerId: string;
  questionsAsked: number;
  roundsUsed: number;
  gaveUpAtRound?: number;
  guessedAtRound?: number;
  reverseGiveUpsByTarget: string[];
}

export interface PreparationState {
  manualPairingQueue: string[];
  manualPairingCursor: number;
}

export interface InProgressState {
  round: number;
  turnOrder: string[];
  turnCursor: number;
  currentTargetPlayerId?: string;
  targetCursor: number;
  pendingVote?: PendingVote;
}

export interface FinalScore {
  playerId: string;
  rounds: number;
  questions: number;
  avgRounds?: number;
  avgQuestions?: number;
  crowns: string[];
}

export interface ReverseSummary {
  asWordOwner: FinalScore[];
  asGuesser: FinalScore[];
}

export interface GameResult {
  gameId: string;
  mode: GameMode;
  normal?: FinalScore[];
  reverse?: ReverseSummary;
  createdAt: string;
}

export interface GameState {
  id: string;
  chatId: string;
  creatorPlayerId: string;
  creatorTelegramUserId: string;
  stage: GameStage;
  config?: GameConfig;
  players: PlayerState[];
  pairings: Record<string, string>;
  words: Record<string, WordEntry>;
  preparation: PreparationState;
  inProgress: InProgressState;
  progress: Record<string, PlayerProgress>;
  turns: TurnRecord[];
  voteHistory: VoteRecord[];
  result?: GameResult;
  canceledReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlayerIdentity {
  id: string;
  telegramUserId: string;
  username?: string;
  displayName: string;
}

export interface StartGameInput {
  gameId: string;
  chatId: string;
  creator: PlayerIdentity;
  now: string;
}

export interface LobbyLimits {
  minPlayers: number;
  maxPlayers: number;
}

export interface ConfigureGameInput {
  actorPlayerId: string;
  mode: GameMode;
  playMode: PlayMode;
  pairingMode?: PairingMode;
}
