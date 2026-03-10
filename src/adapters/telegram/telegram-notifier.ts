import * as appErrors from "../../domain/errors";
import { Bot, InlineKeyboard } from "grammy";
import { LoggerPort, NotifierPort } from "../../application/ports";

type Button = { text: string; data: string };

const toKeyboard = (rows: Button[][]): InlineKeyboard => {
  const keyboard = new InlineKeyboard();
  rows.forEach((row, index) => {
    row.forEach((button) => {
      keyboard.text(button.text, button.data);
    });

    if (index < rows.length - 1) {
      keyboard.row();
    }
  });
  return keyboard;
};

export class TelegramNotifier implements NotifierPort {
  constructor(
    private readonly bot: Bot,
    private readonly logger: LoggerPort,
    private readonly botUsername?: string,
  ) {}

  async sendGroupMessage(chatId: string, text: string) {
    const result = await this.bot.api.sendMessage(chatId, text).catch(
      (error) =>
        new appErrors.TelegramApiError({
          operation: `sendGroupMessage:${chatId}`,
          cause: error,
        }),
    );
    if (result instanceof Error) {
      return result;
    }
  }

  async sendGroupKeyboard(chatId: string, text: string, buttons: Button[][]) {
    const result = await this.bot.api
      .sendMessage(chatId, text, {
        reply_markup: toKeyboard(buttons),
      })
      .catch(
        (error) =>
          new appErrors.TelegramApiError({
            operation: `sendGroupKeyboard:${chatId}`,
            cause: error,
          }),
      );
    if (result instanceof Error) {
      return result;
    }
  }

  async sendPrivateMessage(userId: string, text: string): Promise<boolean> {
    const result = await this.bot.api.sendMessage(userId, text).catch(
      (error) =>
        new appErrors.TelegramApiError({
          operation: `sendPrivateMessage:${userId}`,
          cause: error,
        }),
    );
    if (result instanceof Error) {
      this.logger.warn("telegram_private_message_failed", {
        userId,
        reason: result.message,
      });
      return false;
    }
    return true;
  }

  async sendPrivateKeyboard(
    userId: string,
    text: string,
    buttons: Button[][],
  ): Promise<boolean> {
    const result = await this.bot.api
      .sendMessage(userId, text, {
        reply_markup: toKeyboard(buttons),
      })
      .catch(
        (error) =>
          new appErrors.TelegramApiError({
            operation: `sendPrivateKeyboard:${userId}`,
            cause: error,
          }),
      );
    if (result instanceof Error) {
      this.logger.warn("telegram_private_keyboard_failed", {
        userId,
        reason: result.message,
      });
      return false;
    }
    return true;
  }

  buildBotDeepLink(): string {
    return this.botUsername
      ? `https://t.me/${this.botUsername}`
      : "https://t.me";
  }
}
