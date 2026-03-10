import * as errore from "errore";
import express, { type Request, type Response } from "express";
import { Bot } from "grammy";
import { LoggerPort } from "../../application/ports.js";
import { WebhookAppError, WebhookHandlingError } from "../../domain/errors.js";

type HealthResponse = { ok: boolean };
type TelegramUpdate = Parameters<Bot["handleUpdate"]>[0];

const toUpdate = (payload: unknown): TelegramUpdate =>
  payload as TelegramUpdate;

const logWebhookError = (logger: LoggerPort, error: WebhookAppError): void => {
  errore.matchError(error, {
    WebhookHandlingError: (typedError) => {
      logger.error("telegram_webhook_error", {
        error: typedError.message,
      });
    },
    Error: (unexpected) => {
      logger.error("telegram_webhook_error", {
        error: unexpected.message,
      });
    },
  });
};

export const buildHttpServer = (bot: Bot, logger: LoggerPort) => {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req: Request, res: Response<HealthResponse>) => {
    res.status(200).json({ ok: true });
  });

  app.post(
    "/telegram/webhook",
    async (req: Request, res: Response<HealthResponse>) => {
      const result = await bot
        .handleUpdate(toUpdate(req.body))
        .catch((cause) => new WebhookHandlingError({ cause }));
      if (result instanceof Error) {
        logWebhookError(logger, result);
        res.status(500).json({ ok: false });
        return;
      }

      res.status(200).json({ ok: true });
    },
  );

  return app;
};
