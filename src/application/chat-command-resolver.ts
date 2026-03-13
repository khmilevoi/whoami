import { createBotCommands, ChatCommandResolution } from "./bot-commands.js";
import { GameStatusSnapshot } from "./game-status-service.js";
import { TextService } from "./text-service.js";

export class ChatCommandResolver {
  private readonly commands;

  constructor(texts: TextService) {
    this.commands = createBotCommands(texts);
  }

  resolve(snapshot: GameStatusSnapshot | null): ChatCommandResolution {
    if (!snapshot || !snapshot.hasActiveGame) {
      return this.commands.noGameResolution();
    }

    if (snapshot.stage === "IN_PROGRESS") {
      return {
        chatCommands: [this.commands.BOT_COMMANDS.GIVEUP],
        memberOverrides: [],
      };
    }

    return {
      chatCommands: [],
      memberOverrides: [
        {
          telegramUserId: snapshot.creatorTelegramUserId,
          commands: [this.commands.BOT_COMMANDS.CANCEL],
        },
      ],
    };
  }
}
