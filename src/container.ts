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
import { GameQueryService } from "./application/game-query-service.js";
import { GameService } from "./application/game-service.js";
import { GameServiceContext } from "./application/game-service-context.js";
import { PregameUiSyncService } from "./application/pregame-ui-sync-service.js";
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
import { ConfigurationStageService } from "./application/stages/configuration-stage-service.js";
import { NormalPairingStageService } from "./application/stages/normal-pairing-stage-service.js";
import { ReadyStartStageService } from "./application/stages/ready-start-stage-service.js";
import { WordPreparationStageService } from "./application/stages/word-preparation-stage-service.js";
import { ConfigDraftStore } from "./application/stores/config-draft-store.js";
import { PrivateExpectationStore } from "./application/stores/private-expectation-store.js";
import { TelegramCommandSync } from "./adapters/telegram/telegram-command-sync.js";
import { TelegramNotifier } from "./adapters/telegram/telegram-notifier.js";
import { GameEngine } from "./domain/game-engine.js";
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

interface ServiceCradle extends BaseCradle {
  engine: GameEngine;
  repository: GameRepository;
  transactionRunner: TransactionRunner;
  notifier: NotifierPort;
  identity: IdentityPort;
  idPort: NanoIdPort;
  clock: ClockPort;
  logger: LoggerPort;
}

interface InternalCradle extends ServiceCradle {
  gameServiceContext: GameServiceContext;
  configDraftStore: ConfigDraftStore;
  expectationStore: PrivateExpectationStore;
  normalModeService: NormalModeService;
  reverseModeService: ReverseModeService;
  pregameUiSync: PregameUiSyncService;
  readyStartStage: ReadyStartStageService;
  wordPreparationStage: WordPreparationStageService;
  normalPairingStage: NormalPairingStageService;
}

interface CommandsCradle extends BaseCradle {
  logger: LoggerPort;
  queryService: GameQueryService;
  commandResolver: ChatCommandResolver;
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
    engine: asClass(GameEngine, { lifetime: Lifetime.SINGLETON }),
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
        }),
      { lifetime: Lifetime.SINGLETON },
    ),
    configDraftStore: asClass(ConfigDraftStore, {
      lifetime: Lifetime.SINGLETON,
    }),
    expectationStore: asClass(PrivateExpectationStore, {
      lifetime: Lifetime.SINGLETON,
    }),
    pregameUiSync: asFunction(
      ({ gameServiceContext, configDraftStore, expectationStore }: InternalCradle) =>
        new PregameUiSyncService(
          gameServiceContext,
          configDraftStore,
          expectationStore,
        ),
      { lifetime: Lifetime.SINGLETON },
    ),
    normalModeService: asFunction(
      ({ gameServiceContext }: { gameServiceContext: GameServiceContext }) =>
        new NormalModeService(gameServiceContext),
      { lifetime: Lifetime.SINGLETON },
    ),
    reverseModeService: asFunction(
      ({ gameServiceContext }: { gameServiceContext: GameServiceContext }) =>
        new ReverseModeService(gameServiceContext),
      { lifetime: Lifetime.SINGLETON },
    ),
    readyStartStage: asFunction(
      ({
        gameServiceContext,
        pregameUiSync,
        normalModeService,
        reverseModeService,
      }: InternalCradle) =>
        new ReadyStartStageService(gameServiceContext, pregameUiSync, [
          normalModeService,
          reverseModeService,
        ]),
      { lifetime: Lifetime.SINGLETON },
    ),
    wordPreparationStage: asFunction(
      ({
        gameServiceContext,
        expectationStore,
        readyStartStage,
        pregameUiSync,
      }: InternalCradle) =>
        new WordPreparationStageService(
          gameServiceContext,
          expectationStore,
          readyStartStage,
          pregameUiSync,
        ),
      { lifetime: Lifetime.SINGLETON },
    ),
    normalPairingStage: asFunction(
      ({ gameServiceContext, wordPreparationStage, pregameUiSync }: InternalCradle) =>
        new NormalPairingStageService(
          gameServiceContext,
          wordPreparationStage,
          pregameUiSync,
        ),
      { lifetime: Lifetime.SINGLETON },
    ),
    configurationStage: asFunction(
      ({
        gameServiceContext,
        configDraftStore,
        normalPairingStage,
        wordPreparationStage,
        pregameUiSync,
      }: InternalCradle) =>
        new ConfigurationStageService(
          gameServiceContext,
          configDraftStore,
          normalPairingStage,
          wordPreparationStage,
          pregameUiSync,
        ),
      { lifetime: Lifetime.SINGLETON },
    ),
    queryService: asFunction(
      ({ repository }: { repository: GameRepository }) =>
        new GameQueryService(repository),
      {
        lifetime: Lifetime.SINGLETON,
      },
    ),
    commandResolver: asFunction(
      ({ texts }: BaseCradle) => new ChatCommandResolver(texts),
      {
        lifetime: Lifetime.SINGLETON,
      },
    ),
    commandSync: asFunction(
      ({ bot, queryService, commandResolver, logger, texts }: CommandsCradle) =>
        new TelegramCommandSync(
          bot.api,
          queryService,
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
        ),
      { lifetime: Lifetime.SINGLETON },
    ),
  });

  return container;
};
