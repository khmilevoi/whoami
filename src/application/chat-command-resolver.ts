import { BotCommandId, ChatCommandResolution } from "./bot-commands.js";
import { GameStatusSnapshot } from "./game-status-service.js";

export class ChatCommandResolver {
  resolve(snapshot: GameStatusSnapshot | null): ChatCommandResolution {
    if (!snapshot || !snapshot.hasActiveGame) {
      return {
        chatCommands: ["START_GAME"],
        memberOverrides: [],
      };
    }

    if (snapshot.stage === "IN_PROGRESS") {
      return {
        chatCommands: ["GIVEUP"],
        memberOverrides: [],
      };
    }

    return {
      chatCommands: [],
      memberOverrides: [
        {
          telegramUserId: snapshot.creatorTelegramUserId,
          commands: ["CANCEL"],
        },
      ],
    };
  }
}

