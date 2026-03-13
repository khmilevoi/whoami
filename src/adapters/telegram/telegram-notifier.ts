import * as appErrors from "../../domain/errors.js";
import { Bot } from "grammy";
import {
  LoggerPort,
  NotificationReceipt,
  NotifierPort,
} from "../../application/ports.js";
import { UiButton } from "../../domain/types.js";

type TelegramInlineButton =
  | {
      text: string;
      callback_data: string;
      style?: "primary" | "success" | "danger";
    }
  | {
      text: string;
      url: string;
      style?: "primary" | "success" | "danger";
    };

const toKeyboard = (rows: UiButton[][]) => ({
  inline_keyboard: rows.map((row) =>
    row.map((button): TelegramInlineButton =>
      button.kind === "callback"
        ? {
            text: button.text,
            callback_data: button.data,
            style: button.style,
          }
        : {
            text: button.text,
            url: button.url,
            style: button.style,
          },
    ),
  ),
});

const toReceipt = (result: { message_id?: number } | true): NotificationReceipt => ({
  messageId: result === true ? 0 : (result.message_id ?? 0),
});

const toInternalChatId = (chatId: string): string | null => {
  if (!chatId.startsWith("-100")) {
    return null;
  }

  return chatId.slice(4);
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

    return toReceipt(result);
  }

  async sendGroupKeyboard(chatId: string, text: string, buttons: UiButton[][]) {
    const result = await this.bot.api
      .sendMessage(chatId, text, {
        reply_markup: toKeyboard(buttons) as never,
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

    return toReceipt(result);
  }

  async editGroupMessage(
    chatId: string,
    messageId: number,
    text: string,
    buttons?: UiButton[][],
  ) {
    const result = await this.bot.api
      .editMessageText(chatId, messageId, text, {
        reply_markup: buttons ? (toKeyboard(buttons) as never) : undefined,
      })
      .catch(
        (error) =>
          new appErrors.TelegramApiError({
            operation: `editGroupMessage:${chatId}:${messageId}`,
            cause: error,
          }),
      );
    if (result instanceof Error) {
      return result;
    }

    return toReceipt(result);
  }

  async sendPrivateMessage(userId: string, text: string): Promise<false | NotificationReceipt> {
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
    return toReceipt(result);
  }

  async sendPrivateKeyboard(
    userId: string,
    text: string,
    buttons: UiButton[][],
  ): Promise<false | NotificationReceipt> {
    const result = await this.bot.api
      .sendMessage(userId, text, {
        reply_markup: toKeyboard(buttons) as never,
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
    return toReceipt(result);
  }

  async editPrivateMessage(
    userId: string,
    messageId: number,
    text: string,
    buttons?: UiButton[][],
  ): Promise<false | NotificationReceipt> {
    const result = await this.bot.api
      .editMessageText(userId, messageId, text, {
        reply_markup: buttons ? (toKeyboard(buttons) as never) : undefined,
      })
      .catch(
        (error) =>
          new appErrors.TelegramApiError({
            operation: `editPrivateMessage:${userId}:${messageId}`,
            cause: error,
          }),
      );
    if (result instanceof Error) {
      this.logger.warn("telegram_private_edit_failed", {
        userId,
        messageId,
        reason: result.message,
      });
      return false;
    }

    return toReceipt(result);
  }

  buildBotDeepLink(payload?: string): string {
    if (!this.botUsername) {
      return "https://t.me";
    }

    return payload
      ? `https://t.me/${this.botUsername}?start=${encodeURIComponent(payload)}`
      : `https://t.me/${this.botUsername}`;
  }

  buildGroupMessageLink(chatId: string, messageId: number): string | null {
    const internalChatId = toInternalChatId(chatId);
    if (!internalChatId) {
      return null;
    }

    return `https://t.me/c/${internalChatId}/${messageId}`;
  }
}
