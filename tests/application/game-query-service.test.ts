import { describe, expect, it } from "vitest";
import { GameQueryService } from "../../src/application/game-query-service.js";
import { createGameServiceHarness } from "./game-service.harness.js";

describe("game query service", () => {
  it("finds active games and aggregates active chat ids for a telegram user", async () => {
    const harness = createGameServiceHarness();
    const query = new GameQueryService(harness.repository);
    const sharedActor = harness.createActor(1);

    await harness.service.startGame("chat-query-a", sharedActor);
    await harness.service.joinGame("chat-query-a", harness.createActor(2));
    await harness.service.startGame("chat-query-b", sharedActor);
    await harness.service.joinGame("chat-query-b", harness.createActor(3));
    await harness.service.startGame("chat-query-c", harness.createActor(4));

    expect(query.findActiveGameByChatId("chat-query-a")?.chatId).toBe("chat-query-a");
    expect(query.findActiveGameByChatId("missing-chat")).toBeNull();
    expect(
      query.listActiveChatIdsByTelegramUser(sharedActor.telegramUserId).sort(),
    ).toEqual(["chat-query-a", "chat-query-b"]);
    expect(query.listActiveChatIdsByTelegramUser("404")).toEqual([]);
    expect(query.listActiveChatIds().sort()).toEqual([
      "chat-query-a",
      "chat-query-b",
      "chat-query-c",
    ]);
  });

  it("keeps known chats and known chat members after a game is canceled", async () => {
    const harness = createGameServiceHarness({ minPlayers: 2 });
    const query = new GameQueryService(harness.repository);
    const actors = harness.createActors(2);

    await harness.service.startGame("chat-known", actors[0]!);
    await harness.service.joinGame("chat-known", actors[1]!);
    await harness.service.cancel("chat-known", actors[0]!.telegramUserId);

    await harness.service.startGame("chat-still-active", harness.createActor(3));

    expect(query.findActiveGameByChatId("chat-known")).toBeNull();
    expect(query.listKnownChatIds()).toEqual(["chat-still-active", "chat-known"]);
    expect(query.listKnownTelegramUserIdsByChatId("chat-known")).toEqual([
      actors[0]!.telegramUserId,
      actors[1]!.telegramUserId,
    ]);
  });
});
