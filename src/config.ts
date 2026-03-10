import dotenv from "dotenv";

dotenv.config();

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export interface AppConfig {
  appPort: number;
  botToken: string;
  webhookUrl?: string;
  botUsername?: string;
  dbPath: string;
  minPlayers: number;
  maxPlayers: number;
  questionTimeoutSec: number;
  voteTimeoutSec: number;
}

export const loadConfig = (): AppConfig => {
  const botToken = process.env["BOT_TOKEN"] ?? "";

  return {
    appPort: toInt(process.env["APP_PORT"], 3000),
    botToken,
    webhookUrl: process.env["WEBHOOK_URL"],
    botUsername: process.env["BOT_USERNAME"],
    dbPath: process.env["DB_PATH"] ?? "./data/whoami.sqlite",
    minPlayers: toInt(process.env["MIN_PLAYERS"], 3),
    maxPlayers: toInt(process.env["MAX_PLAYERS"], 20),
    questionTimeoutSec: toInt(process.env["QUESTION_TIMEOUT_SEC"], 120),
    voteTimeoutSec: toInt(process.env["VOTE_TIMEOUT_SEC"], 90),
  };
};
