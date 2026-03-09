import { GameState } from "../domain/types";
import { BOT_COMMANDS, ChatCommandResolution, noGameResolution } from "./bot-commands";

const toPlayerTelegramUserId = (game: GameState, playerId: string | undefined): string | null => {
  if (!playerId) {
    return null;
  }

  const player = game.players.find((candidate) => candidate.id === playerId);
  return player?.telegramUserId ?? null;
};

export class ChatCommandResolver {
  resolve(game: GameState | null): ChatCommandResolution {
    if (!game) {
      return noGameResolution();
    }

    if (game.stage === "LOBBY_OPEN") {
      return {
        chatCommands: [BOT_COMMANDS.JOIN],
        memberOverrides: [
          {
            telegramUserId: game.creatorTelegramUserId,
            commands: [BOT_COMMANDS.CONFIG, BOT_COMMANDS.CANCEL],
          },
        ],
      };
    }

    if (game.stage === "LOBBY_CLOSED" || game.stage === "CONFIGURING" || game.stage === "PREPARE_WORDS" || game.stage === "READY_WAIT") {
      return {
        chatCommands: [],
        memberOverrides: [
          {
            telegramUserId: game.creatorTelegramUserId,
            commands: [BOT_COMMANDS.CANCEL],
          },
        ],
      };
    }

    if (game.stage === "IN_PROGRESS") {
      const chatCommands = [BOT_COMMANDS.GIVEUP];
      const memberOverrides = [] as ChatCommandResolution["memberOverrides"];

      if (game.config?.playMode === "OFFLINE") {
        const askerId = game.inProgress.turnOrder[game.inProgress.turnCursor];
        const askerTelegramUserId = toPlayerTelegramUserId(game, askerId);
        if (askerTelegramUserId) {
          memberOverrides.push({
            telegramUserId: askerTelegramUserId,
            commands: [BOT_COMMANDS.GIVEUP, BOT_COMMANDS.ASK],
          });
        }
      }

      return {
        chatCommands,
        memberOverrides,
      };
    }

    return noGameResolution();
  }
}
