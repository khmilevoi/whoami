import { IdentityPort } from "../../src/application/ports";
import { PlayerIdentity } from "../../src/domain/types";

export class FakeIdentityPort implements IdentityPort {
  toPlayerIdentity(input: {
    telegramUserId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
  }): PlayerIdentity {
    const displayName = [input.firstName, input.lastName].filter(Boolean).join(" ").trim() || input.username || input.telegramUserId;

    return {
      id: `tg:${input.telegramUserId}`,
      telegramUserId: input.telegramUserId,
      username: input.username,
      displayName,
    };
  }
}
