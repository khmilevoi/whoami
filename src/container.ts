import Database from "better-sqlite3";
import { asClass, asFunction, asValue, createContainer, InjectionMode, Lifetime } from "awilix";
import { Bot } from "grammy";
import { AppConfig, loadConfig } from "./config";
import { ChatCommandResolver } from "./application/chat-command-resolver";
import { GameQueryService } from "./application/game-query-service";
import { GameService } from "./application/game-service";
import { GameServiceContext } from "./application/game-service-context";
import { TextService } from "./application/text-service";
import { ClockPort, GameRepository, IdentityPort, LoggerPort, NotifierPort, TransactionRunner } from "./application/ports";
import { NormalModeService } from "./application/modes/normal-mode-service";
import { ReverseModeService } from "./application/modes/reverse-mode-service";
import { ConfigurationStageService } from "./application/stages/configuration-stage-service";
import { NormalPairingStageService } from "./application/stages/normal-pairing-stage-service";
import { ReadyStartStageService } from "./application/stages/ready-start-stage-service";
import { WordPreparationStageService } from "./application/stages/word-preparation-stage-service";
import { ConfigDraftStore } from "./application/stores/config-draft-store";
import { PrivateExpectationStore } from "./application/stores/private-expectation-store";
import { TelegramCommandSync } from "./adapters/telegram/telegram-command-sync";
import { TelegramNotifier } from "./adapters/telegram/telegram-notifier";
import { GameEngine } from "./domain/game-engine";
import { SystemClock } from "./infrastructure/clock";
import { NanoIdPort } from "./infrastructure/id-port";
import { TelegramIdentityPort } from "./infrastructure/identity";
import { ConsoleLogger } from "./infrastructure/logger";
import { createDatabase } from "./infrastructure/sqlite/db";
import { SqliteGameRepository } from "./infrastructure/sqlite/game-repository";
import { SqliteTransactionRunner } from "./infrastructure/sqlite/transaction-runner";

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
    repository: asFunction(({ db }: BaseCradle) => new SqliteGameRepository(db), {
      lifetime: Lifetime.SINGLETON,
    }),
    transactionRunner: asFunction(({ db }: BaseCradle) => new SqliteTransactionRunner(db), {
      lifetime: Lifetime.SINGLETON,
    }),
    idPort: asClass(NanoIdPort, { lifetime: Lifetime.SINGLETON }),
    clock: asClass(SystemClock, { lifetime: Lifetime.SINGLETON }),
    identity: asClass(TelegramIdentityPort, { lifetime: Lifetime.SINGLETON }),
    notifier: asFunction(
      ({ bot, config }: BaseCradle) => new TelegramNotifier(bot, config.botUsername),
      { lifetime: Lifetime.SINGLETON },
    ),
    gameServiceContext: asFunction(
      ({ engine, repository, transactionRunner, notifier, identity, idPort, clock, logger, texts, config }: ServiceCradle) =>
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
    configDraftStore: asClass(ConfigDraftStore, { lifetime: Lifetime.SINGLETON }),
    expectationStore: asClass(PrivateExpectationStore, { lifetime: Lifetime.SINGLETON }),
    normalModeService: asFunction(
      ({ gameServiceContext }: { gameServiceContext: GameServiceContext }) => new NormalModeService(gameServiceContext),
      { lifetime: Lifetime.SINGLETON },
    ),
    reverseModeService: asFunction(
      ({ gameServiceContext }: { gameServiceContext: GameServiceContext }) => new ReverseModeService(gameServiceContext),
      { lifetime: Lifetime.SINGLETON },
    ),
    readyStartStage: asFunction(
      ({ gameServiceContext, normalModeService, reverseModeService }: InternalCradle) =>
        new ReadyStartStageService(gameServiceContext, [normalModeService, reverseModeService]),
      { lifetime: Lifetime.SINGLETON },
    ),
    wordPreparationStage: asFunction(
      ({ gameServiceContext, expectationStore, readyStartStage }: InternalCradle) =>
        new WordPreparationStageService(gameServiceContext, expectationStore, readyStartStage),
      { lifetime: Lifetime.SINGLETON },
    ),
    normalPairingStage: asFunction(
      ({ gameServiceContext, wordPreparationStage }: InternalCradle) =>
        new NormalPairingStageService(gameServiceContext, wordPreparationStage),
      { lifetime: Lifetime.SINGLETON },
    ),
    configurationStage: asFunction(
      ({ gameServiceContext, configDraftStore, normalPairingStage, wordPreparationStage }: InternalCradle) =>
        new ConfigurationStageService(gameServiceContext, configDraftStore, normalPairingStage, wordPreparationStage),
      { lifetime: Lifetime.SINGLETON },
    ),
    queryService: asFunction(({ repository }: { repository: GameRepository }) => new GameQueryService(repository), {
      lifetime: Lifetime.SINGLETON,
    }),
    commandResolver: asFunction(({ texts }: BaseCradle) => new ChatCommandResolver(texts), {
      lifetime: Lifetime.SINGLETON,
    }),
    commandSync: asFunction(
      ({ bot, queryService, commandResolver, logger, texts }: CommandsCradle) =>
        new TelegramCommandSync(bot.api, queryService, commandResolver, logger, texts),
      { lifetime: Lifetime.SINGLETON },
    ),
    gameService: asFunction(
      ({ engine, repository, transactionRunner, notifier, identity, idPort, clock, logger, texts, config }: ServiceCradle) =>
        new GameService(engine, repository, transactionRunner, notifier, identity, idPort, clock, logger, texts, {
          minPlayers: config.minPlayers,
          maxPlayers: config.maxPlayers,
        }),
      { lifetime: Lifetime.SINGLETON },
    ),
  });

  return container;
};
