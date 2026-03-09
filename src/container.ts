import Database from "better-sqlite3";
import { asClass, asFunction, asValue, createContainer, InjectionMode, Lifetime } from "awilix";
import { Bot } from "grammy";
import { AppConfig, loadConfig } from "./config";
import { GameService } from "./application/game-service";
import { ClockPort, GameRepository, IdentityPort, LoggerPort, NotifierPort, TransactionRunner } from "./application/ports";
import { GameEngine } from "./domain/game-engine";
import { ConsoleLogger } from "./infrastructure/logger";
import { createDatabase } from "./infrastructure/sqlite/db";
import { SqliteGameRepository } from "./infrastructure/sqlite/game-repository";
import { SqliteTransactionRunner } from "./infrastructure/sqlite/transaction-runner";
import { NanoIdPort } from "./infrastructure/id-port";
import { SystemClock } from "./infrastructure/clock";
import { TelegramIdentityPort } from "./infrastructure/identity";
import { TelegramNotifier } from "./adapters/telegram/telegram-notifier";

interface BaseCradle {
  config: AppConfig;
  bot: Bot;
  db: Database.Database;
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
    gameService: asFunction(
      ({ engine, repository, transactionRunner, notifier, identity, idPort, clock, logger, config }: ServiceCradle) =>
        new GameService(engine, repository, transactionRunner, notifier, identity, idPort, clock, logger, {
          minPlayers: config.minPlayers,
          maxPlayers: config.maxPlayers,
        }),
      { lifetime: Lifetime.SINGLETON },
    ),
  });

  return container;
};
