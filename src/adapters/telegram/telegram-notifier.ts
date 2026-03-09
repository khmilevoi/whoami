import { Bot, InlineKeyboard } from "grammy";
import { NotifierPort } from "../../application/ports";

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
  constructor(private readonly bot: Bot, private readonly botUsername?: string) {}

  async sendGroupMessage(chatId: string, text: string): Promise<void> {
    await this.bot.api.sendMessage(chatId, text);
  }

  async sendGroupKeyboard(chatId: string, text: string, buttons: Button[][]): Promise<void> {
    await this.bot.api.sendMessage(chatId, text, {
      reply_markup: toKeyboard(buttons),
    });
  }

  async sendPrivateMessage(userId: string, text: string): Promise<boolean> {
    try {
      await this.bot.api.sendMessage(userId, text);
      return true;
    } catch {
      return false;
    }
  }

  async sendPrivateKeyboard(userId: string, text: string, buttons: Button[][]): Promise<boolean> {
    try {
      await this.bot.api.sendMessage(userId, text, {
        reply_markup: toKeyboard(buttons),
      });
      return true;
    } catch {
      return false;
    }
  }

  buildBotDeepLink(): string {
    return this.botUsername ? `https://t.me/${this.botUsername}` : "https://t.me";
  }
}

