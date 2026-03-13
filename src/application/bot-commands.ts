import { TextService } from "./text-service.js";

export type BotCommandId =
  | "START_PRIVATE"
  | "LANGUAGE"
  | "START_GAME"
  | "CANCEL"
  | "GIVEUP";

export interface BotCommandDef {
  command: string;
  description: string;
}

export interface MemberCommandOverride {
  telegramUserId: string;
  commands: BotCommandId[];
}

export interface ChatCommandResolution {
  chatCommands: BotCommandId[];
  memberOverrides: MemberCommandOverride[];
}

export interface BotCommandCatalog {
  BOT_COMMANDS: Record<BotCommandId, BotCommandDef>;
  PRIVATE_COMMANDS: BotCommandDef[];
  GROUP_COMMANDS: BotCommandDef[];
  noGameResolution: () => ChatCommandResolution;
}

export const createBotCommands = (texts: TextService): BotCommandCatalog => {
  const BOT_COMMANDS = {
    START_PRIVATE: {
      command: "start",
      description: texts.commandOpenPrivateChatDescription(),
    },
    LANGUAGE: {
      command: "language",
      description: texts.commandLanguageDescription(),
    },
    START_GAME: {
      command: "whoami_start",
      description: texts.commandCreateGameDescription(),
    },
    CANCEL: {
      command: "whoami_cancel",
      description: texts.commandCancelGameDescription(),
    },
    GIVEUP: {
      command: "giveup",
      description: texts.commandGiveUpDescription(),
    },
  } as const satisfies Record<BotCommandId, BotCommandDef>;

  return {
    BOT_COMMANDS,
    PRIVATE_COMMANDS: [BOT_COMMANDS.START_PRIVATE, BOT_COMMANDS.LANGUAGE],
    GROUP_COMMANDS: [BOT_COMMANDS.START_GAME],
    noGameResolution: () => ({
      chatCommands: ["START_GAME"],
      memberOverrides: [],
    }),
  };
};
