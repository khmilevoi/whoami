import { GameService } from "../../src/application/game-service";
import { GameEngine } from "../../src/domain/game-engine";
import { GameMode, GameState, PairingMode, PlayMode, VoteDecision } from "../../src/domain/types";
import {
  FakeClock,
  FakeGameRepository,
  FakeIdPort,
  FakeIdentityPort,
  FakeLogger,
  FakeNotifier,
  FakeTransactionRunner,
} from "../mocks";

export interface TestActor {
  telegramUserId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

interface HarnessOptions {
  minPlayers?: number;
  maxPlayers?: number;
  startIso?: string;
  clockStepMs?: number;
  idPrefix?: string;
  deepLink?: string;
  queuedIds?: string[];
}

export interface GameServiceHarness {
  readonly service: GameService;
  readonly engine: GameEngine;
  readonly repository: FakeGameRepository;
  readonly transactionRunner: FakeTransactionRunner;
  readonly notifier: FakeNotifier;
  readonly identity: FakeIdentityPort;
  readonly idPort: FakeIdPort;
  readonly clock: FakeClock;
  readonly logger: FakeLogger;
  readonly limits: { minPlayers: number; maxPlayers: number };
  createActor: (index: number) => TestActor;
  getGameByChat: (chatId: string) => GameState;
  getGameById: (gameId: string) => GameState;
  setupNormalOnlineRandomInProgress: (chatId: string, actors: TestActor[]) => Promise<GameState>;
  setupReverseOfflineInProgress: (chatId: string, actors: TestActor[]) => Promise<GameState>;
  completeWordFlow: (gameId: string, actor: TestActor, word: string, clue?: string) => Promise<void>;
  configureGame: (gameId: string, actorTelegramUserId: string, mode: GameMode, playMode: PlayMode, pairingMode?: PairingMode) => Promise<void>;
  castVoteForAllEligible: (gameId: string, decisionByPlayerId: Record<string, VoteDecision>) => Promise<void>;
}

const defaultFirstNames = ["Alice", "Bob", "Carol", "Dave", "Erin", "Frank"];

export const createActor = (index: number): TestActor => ({
  telegramUserId: `${index}`,
  username: `user${index}`,
  firstName: defaultFirstNames[index - 1] ?? `User${index}`,
});

export const createGameServiceHarness = (options: HarnessOptions = {}): GameServiceHarness => {
  const limits = {
    minPlayers: options.minPlayers ?? 3,
    maxPlayers: options.maxPlayers ?? 20,
  };

  const engine = new GameEngine();
  const repository = new FakeGameRepository();
  const transactionRunner = new FakeTransactionRunner();
  const notifier = new FakeNotifier(options.deepLink ?? "https://t.me/test_bot");
  const identity = new FakeIdentityPort();
  const idPort = new FakeIdPort(options.queuedIds ?? [], options.idPrefix ?? "test");
  const clock = new FakeClock(options.startIso ?? "2026-01-01T00:00:00.000Z", options.clockStepMs ?? 1000);
  const logger = new FakeLogger();

  const service = new GameService(engine, repository, transactionRunner, notifier, identity, idPort, clock, logger, limits);

  const getGameByChat = (chatId: string): GameState => {
    const game = repository.findActiveByChatId(chatId);
    if (!game) {
      throw new Error(`Active game for chat ${chatId} not found`);
    }
    return game;
  };

  const getGameById = (gameId: string): GameState => {
    const game = repository.findById(gameId);
    if (!game) {
      throw new Error(`Game ${gameId} not found`);
    }
    return game;
  };

  const configureGame = async (
    gameId: string,
    actorTelegramUserId: string,
    mode: GameMode,
    playMode: PlayMode,
    pairingMode?: PairingMode,
  ): Promise<void> => {
    await service.applyConfigStep(gameId, actorTelegramUserId, "mode", mode);
    await service.applyConfigStep(gameId, actorTelegramUserId, "play", playMode);

    if (mode === "NORMAL") {
      await service.applyConfigStep(gameId, actorTelegramUserId, "pair", pairingMode ?? "RANDOM");
    }
  };

  const completeWordFlow = async (gameId: string, actor: TestActor, word: string, clue?: string): Promise<void> => {
    await service.handlePrivateText(actor.telegramUserId, word);
    await service.handleWordCallback(gameId, actor.telegramUserId, "confirm", "YES");

    if (clue) {
      await service.handleWordCallback(gameId, actor.telegramUserId, "clue", "YES");
      await service.handlePrivateText(actor.telegramUserId, clue);
    } else {
      await service.handleWordCallback(gameId, actor.telegramUserId, "clue", "NO");
    }

    await service.handleWordCallback(gameId, actor.telegramUserId, "final", "YES");
  };

  const setupNormalOnlineRandomInProgress = async (chatId: string, actors: TestActor[]): Promise<GameState> => {
    await service.startGame(chatId, actors[0]);

    for (const actor of actors.slice(1)) {
      await service.joinGame(chatId, actor);
    }

    await service.beginConfiguration(chatId, actors[0].telegramUserId);

    const gameAfterBegin = getGameByChat(chatId);
    await configureGame(gameAfterBegin.id, actors[0].telegramUserId, "NORMAL", "ONLINE", "RANDOM");

    const configured = getGameById(gameAfterBegin.id);

    for (const actor of actors) {
      await completeWordFlow(configured.id, actor, `word-${actor.telegramUserId}`);
    }

    return getGameById(configured.id);
  };

  const setupReverseOfflineInProgress = async (chatId: string, actors: TestActor[]): Promise<GameState> => {
    await service.startGame(chatId, actors[0]);

    for (const actor of actors.slice(1)) {
      await service.joinGame(chatId, actor);
    }

    await service.beginConfiguration(chatId, actors[0].telegramUserId);

    const gameAfterBegin = getGameByChat(chatId);
    await configureGame(gameAfterBegin.id, actors[0].telegramUserId, "REVERSE", "OFFLINE");

    const configured = getGameById(gameAfterBegin.id);

    for (const actor of actors) {
      await completeWordFlow(configured.id, actor, `word-${actor.telegramUserId}`);
    }

    return getGameById(configured.id);
  };

  const castVoteForAllEligible = async (gameId: string, decisionByPlayerId: Record<string, VoteDecision>): Promise<void> => {
    const game = getGameById(gameId);
    const pending = game.inProgress.pendingVote;
    if (!pending) {
      throw new Error(`Game ${gameId} has no pending vote`);
    }

    for (const voterPlayerId of pending.eligibleVoterIds) {
      const voter = game.players.find((player) => player.id === voterPlayerId);
      if (!voter) {
        throw new Error(`Player ${voterPlayerId} not found`);
      }

      const decision = decisionByPlayerId[voterPlayerId] ?? "NO";
      await service.handleVote(gameId, voter.telegramUserId, decision);
    }
  };

  return {
    service,
    engine,
    repository,
    transactionRunner,
    notifier,
    identity,
    idPort,
    clock,
    logger,
    limits,
    createActor,
    getGameByChat,
    getGameById,
    setupNormalOnlineRandomInProgress,
    setupReverseOfflineInProgress,
    completeWordFlow,
    configureGame,
    castVoteForAllEligible,
  };
};
