import * as appErrors from "./domain/errors";
import { AwilixContainer } from "awilix";
import { Bot } from "grammy";
import { buildHttpServer } from "./adapters/http/server";
import { registerTelegramHandlers } from "./adapters/telegram/telegram-bot";
import { TelegramCommandSync } from "./adapters/telegram/telegram-command-sync";
import { GameService } from "./application/game-service";
import { LoggerPort } from "./application/ports";
import { TextService } from "./application/text-service";
import { loadConfig } from "./config";
import { buildContainer } from "./container";
import { runStartupTasks } from "./startup";

const start = async (): Promise<void | appErrors.StartAppError> => {
  const config = loadConfig();

  if (!config.botToken) {
    return new appErrors.MissingBotTokenError();
  }

  const container: AwilixContainer = buildContainer(config);
  const bot = container.resolve<Bot>("bot");
  const logger = container.resolve<LoggerPort>("logger");
  const texts = container.resolve<TextService>("texts");
  const gameService = container.resolve<GameService>("gameService");
  const commandSync = container.resolve<TelegramCommandSync>("commandSync");

  registerTelegramHandlers(bot, gameService, logger, texts, commandSync);

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
      const webhookResult = await bot.api
        .setWebhook(webhook)
        .catch((error) => new appErrors.TelegramApiError({ operation: "setWebhook", cause: error }));
      if (webhookResult instanceof Error) {
        logger.error("telegram_webhook_set_failed", { reason: webhookResult.message });
        return;
      }

      logger.info("telegram_webhook_set", { webhook });
      return;
    }

    bot.start();
    logger.info("telegram_polling_started");
  });
};

start().then((result) => {
  if (result instanceof Error) {
    console.error(result);
    process.exit(1);
  }
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
