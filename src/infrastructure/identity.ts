import { IdentityPort } from "../application/ports";
import { PlayerIdentity } from "../domain/types";

export class TelegramIdentityPort implements IdentityPort {
  toPlayerIdentity(input: {
    telegramUserId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
  }): PlayerIdentity {
    const display =
      [input.firstName, input.lastName].filter(Boolean).join(" ").trim() ||
      input.username ||
      input.telegramUserId;

    return {
      id: `tg:${input.telegramUserId}`,
      telegramUserId: input.telegramUserId,
      username: input.username,
      displayName: display,
    };
  }
}
