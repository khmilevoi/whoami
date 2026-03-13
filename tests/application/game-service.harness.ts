import { GameService } from "../../src/application/game-service.js";
import { GameServiceContext } from "../../src/application/game-service-context.js";
import { InMemoryGameStatusService } from "../../src/application/game-status-service.js";
import { PregameUiStatusSubscriber } from "../../src/application/pregame-ui-status-subscriber.js";
import { ConfigDraftStore } from "../../src/application/stores/config-draft-store.js";
import { PrivateExpectationStore } from "../../src/application/stores/private-expectation-store.js";
import { PregameUiStateStore } from "../../src/application/stores/pregame-ui-state-store.js";
import { TextService } from "../../src/application/text-service.js";
import { GameEngine } from "../../src/domain/game-engine.js";
import {
  GameMode,
  GameState,
  PairingMode,
  PlayerState,
  PlayMode,
  VoteDecision,
} from "../../src/domain/types.js";
import {
  FakeClock,
  FakeGameRepository,
  FakeIdPort,
  FakeIdentityPort,
  FakeLogger,
  FakeNotifier,
  FakeTransactionRunner,
} from "../mocks/index.js";
import { mustBeDefined, mustGetAt } from "../support/strict-helpers.js";

export interface TestActor {
  telegramUserId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

interface WordInput {
  word: string;
  clue?: string;
}

interface SetupConfiguredGameOptions {
  chatId: string;
  actors: TestActor[];
  mode: GameMode;
  playMode: PlayMode;
  pairingMode?: PairingMode;
}

interface SetupInProgressGameOptions extends SetupConfiguredGameOptions {
  manualPairsByChooser?: Record<string, string>;
  wordsByTelegramUserId?: Record<string, WordInput>;
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
  readonly texts: TextService;
  readonly engine: GameEngine;
  readonly repository: FakeGameRepository;
  readonly transactionRunner: FakeTransactionRunner;
  readonly notifier: FakeNotifier;
  readonly identity: FakeIdentityPort;
  readonly idPort: FakeIdPort;
  readonly clock: FakeClock;
  readonly logger: FakeLogger;
  readonly statusService: InMemoryGameStatusService;
  readonly limits: { minPlayers: number; maxPlayers: number };
  createActor: (index: number) => TestActor;
  createActors: (count: number, startIndex?: number) => TestActor[];
  getGameByChat: (chatId: string) => GameState;
  getGameById: (gameId: string) => GameState;
  getPlayerByTelegram: (gameId: string, telegramUserId: string) => PlayerState;
  getCurrentAsker: (gameId: string) => PlayerState;
  getCurrentTarget: (gameId: string) => PlayerState | null;
  setupConfiguredGame: (options: SetupConfiguredGameOptions) => Promise<GameState>;
  setupInProgressGame: (options: SetupInProgressGameOptions) => Promise<GameState>;
  completeManualPairing: (
    gameId: string,
    chooserToTarget: Record<string, string>,
  ) => Promise<GameState>;
  completeWordCollection: (
    gameId: string,
    actors: TestActor[],
    wordsByTelegramUserId?: Record<string, WordInput>,
  ) => Promise<GameState>;
  completeWordFlow: (
    gameId: string,
    actor: TestActor,
    word: string,
    clue?: string,
  ) => Promise<void>;
  configureGame: (
    gameId: string,
    actorTelegramUserId: string,
    mode: GameMode,
    playMode: PlayMode,
    pairingMode?: PairingMode,
  ) => Promise<void>;
  resolvePendingVote: (
    gameId: string,
    decisionByPlayerId?: Record<string, VoteDecision>,
  ) => Promise<GameState>;
  castVoteForAllEligible: (
    gameId: string,
    decisionByPlayerId: Record<string, VoteDecision>,
  ) => Promise<void>;
  setupNormalOnlineRandomInProgress: (
    chatId: string,
    actors: TestActor[],
  ) => Promise<GameState>;
  setupReverseOfflineInProgress: (
    chatId: string,
    actors: TestActor[],
  ) => Promise<GameState>;
}

const defaultFirstNames = ["Alice", "Bob", "Carol", "Dave", "Erin", "Frank"];

export const createActor = (index: number): TestActor => ({
  telegramUserId: `${index}`,
  username: `user${index}`,
  firstName: defaultFirstNames[index - 1] ?? `User${index}`,
});

const defaultManualPairs = (actors: TestActor[]): Record<string, string> =>
  Object.fromEntries(
    actors.map((actor, index) => [
      actor.telegramUserId,
      mustGetAt(
        actors,
        (index + 1) % actors.length,
        "Expected default manual target actor",
      ).telegramUserId,
    ]),
  );

export const createGameServiceHarness = (
  options: HarnessOptions = {},
): GameServiceHarness => {
  const limits = {
    minPlayers: options.minPlayers ?? 3,
    maxPlayers: options.maxPlayers ?? 20,
  };

  const texts = new TextService("ru");
  const engine = new GameEngine();
  const repository = new FakeGameRepository();
  const transactionRunner = new FakeTransactionRunner();
  const notifier = new FakeNotifier(
    options.deepLink ?? "https://t.me/test_bot",
  );
  const identity = new FakeIdentityPort();
  const idPort = new FakeIdPort(
    options.queuedIds ?? [],
    options.idPrefix ?? "test",
  );
  const clock = new FakeClock(
    options.startIso ?? "2026-01-01T00:00:00.000Z",
    options.clockStepMs ?? 1000,
  );
  const logger = new FakeLogger();
  const statusService = new InMemoryGameStatusService(repository, logger);
  const configDraftStore = new ConfigDraftStore();
  const expectationStore = new PrivateExpectationStore();
  const uiStateStore = new PregameUiStateStore();

  const context = new GameServiceContext({
    engine,
    repository,
    transactionRunner,
    notifier,
    identity,
    idPort,
    clock,
    logger,
    texts,
    limits,
    statusService,
  });

  const service = new GameService(
    engine,
    repository,
    transactionRunner,
    notifier,
    identity,
    idPort,
    clock,
    logger,
    texts,
    limits,
    statusService,
    configDraftStore,
    expectationStore,
  );

  statusService.subscribe(
    new PregameUiStatusSubscriber(
      context,
      configDraftStore,
      expectationStore,
      uiStateStore,
    ),
  );

  const createActors = (count: number, startIndex = 1): TestActor[] =>
    Array.from({ length: count }, (_, index) => createActor(startIndex + index));

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

  const getPlayerByTelegram = (
    gameId: string,
    telegramUserId: string,
  ): PlayerState => {
    const game = getGameById(gameId);
    return mustBeDefined(
      game.players.find((player) => player.telegramUserId === telegramUserId),
      `Player ${telegramUserId} not found in ${gameId}`,
    );
  };

  const getCurrentAsker = (gameId: string): PlayerState => {
    const game = getGameById(gameId);
    const askerId = mustBeDefined(
      game.inProgress.turnOrder[game.inProgress.turnCursor],
      `Current asker missing in ${gameId}`,
    );
    return mustBeDefined(
      game.players.find((player) => player.id === askerId),
      `Asker ${askerId} not found in ${gameId}`,
    );
  };

  const getCurrentTarget = (gameId: string): PlayerState | null => {
    const game = getGameById(gameId);
    const targetId = game.inProgress.currentTargetPlayerId;
    if (!targetId) {
      return null;
    }

    return mustBeDefined(
      game.players.find((player) => player.id === targetId),
      `Target ${targetId} not found in ${gameId}`,
    );
  };

  const resolvePlayerId = (game: GameState, ref: string): string =>
    mustBeDefined(
      game.players.find(
        (player) => player.id === ref || player.telegramUserId === ref,
      ),
      `Player reference ${ref} not found in ${game.id}`,
    ).id;

  const configureGame = async (
    gameId: string,
    actorTelegramUserId: string,
    mode: GameMode,
    playMode: PlayMode,
    pairingMode?: PairingMode,
  ): Promise<void> => {
    await service.applyConfigStep(gameId, actorTelegramUserId, "mode", mode);
    await service.applyConfigStep(
      gameId,
      actorTelegramUserId,
      "play",
      playMode,
    );

    if (mode === "NORMAL") {
      await service.applyConfigStep(
        gameId,
        actorTelegramUserId,
        "pair",
        pairingMode ?? "RANDOM",
      );
    }
  };

  const setupConfiguredGame = async ({
    chatId,
    actors,
    mode,
    playMode,
    pairingMode,
  }: SetupConfiguredGameOptions): Promise<GameState> => {
    const creator = mustGetAt(actors, 0, "Expected setup creator");

    await service.startGame(chatId, creator);

    for (const actor of actors.slice(1)) {
      await service.joinGame(chatId, actor);
    }

    await service.beginConfiguration(chatId, creator.telegramUserId);

    const gameAfterBegin = getGameByChat(chatId);
    await configureGame(
      gameAfterBegin.id,
      creator.telegramUserId,
      mode,
      playMode,
      pairingMode,
    );

    return getGameById(gameAfterBegin.id);
  };

  const completeManualPairing = async (
    gameId: string,
    chooserToTarget: Record<string, string>,
  ): Promise<GameState> => {
    let game = getGameById(gameId);

    while (Object.keys(game.words).length < game.players.length) {
      const chooserId = mustBeDefined(
        game.preparation.manualPairingQueue[game.preparation.manualPairingCursor],
        `Expected current chooser in ${gameId}`,
      );
      const chooser = mustBeDefined(
        game.players.find((player) => player.id === chooserId),
        `Chooser ${chooserId} not found in ${gameId}`,
      );
      const targetRef =
        chooserToTarget[chooser.telegramUserId] ?? chooserToTarget[chooser.id];
      const targetId = resolvePlayerId(
        game,
        mustBeDefined(
          targetRef,
          `Target is missing for chooser ${chooser.telegramUserId}`,
        ),
      );

      await service.applyManualPair(gameId, chooser.telegramUserId, targetId);
      game = getGameById(gameId);
    }

    return game;
  };

  const completeWordFlow = async (
    gameId: string,
    actor: TestActor,
    word: string,
    clue?: string,
  ): Promise<void> => {
    await service.handlePrivateText(actor.telegramUserId, word);
    await service.handleWordCallback(
      gameId,
      actor.telegramUserId,
      "confirm",
      "YES",
    );

    if (clue) {
      await service.handleWordCallback(
        gameId,
        actor.telegramUserId,
        "clue",
        "YES",
      );
      await service.handlePrivateText(actor.telegramUserId, clue);
    } else {
      await service.handleWordCallback(
        gameId,
        actor.telegramUserId,
        "clue",
        "NO",
      );
    }

    await service.handleWordCallback(
      gameId,
      actor.telegramUserId,
      "final",
      "YES",
    );
  };

  const completeWordCollection = async (
    gameId: string,
    actors: TestActor[],
    wordsByTelegramUserId: Record<string, WordInput> = {},
  ): Promise<GameState> => {
    for (const actor of actors) {
      const input = wordsByTelegramUserId[actor.telegramUserId] ?? {
        word: `word-${actor.telegramUserId}`,
      };
      await completeWordFlow(gameId, actor, input.word, input.clue);
    }

    return getGameById(gameId);
  };

  const resolvePendingVote = async (
    gameId: string,
    decisionByPlayerId: Record<string, VoteDecision> = {},
  ): Promise<GameState> => {
    const game = getGameById(gameId);
    const pending = game.inProgress.pendingVote;
    if (!pending) {
      throw new Error(`Game ${gameId} has no pending vote`);
    }

    for (const voterPlayerId of pending.eligibleVoterIds) {
      const voter = mustBeDefined(
        game.players.find((player) => player.id === voterPlayerId),
        `Player ${voterPlayerId} not found`,
      );
      const decision = decisionByPlayerId[voterPlayerId] ?? "NO";
      await service.handleVote(gameId, voter.telegramUserId, decision);
    }

    return getGameById(gameId);
  };

  const castVoteForAllEligible = async (
    gameId: string,
    decisionByPlayerId: Record<string, VoteDecision>,
  ): Promise<void> => {
    await resolvePendingVote(gameId, decisionByPlayerId);
  };

  const setupInProgressGame = async ({
    chatId,
    actors,
    mode,
    playMode,
    pairingMode,
    manualPairsByChooser,
    wordsByTelegramUserId,
  }: SetupInProgressGameOptions): Promise<GameState> => {
    const configured = await setupConfiguredGame({
      chatId,
      actors,
      mode,
      playMode,
      pairingMode,
    });

    const readyForWords =
      configured.config?.mode === "NORMAL" &&
      configured.config.pairingMode === "MANUAL"
        ? await completeManualPairing(
            configured.id,
            manualPairsByChooser ?? defaultManualPairs(actors),
          )
        : configured;

    return completeWordCollection(
      readyForWords.id,
      actors,
      wordsByTelegramUserId,
    );
  };

  const setupNormalOnlineRandomInProgress = async (
    chatId: string,
    actors: TestActor[],
  ): Promise<GameState> =>
    setupInProgressGame({
      chatId,
      actors,
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
    });

  const setupReverseOfflineInProgress = async (
    chatId: string,
    actors: TestActor[],
  ): Promise<GameState> =>
    setupInProgressGame({
      chatId,
      actors,
      mode: "REVERSE",
      playMode: "OFFLINE",
    });

  return {
    service,
    texts,
    engine,
    repository,
    transactionRunner,
    notifier,
    identity,
    idPort,
    clock,
    logger,
    statusService,
    limits,
    createActor,
    createActors,
    getGameByChat,
    getGameById,
    getPlayerByTelegram,
    getCurrentAsker,
    getCurrentTarget,
    setupConfiguredGame,
    setupInProgressGame,
    completeManualPairing,
    completeWordCollection,
    completeWordFlow,
    configureGame,
    resolvePendingVote,
    castVoteForAllEligible,
    setupNormalOnlineRandomInProgress,
    setupReverseOfflineInProgress,
  };
};









