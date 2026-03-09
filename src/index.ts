import { AwilixContainer } from "awilix";
import { Bot } from "grammy";
import { buildHttpServer } from "./adapters/http/server";
import { registerTelegramHandlers } from "./adapters/telegram/telegram-bot";
import { TelegramCommandSync } from "./adapters/telegram/telegram-command-sync";
import { GameService } from "./application/game-service";
import { LoggerPort } from "./application/ports";
import { loadConfig } from "./config";
import { buildContainer } from "./container";
import { runStartupTasks } from "./startup";

const start = async (): Promise<void> => {
  const config = loadConfig();

  if (!config.botToken) {
    throw new Error("BOT_TOKEN is required");
  }

  const container: AwilixContainer = buildContainer(config);
  const bot = container.resolve<Bot>("bot");
  const logger = container.resolve<LoggerPort>("logger");
  const gameService = container.resolve<GameService>("gameService");
  const commandSync = container.resolve<TelegramCommandSync>("commandSync");

  registerTelegramHandlers(bot, gameService, logger, commandSync);

  const app = buildHttpServer(bot, logger);

  app.listen(config.appPort, async () => {
    logger.info("http_started", { port: config.appPort });

    await runStartupTasks({
      commandSync,
      gameService,
      logger,
    });

    if (config.webhookUrl) {
      const webhook = `${config.webhookUrl.replace(/\/$/, "")}/telegram/webhook`;
      await bot.api.setWebhook(webhook);
      logger.info("telegram_webhook_set", { webhook });
      return;
    }

    bot.start();
    logger.info("telegram_polling_started");
  });
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});

