import { LoggerPort, GameRepository } from "./ports.js";
import { GameMode, GameState, PlayMode, SupportedLocale, TurnRecord } from "../domain/types.js";
import { resolveGameLocale } from "../domain/locale.js";

export interface GameStatusSnapshot {
  gameId: string;
  chatId: string;
  stage: GameState["stage"];
  mode: GameMode | null;
  playMode: PlayMode | null;
  groupLocale: SupportedLocale;
  updatedAt: string;
  creatorPlayerId: string;
  creatorTelegramUserId: string;
  playerCount: number;
  playerIds: string[];
  playerTelegramUserIds: string[];
  readyCount: number;
  manualPairingPending: boolean;
  manualPairingChooserPlayerId?: string;
  currentAskerPlayerId?: string;
  currentTargetPlayerId?: string;
  hasPendingVote: boolean;
  pendingVoteAskerPlayerId?: string;
  pendingVoteTargetPlayerId?: string;
  lastTurnOutcome?: TurnRecord["outcome"];
  lastTurnAskerPlayerId?: string;
  isFinished: boolean;
  isCanceled: boolean;
  hasActiveGame: boolean;
}

export interface GameStatusChangedFlags {
  stageChanged: boolean;
  playersChanged: boolean;
  readinessChanged: boolean;
  manualPairingChanged: boolean;
  turnChanged: boolean;
  pendingVoteChanged: boolean;
  commandsRelevantChanged: boolean;
  becameInactive: boolean;
}

export interface GameStatusTransition {
  previous: GameStatusSnapshot | null;
  current: GameStatusSnapshot | null;
  changed: GameStatusChangedFlags;
}

export interface GameStatusSubscriber {
  onGameStatusChanged(
    transition: GameStatusTransition,
  ): Promise<void | Error> | void | Error;
}

export interface GameStatusService {
  publish(game: GameState): void;
  clear(chatId: string): void;
  getByChatId(chatId: string): GameStatusSnapshot | null;
  getByGameId(gameId: string): GameStatusSnapshot | null;
  listActiveChatIdsByTelegramUser(telegramUserId: string): string[];
  findConfiguringGameByCreator(telegramUserId: string): GameStatusSnapshot | null;
  subscribe(subscriber: GameStatusSubscriber): () => void;
  rebuildFromRepository(): void;
}

const snapshotCommandKey = (snapshot: GameStatusSnapshot | null): string => {
  if (!snapshot || !snapshot.hasActiveGame) {
    return "no-game";
  }

  if (snapshot.stage === "IN_PROGRESS") {
    return `in-progress:${snapshot.groupLocale}`;
  }

  return `pregame:${snapshot.creatorTelegramUserId}:${snapshot.groupLocale}`;
};

const toSorted = (values: Iterable<string>): string[] => [...values].sort();

const sameArray = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const deriveChanged = (
  previous: GameStatusSnapshot | null,
  current: GameStatusSnapshot | null,
): GameStatusChangedFlags => ({
  stageChanged: previous?.stage !== current?.stage,
  playersChanged:
    previous === null ||
    current === null ||
    !sameArray(previous.playerIds, current.playerIds) ||
    !sameArray(previous.playerTelegramUserIds, current.playerTelegramUserIds),
  readinessChanged: previous?.readyCount !== current?.readyCount,
  manualPairingChanged:
    previous?.manualPairingPending !== current?.manualPairingPending ||
    previous?.manualPairingChooserPlayerId !== current?.manualPairingChooserPlayerId,
  turnChanged:
    previous?.currentAskerPlayerId !== current?.currentAskerPlayerId ||
    previous?.currentTargetPlayerId !== current?.currentTargetPlayerId ||
    previous?.lastTurnOutcome !== current?.lastTurnOutcome ||
    previous?.lastTurnAskerPlayerId !== current?.lastTurnAskerPlayerId,
  pendingVoteChanged:
    previous?.hasPendingVote !== current?.hasPendingVote ||
    previous?.pendingVoteAskerPlayerId !== current?.pendingVoteAskerPlayerId ||
    previous?.pendingVoteTargetPlayerId !== current?.pendingVoteTargetPlayerId,
  commandsRelevantChanged:
    snapshotCommandKey(previous) !== snapshotCommandKey(current),
  becameInactive: Boolean(previous?.hasActiveGame && !current?.hasActiveGame),
});

const buildSnapshot = (game: GameState): GameStatusSnapshot => {
  const currentAskerPlayerId = game.inProgress.turnOrder[game.inProgress.turnCursor];
  const manualPairingPending =
    game.stage === "PREPARE_WORDS" &&
    game.config?.mode === "NORMAL" &&
    game.config.pairingMode === "MANUAL" &&
    Object.keys(game.words).length < game.players.length;
  const lastTurn = game.turns[game.turns.length - 1];

  return {
    gameId: game.id,
    chatId: game.chatId,
    stage: game.stage,
    mode: game.config?.mode ?? null,
    playMode: game.config?.playMode ?? null,
    groupLocale: resolveGameLocale({ game }),
    updatedAt: game.updatedAt,
    creatorPlayerId: game.creatorPlayerId,
    creatorTelegramUserId: game.creatorTelegramUserId,
    playerCount: game.players.length,
    playerIds: game.players.map((player) => player.id),
    playerTelegramUserIds: game.players.map((player) => player.telegramUserId),
    readyCount: Object.values(game.words).filter((entry) => entry.finalConfirmed).length,
    manualPairingPending,
    manualPairingChooserPlayerId: manualPairingPending
      ? game.preparation.manualPairingQueue[game.preparation.manualPairingCursor]
      : undefined,
    currentAskerPlayerId,
    currentTargetPlayerId: game.inProgress.currentTargetPlayerId,
    hasPendingVote: Boolean(game.inProgress.pendingVote),
    pendingVoteAskerPlayerId: game.inProgress.pendingVote?.askerPlayerId,
    pendingVoteTargetPlayerId: game.inProgress.pendingVote?.targetWordOwnerId,
    lastTurnOutcome: lastTurn?.outcome,
    lastTurnAskerPlayerId: lastTurn?.askerPlayerId,
    isFinished: game.stage === "FINISHED",
    isCanceled: game.stage === "CANCELED",
    hasActiveGame: game.stage !== "FINISHED" && game.stage !== "CANCELED",
  };
};

export class InMemoryGameStatusService implements GameStatusService {
  private readonly byChatId = new Map<string, GameStatusSnapshot>();
  private readonly byGameId = new Map<string, GameStatusSnapshot>();
  private readonly activeChatsByTelegramUser = new Map<string, Set<string>>();
  private readonly configuringByCreator = new Map<string, GameStatusSnapshot>();
  private readonly subscribers = new Set<GameStatusSubscriber>();

  constructor(
    private readonly repository: GameRepository,
    private readonly logger: LoggerPort,
  ) {}

  publish(game: GameState) {
    const previous = this.byChatId.get(game.chatId) ?? null;
    const current = buildSnapshot(game);
    this.byChatId.set(game.chatId, current);
    this.byGameId.set(game.id, current);
    this.rebuildIndices();
    this.notifySubscribers({
      previous,
      current,
      changed: deriveChanged(previous, current),
    });
  }

  clear(chatId: string) {
    const previous = this.byChatId.get(chatId) ?? null;
    if (!previous) {
      return;
    }

    this.byChatId.delete(chatId);
    this.byGameId.delete(previous.gameId);
    this.rebuildIndices();
    this.notifySubscribers({
      previous,
      current: null,
      changed: deriveChanged(previous, null),
    });
  }

  getByChatId(chatId: string): GameStatusSnapshot | null {
    return this.byChatId.get(chatId) ?? null;
  }

  getByGameId(gameId: string): GameStatusSnapshot | null {
    return this.byGameId.get(gameId) ?? null;
  }

  listActiveChatIdsByTelegramUser(telegramUserId: string): string[] {
    return toSorted(this.activeChatsByTelegramUser.get(telegramUserId) ?? []);
  }

  findConfiguringGameByCreator(telegramUserId: string): GameStatusSnapshot | null {
    return this.configuringByCreator.get(telegramUserId) ?? null;
  }

  subscribe(subscriber: GameStatusSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  rebuildFromRepository() {
    this.byChatId.clear();
    this.byGameId.clear();
    this.activeChatsByTelegramUser.clear();
    this.configuringByCreator.clear();

    for (const game of this.repository.listActiveGames()) {
      this.publish(game);
    }
  }

  private rebuildIndices(): void {
    this.activeChatsByTelegramUser.clear();
    this.configuringByCreator.clear();

    for (const snapshot of this.byChatId.values()) {
      if (snapshot.hasActiveGame) {
        for (const telegramUserId of snapshot.playerTelegramUserIds) {
          const chats = this.activeChatsByTelegramUser.get(telegramUserId) ?? new Set<string>();
          chats.add(snapshot.chatId);
          this.activeChatsByTelegramUser.set(telegramUserId, chats);
        }
      }

      if (snapshot.stage === "CONFIGURING") {
        this.configuringByCreator.set(snapshot.creatorTelegramUserId, snapshot);
      }
    }
  }

  private notifySubscribers(transition: GameStatusTransition): void {
    for (const subscriber of this.subscribers) {
      Promise.resolve(subscriber.onGameStatusChanged(transition))
        .then((result) => {
          if (!result) {
            return;
          }

          this.logger.warn("game_status_subscriber_failed", {
            subscriber: subscriber.constructor.name,
            reason: result.message,
            chatId: transition.current?.chatId ?? transition.previous?.chatId,
          });
        })
        .catch((error) => {
          this.logger.warn("game_status_subscriber_failed", {
            subscriber: subscriber.constructor.name,
            reason: error instanceof Error ? error.message : String(error),
            chatId: transition.current?.chatId ?? transition.previous?.chatId,
          });
        });
    }
  }
}
