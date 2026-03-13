import { GameState } from "../domain/types.js";
import { createBotCommands, ChatCommandResolution } from "./bot-commands.js";
import { TextService } from "./text-service.js";

export class ChatCommandResolver {
  private readonly commands;

  constructor(texts: TextService) {
    this.commands = createBotCommands(texts);
  }

  resolve(game: GameState | null): ChatCommandResolution {
    if (!game) {
      return this.commands.noGameResolution();
    }

    if (game.stage === "LOBBY_OPEN") {
      return {
        chatCommands: [],
        memberOverrides: [
          {
            telegramUserId: game.creatorTelegramUserId,
            commands: [this.commands.BOT_COMMANDS.CANCEL],
          },
        ],
      };
    }

    if (
      game.stage === "LOBBY_CLOSED" ||
      game.stage === "CONFIGURING" ||
      game.stage === "PREPARE_WORDS" ||
      game.stage === "READY_WAIT"
    ) {
      return {
        chatCommands: [],
        memberOverrides: [
          {
            telegramUserId: game.creatorTelegramUserId,
            commands: [this.commands.BOT_COMMANDS.CANCEL],
          },
        ],
      };
    }

    if (game.stage === "IN_PROGRESS") {
      return {
        chatCommands: [this.commands.BOT_COMMANDS.GIVEUP],
        memberOverrides: [],
      };
    }

    return this.commands.noGameResolution();
  }
}
