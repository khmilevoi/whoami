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

export const BOT_COMMANDS = {
  START_PRIVATE: { command: "start", description: "Открыть личный чат с ботом" },
  START_GAME: { command: "whoami_start", description: "Создать новую игру" },
  JOIN: { command: "join", description: "Войти в игру" },
  CONFIG: { command: "whoami_config", description: "Закрыть набор и настроить" },
  CANCEL: { command: "whoami_cancel", description: "Отменить игру" },
  GIVEUP: { command: "giveup", description: "Сдаться" },
  ASK: { command: "ask", description: "Запустить опрос (оффлайн)" },
} as const satisfies Record<string, BotCommandDef>;

export const PRIVATE_COMMANDS: BotCommandDef[] = [BOT_COMMANDS.START_PRIVATE];

export const noGameResolution = (): ChatCommandResolution => ({
  chatCommands: [BOT_COMMANDS.START_GAME],
  memberOverrides: [],
});
