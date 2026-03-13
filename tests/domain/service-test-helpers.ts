import {
  GameConfig,
  GameMode,
  GameState,
  PairingMode,
  PlayerProgress,
  PlayerState,
  PlayMode,
  SupportedLocale,
  WordEntry,
} from "../../src/domain/types.js";

const DEFAULT_NOW = "2026-01-01T00:00:00.000Z";

export const cloneGame = <T>(value: T): T => structuredClone(value) as T;

export const createPlayerState = (
  index: number,
  overrides: Partial<PlayerState> = {},
): PlayerState => ({
  id: `tg:${index}`,
  telegramUserId: `${index}`,
  username: `user${index}`,
  displayName: `Player ${index}`,
  locale: "ru",
  localeSource: "telegram",
  stage: "JOINED",
  dmOpened: false,
  joinedAt: DEFAULT_NOW,
  ...overrides,
});

export const createProgress = (
  playerId: string,
  overrides: Partial<PlayerProgress> = {},
): PlayerProgress => ({
  playerId,
  questionsAsked: 0,
  roundsUsed: 0,
  reverseGiveUpsByTarget: [],
  ...overrides,
});

export const createCircularPairings = (
  playerIds: string[],
): Record<string, string> =>
  Object.fromEntries(
    playerIds.map((playerId, index) => [
      playerId,
      playerIds[(index + 1) % playerIds.length] ?? playerIds[0] ?? playerId,
    ]),
  );

export const createNormalWords = ({
  pairings,
  ready = false,
}: {
  pairings: Record<string, string>;
  ready?: boolean;
}): Record<string, WordEntry> =>
  Object.fromEntries(
    Object.entries(pairings).map(([ownerPlayerId, targetPlayerId]) => [
      ownerPlayerId,
      {
        ownerPlayerId,
        targetPlayerId,
        word: ready ? `word-${ownerPlayerId}` : undefined,
        clue: ready ? `clue-${ownerPlayerId}` : undefined,
        wordConfirmed: ready,
        finalConfirmed: ready,
        solved: false,
      },
    ]),
  );

export const createReverseWords = ({
  playerIds,
  ready = false,
  solvedIds = [],
}: {
  playerIds: string[];
  ready?: boolean;
  solvedIds?: string[];
}): Record<string, WordEntry> =>
  Object.fromEntries(
    playerIds.map((playerId) => [
      playerId,
      {
        ownerPlayerId: playerId,
        targetPlayerId: playerId,
        word: ready ? `word-${playerId}` : undefined,
        clue: ready ? `clue-${playerId}` : undefined,
        wordConfirmed: ready,
        finalConfirmed: ready,
        solved: solvedIds.includes(playerId),
      },
    ]),
  );

export const createGameConfig = ({
  mode = "NORMAL",
  playMode = "ONLINE",
  pairingMode,
}: {
  mode?: GameMode;
  playMode?: PlayMode;
  pairingMode?: PairingMode;
} = {}): GameConfig => ({
  mode,
  playMode,
  pairingMode,
});

export const createGameState = ({
  id = "game-1",
  chatId = "-1001234567890",
  playerCount = 3,
  players,
  groupLocale = "ru",
  stage = "LOBBY_OPEN",
  config,
  pairings = {},
  words = {},
  progress,
  round = 0,
  turnOrder,
  turnCursor = 0,
  currentTargetPlayerId,
  targetCursor = 0,
  pendingVote,
  createdAt = DEFAULT_NOW,
  updatedAt = DEFAULT_NOW,
}: {
  id?: string;
  chatId?: string;
  playerCount?: number;
  players?: PlayerState[];
  groupLocale?: SupportedLocale;
  stage?: GameState["stage"];
  config?: GameConfig;
  pairings?: Record<string, string>;
  words?: Record<string, WordEntry>;
  progress?: Record<string, PlayerProgress>;
  round?: number;
  turnOrder?: string[];
  turnCursor?: number;
  currentTargetPlayerId?: string;
  targetCursor?: number;
  pendingVote?: GameState["inProgress"]["pendingVote"];
  createdAt?: string;
  updatedAt?: string;
} = {}): GameState => {
  const nextPlayers =
    players ?? Array.from({ length: playerCount }, (_, index) => createPlayerState(index + 1));
  const creator = nextPlayers[0] ?? createPlayerState(1);

  return {
    id,
    chatId,
    creatorPlayerId: creator.id,
    creatorTelegramUserId: creator.telegramUserId,
    groupLocale,
    stage,
    config,
    players: nextPlayers,
    pairings,
    words,
    preparation: {
      manualPairingQueue: nextPlayers.map((player) => player.id),
      manualPairingCursor: 0,
    },
    inProgress: {
      round,
      turnOrder: turnOrder ?? nextPlayers.map((player) => player.id),
      turnCursor,
      currentTargetPlayerId,
      targetCursor,
      pendingVote,
    },
    progress:
      progress ??
      Object.fromEntries(
        nextPlayers.map((player) => [player.id, createProgress(player.id)]),
      ),
    turns: [],
    voteHistory: [],
    ui: {
      privatePanels: {},
    },
    createdAt,
    updatedAt,
  };
};
