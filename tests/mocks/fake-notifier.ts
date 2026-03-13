import type { NotificationError } from "../../src/domain/errors.js";
import { TelegramApiError } from "../../src/domain/errors.js";
import { UiButton } from "../../src/domain/types.js";
import { NotificationReceipt, NotifierPort } from "../../src/application/ports.js";

export interface SentGroupMessage {
  kind: "group-message" | "group-edit";
  chatId: string;
  text: string;
  buttons?: UiButton[][];
  messageId: number;
}

export interface SentPrivateMessage {
  kind: "private-message" | "private-keyboard" | "private-edit";
  userId: string;
  text: string;
  buttons?: UiButton[][];
  messageId: number;
}

export type SentNotification = SentGroupMessage | SentPrivateMessage;

const cloneButtons = (buttons: UiButton[][] | undefined): UiButton[][] | undefined =>
  buttons?.map((row) => row.map((button) => ({ ...button })));

export class FakeNotifier implements NotifierPort {
  readonly sent: SentNotification[] = [];
  readonly failedPrivateMessages = new Set<string>();
  readonly failedPrivateKeyboards = new Set<string>();
  readonly failedPrivateEdits = new Set<string>();
  readonly failedGroupEdits = new Set<string>();
  private messageId = 1;

  constructor(private readonly deepLink = "https://t.me/fake_bot") {}

  setPrivateMessageFailure(userId: string): void {
    this.failedPrivateMessages.add(userId);
  }

  setPrivateKeyboardFailure(userId: string): void {
    this.failedPrivateKeyboards.add(userId);
  }

  setPrivateEditFailure(userId: string): void {
    this.failedPrivateEdits.add(userId);
  }

  setGroupEditFailure(chatId: string): void {
    this.failedGroupEdits.add(chatId);
  }

  async sendGroupMessage(
    chatId: string,
    text: string,
  ): Promise<NotificationReceipt | NotificationError> {
    const receipt = { messageId: this.messageId++ };
    this.sent.push({ kind: "group-message", chatId, text, messageId: receipt.messageId });
    return receipt;
  }

  async sendGroupKeyboard(
    chatId: string,
    text: string,
    buttons: UiButton[][],
  ): Promise<NotificationReceipt | NotificationError> {
    const receipt = { messageId: this.messageId++ };
    this.sent.push({
      kind: "group-message",
      chatId,
      text,
      buttons: cloneButtons(buttons),
      messageId: receipt.messageId,
    });
    return receipt;
  }

  async editGroupMessage(
    chatId: string,
    messageId: number,
    text: string,
    buttons?: UiButton[][],
  ): Promise<NotificationReceipt | NotificationError> {
    if (this.failedGroupEdits.has(chatId)) {
      return new TelegramApiError({
        operation: "editMessageText",
        cause: new Error(`group-edit-failed:${chatId}`),
      });
    }

    this.sent.push({
      kind: "group-edit",
      chatId,
      text,
      buttons: cloneButtons(buttons),
      messageId,
    });
    return { messageId };
  }

  async sendPrivateMessage(
    userId: string,
    text: string,
  ): Promise<false | NotificationReceipt> {
    if (this.failedPrivateMessages.has(userId)) {
      return false;
    }

    const receipt = { messageId: this.messageId++ };
    this.sent.push({ kind: "private-message", userId, text, messageId: receipt.messageId });
    return receipt;
  }

  async sendPrivateKeyboard(
    userId: string,
    text: string,
    buttons: UiButton[][],
  ): Promise<false | NotificationReceipt> {
    if (
      this.failedPrivateKeyboards.has(userId) ||
      this.failedPrivateMessages.has(userId)
    ) {
      return false;
    }

    const receipt = { messageId: this.messageId++ };
    this.sent.push({
      kind: "private-keyboard",
      userId,
      text,
      buttons: cloneButtons(buttons),
      messageId: receipt.messageId,
    });
    return receipt;
  }

  async editPrivateMessage(
    userId: string,
    messageId: number,
    text: string,
    buttons?: UiButton[][],
  ): Promise<false | NotificationReceipt> {
    if (
      this.failedPrivateEdits.has(userId) ||
      this.failedPrivateMessages.has(userId) ||
      this.failedPrivateKeyboards.has(userId)
    ) {
      return false;
    }

    this.sent.push({
      kind: "private-edit",
      userId,
      text,
      buttons: cloneButtons(buttons),
      messageId,
    });
    return { messageId };
  }

  buildBotDeepLink(payload?: string): string {
    return payload ? `${this.deepLink}?start=${payload}` : this.deepLink;
  }

  buildGroupMessageLink(chatId: string, messageId: number): string | null {
    if (!chatId.startsWith("-100")) {
      return null;
    }

    return `https://t.me/c/${chatId.slice(4)}/${messageId}`;
  }
}
