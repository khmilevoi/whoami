import express from "express";
import { Bot } from "grammy";
import { LoggerPort } from "../../application/ports";

export const buildHttpServer = (bot: Bot, logger: LoggerPort) => {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.post("/telegram/webhook", async (req, res) => {
    try {
      await bot.handleUpdate(req.body);
      res.status(200).json({ ok: true });
    } catch (error) {
      logger.error("telegram_webhook_error", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ ok: false });
    }
  });

  return app;
};
