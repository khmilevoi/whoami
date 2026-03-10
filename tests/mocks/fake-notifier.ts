import type { NotificationError } from "../../src/domain/errors";
import { NotifierPort } from "../../src/application/ports";

type Button = { text: string; data: string };

export interface SentGroupMessage {
  kind: "group-message";
  chatId: string;
  text: string;
}

export interface SentGroupKeyboard {
  kind: "group-keyboard";
  chatId: string;
  text: string;
  buttons: Button[][];
}

export interface SentPrivateMessage {
  kind: "private-message";
  userId: string;
  text: string;
}

export interface SentPrivateKeyboard {
  kind: "private-keyboard";
  userId: string;
  text: string;
  buttons: Button[][];
}

export type SentNotification =
  | SentGroupMessage
  | SentGroupKeyboard
  | SentPrivateMessage
  | SentPrivateKeyboard;

const cloneButtons = (buttons: Button[][]): Button[][] =>
  buttons.map((row) => row.map((button) => ({ ...button })));

export class FakeNotifier implements NotifierPort {
  readonly sent: SentNotification[] = [];
  readonly failedPrivateMessages = new Set<string>();
  readonly failedPrivateKeyboards = new Set<string>();

  constructor(private readonly deepLink = "https://t.me/fake_bot") {}

  setPrivateMessageFailure(userId: string): void {
    this.failedPrivateMessages.add(userId);
  }

  setPrivateKeyboardFailure(userId: string): void {
    this.failedPrivateKeyboards.add(userId);
  }

  async sendGroupMessage(
    chatId: string,
    text: string,
  ): Promise<void | NotificationError> {
    this.sent.push({ kind: "group-message", chatId, text });
  }

  async sendGroupKeyboard(
    chatId: string,
    text: string,
    buttons: Button[][],
  ): Promise<void | NotificationError> {
    this.sent.push({
      kind: "group-keyboard",
      chatId,
      text,
      buttons: cloneButtons(buttons),
    });
  }

  async sendPrivateMessage(userId: string, text: string): Promise<boolean> {
    if (this.failedPrivateMessages.has(userId)) {
      return false;
    }

    this.sent.push({ kind: "private-message", userId, text });
    return true;
  }

  async sendPrivateKeyboard(
    userId: string,
    text: string,
    buttons: Button[][],
  ): Promise<boolean> {
    if (this.failedPrivateKeyboards.has(userId)) {
      return false;
    }

    this.sent.push({
      kind: "private-keyboard",
      userId,
      text,
      buttons: cloneButtons(buttons),
    });
    return true;
  }

  buildBotDeepLink(): string {
    return this.deepLink;
  }
}
