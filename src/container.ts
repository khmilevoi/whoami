import Database from "better-sqlite3";
import {
  asClass,
  asFunction,
  asValue,
  createContainer,
  InjectionMode,
  Lifetime,
} from "awilix";
import { Bot } from "grammy";
import { AppConfig, loadConfig } from "./config.js";
import { ChatCommandResolver } from "./application/chat-command-resolver.js";
import { GameFlowStatusSubscriber } from "./application/game-flow-status-subscriber.js";
import {
  GameStatusService,
  InMemoryGameStatusService,
} from "./application/game-status-service.js";
import { GameService } from "./application/game-service.js";
import { GameServiceContext } from "./application/game-service-context.js";
import { PregameUiStatusSubscriber } from "./application/pregame-ui-status-subscriber.js";
import { TextService } from "./application/text-service.js";
import {
  ClockPort,
  GameRepository,
  IdentityPort,
  LoggerPort,
  NotifierPort,
  TransactionRunner,
} from "./application/ports.js";
import { NormalModeService } from "./application/modes/normal-mode-service.js";
import { ReverseModeService } from "./application/modes/reverse-mode-service.js";
import { ConfigDraftStore } from "./application/stores/config-draft-store.js";
import { PrivateExpectationStore } from "./application/stores/private-expectation-store.js";
import { PregameUiStateStore } from "./application/stores/pregame-ui-state-store.js";
import { TelegramCommandSync } from "./adapters/telegram/telegram-command-sync.js";
import { TelegramNotifier } from "./adapters/telegram/telegram-notifier.js";
import { GameEngine } from "./domain/game-engine.js";
import { GameLobbyService } from "./domain/game-lobby/index.js";
import { GamePreparationService } from "./domain/game-preparation/index.js";
import { GameStateAccessService } from "./domain/game-state-access/index.js";
import { NormalRoundService } from "./domain/normal-round/index.js";
import { ReverseRoundService } from "./domain/reverse-round/index.js";
import { WordPreparationService } from "./domain/word-preparation/index.js";
import { SystemClock } from "./infrastructure/clock.js";
import { NanoIdPort } from "./infrastructure/id-port.js";
import { TelegramIdentityPort } from "./infrastructure/identity.js";
import { ConsoleLogger } from "./infrastructure/logger.js";
import { createDatabase } from "./infrastructure/sqlite/db.js";
import { SqliteGameRepository } from "./infrastructure/sqlite/game-repository.js";
import { SqliteTransactionRunner } from "./infrastructure/sqlite/transaction-runner.js";

interface BaseCradle {
  config: AppConfig;
  bot: Bot;
  db: Database.Database;
  texts: TextService;
}

interface DomainCradle {
  gameStateAccess: GameStateAccessService;
  gameLobbyService: GameLobbyService;
  gamePreparationService: GamePreparationService;
  wordPreparationService: WordPreparationService;
  normalRoundService: NormalRoundService;
  reverseRoundService: ReverseRoundService;
}

interface ServiceCradle extends BaseCradle, DomainCradle {
  engine: GameEngine;
  repository: GameRepository;
  transactionRunner: TransactionRunner;
  notifier: NotifierPort;
  identity: IdentityPort;
  idPort: NanoIdPort;
  clock: ClockPort;
  logger: LoggerPort;
  statusService: GameStatusService;
  configDraftStore: ConfigDraftStore;
  expectationStore: PrivateExpectationStore;
}

interface InternalCradle extends ServiceCradle {
  gameServiceContext: GameServiceContext;
  uiStateStore: PregameUiStateStore;
  normalModeServiceApp: NormalModeService;
  reverseModeServiceApp: ReverseModeService;
}

export const buildContainer = (externalConfig?: AppConfig) => {
  const config = externalConfig ?? loadConfig();
  const db = createDatabase(config.dbPath);
  const bot = new Bot(config.botToken);

  const container = createContainer({
    injectionMode: InjectionMode.PROXY,
  });

  container.register({
    config: asValue(config),
    db: asValue(db),
    bot: asValue(bot),
    texts: asValue(new TextService("ru")),
    logger: asClass(ConsoleLogger, { lifetime: Lifetime.SINGLETON }),
    gameStateAccess: asClass(GameStateAccessService, {
      lifetime: Lifetime.SINGLETON,
    }),
    gameLobbyService: asFunction(
      ({ gameStateAccess }: DomainCradle) => new GameLobbyService(gameStateAccess),
      { lifetime: Lifetime.SINGLETON },
    ),
    gamePreparationService: asFunction(
      ({ gameStateAccess }: DomainCradle) =>
        new GamePreparationService(gameStateAccess),
      { lifetime: Lifetime.SINGLETON },
    ),
    wordPreparationService: asFunction(
      ({ gameStateAccess }: DomainCradle) =>
        new WordPreparationService(gameStateAccess),
      { lifetime: Lifetime.SINGLETON },
    ),
    normalRoundService: asFunction(
      ({ gameStateAccess }: DomainCradle) => new NormalRoundService(gameStateAccess),
      { lifetime: Lifetime.SINGLETON },
    ),
    reverseRoundService: asFunction(
      ({ gameStateAccess }: DomainCradle) => new ReverseRoundService(gameStateAccess),
      { lifetime: Lifetime.SINGLETON },
    ),
    engine: asFunction(
      ({
        gameLobbyService,
        gamePreparationService,
        wordPreparationService,
        normalRoundService,
        reverseRoundService,
      }: DomainCradle) =>
        new GameEngine({
          lobby: gameLobbyService,
          preparation: gamePreparationService,
          wordPreparation: wordPreparationService,
          normalRound: normalRoundService,
          reverseRound: reverseRoundService,
        }),
      { lifetime: Lifetime.SINGLETON },
    ),
    repository: asFunction(
      ({ db }: BaseCradle) => new SqliteGameRepository(db),
      {
        lifetime: Lifetime.SINGLETON,
      },
    ),
    transactionRunner: asFunction(
      ({ db }: BaseCradle) => new SqliteTransactionRunner(db),
      {
        lifetime: Lifetime.SINGLETON,
      },
    ),
    idPort: asClass(NanoIdPort, { lifetime: Lifetime.SINGLETON }),
    clock: asClass(SystemClock, { lifetime: Lifetime.SINGLETON }),
    identity: asClass(TelegramIdentityPort, { lifetime: Lifetime.SINGLETON }),
    notifier: asFunction(
      ({ bot, config, logger }: BaseCradle & { logger: LoggerPort }) =>
        new TelegramNotifier(bot, logger, config.botUsername),
      { lifetime: Lifetime.SINGLETON },
    ),
    statusService: asFunction(
      ({ repository, logger }: { repository: GameRepository; logger: LoggerPort }) =>
        new InMemoryGameStatusService(repository, logger),
      { lifetime: Lifetime.SINGLETON },
    ),
    gameServiceContext: asFunction(
      ({
        engine,
        repository,
        transactionRunner,
        notifier,
        identity,
        idPort,
        clock,
        logger,
        texts,
        config,
        statusService,
      }: ServiceCradle) =>
        new GameServiceContext({
          engine,
          repository,
          transactionRunner,
          notifier,
          identity,
          idPort,
          clock,
          logger,
          texts,
          limits: {
            minPlayers: config.minPlayers,
            maxPlayers: config.maxPlayers,
          },
          statusService,
        }),
      { lifetime: Lifetime.SINGLETON },
    ),
    configDraftStore: asClass(ConfigDraftStore, {
      lifetime: Lifetime.SINGLETON,
    }),
    expectationStore: asClass(PrivateExpectationStore, {
      lifetime: Lifetime.SINGLETON,
    }),
    uiStateStore: asClass(PregameUiStateStore, {
      lifetime: Lifetime.SINGLETON,
    }),
    normalModeServiceApp: asFunction(
      ({ gameServiceContext }: { gameServiceContext: GameServiceContext }) =>
        new NormalModeService(gameServiceContext),
      { lifetime: Lifetime.SINGLETON },
    ),
    reverseModeServiceApp: asFunction(
      ({ gameServiceContext }: { gameServiceContext: GameServiceContext }) =>
        new ReverseModeService(gameServiceContext),
      { lifetime: Lifetime.SINGLETON },
    ),
    pregameUiSubscriber: asFunction(
      ({
        gameServiceContext,
        configDraftStore,
        expectationStore,
        uiStateStore,
      }: InternalCradle) =>
        new PregameUiStatusSubscriber(
          gameServiceContext,
          configDraftStore,
          expectationStore,
          uiStateStore,
        ),
      { lifetime: Lifetime.SINGLETON },
    ),
    gameFlowSubscriber: asFunction(
      ({
        gameServiceContext,
        normalModeServiceApp,
        reverseModeServiceApp,
      }: InternalCradle) =>
        new GameFlowStatusSubscriber(gameServiceContext, [
          normalModeServiceApp,
          reverseModeServiceApp,
        ]),
      { lifetime: Lifetime.SINGLETON },
    ),
    commandResolver: asFunction(
      ({ texts }: BaseCradle) => new ChatCommandResolver(texts),
      {
        lifetime: Lifetime.SINGLETON,
      },
    ),
    commandSync: asFunction(
      ({ bot, repository, statusService, commandResolver, logger, texts }: {
        bot: Bot;
        repository: GameRepository;
        statusService: GameStatusService;
        commandResolver: ChatCommandResolver;
        logger: LoggerPort;
        texts: TextService;
      }) =>
        new TelegramCommandSync(
          bot.api,
          repository,
          statusService,
          commandResolver,
          logger,
          texts,
        ),
      { lifetime: Lifetime.SINGLETON },
    ),
    gameService: asFunction(
      ({
        engine,
        repository,
        transactionRunner,
        notifier,
        identity,
        idPort,
        clock,
        logger,
        texts,
        config,
        statusService,
        configDraftStore,
        expectationStore,
      }: ServiceCradle) =>
        new GameService(
          engine,
          repository,
          transactionRunner,
          notifier,
          identity,
          idPort,
          clock,
          logger,
          texts,
          {
            minPlayers: config.minPlayers,
            maxPlayers: config.maxPlayers,
          },
          statusService,
          configDraftStore,
          expectationStore,
        ),
      { lifetime: Lifetime.SINGLETON },
    ),
  });

  return container;
};

