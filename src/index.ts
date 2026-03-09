import { AwilixContainer } from "awilix";
import { Bot } from "grammy";
import { buildContainer } from "./container";
import { registerTelegramHandlers } from "./adapters/telegram/telegram-bot";
import { buildHttpServer } from "./adapters/http/server";
import { GameService } from "./application/game-service";
import { LoggerPort } from "./application/ports";
import { loadConfig } from "./config";

const start = async (): Promise<void> => {
  const config = loadConfig();

  if (!config.botToken) {
    throw new Error("BOT_TOKEN is required");
  }

  const container: AwilixContainer = buildContainer(config);
  const bot = container.resolve<Bot>("bot");
  const logger = container.resolve<LoggerPort>("logger");
  const gameService = container.resolve<GameService>("gameService");

  registerTelegramHandlers(bot, gameService, logger);

  const app = buildHttpServer(bot, logger);

  app.listen(config.appPort, async () => {
    logger.info("http_started", { port: config.appPort });

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
