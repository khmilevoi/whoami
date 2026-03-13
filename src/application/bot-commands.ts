import { TextService } from "./text-service.js";

export interface BotCommandDef {
  command: string;
  description: string;
}

export interface MemberCommandOverride {
  telegramUserId: string;
  commands: BotCommandDef[];
}

export interface ChatCommandResolution {
  chatCommands: BotCommandDef[];
  memberOverrides: MemberCommandOverride[];
}

export interface BotCommandCatalog {
  BOT_COMMANDS: Record<
    | "START_PRIVATE"
    | "START_GAME"
    | "CANCEL"
    | "GIVEUP",
    BotCommandDef
  >;
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
  } as const satisfies Record<string, BotCommandDef>;

  return {
    BOT_COMMANDS,
    PRIVATE_COMMANDS: [BOT_COMMANDS.START_PRIVATE],
    GROUP_COMMANDS: [BOT_COMMANDS.START_GAME],
    noGameResolution: () => ({
      chatCommands: [BOT_COMMANDS.START_GAME],
      memberOverrides: [],
    }),
  };
};
