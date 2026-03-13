import { describe, expect, it } from "vitest";
import { GameConfigurationNotSetError } from "../../src/domain/errors.js";
import { createGameServiceHarness } from "./game-service.harness.js";

describe("game service public entrypoints", () => {
  it("ignores group gameplay input until the game reaches an in-progress configured state", async () => {
    const harness = createGameServiceHarness();
    const actors = harness.createActors(3);
    const chatId = "chat-entrypoint-ignore";

    await harness.service.startGame(chatId, actors[0]!);
    await harness.service.joinGame(chatId, actors[1]!);
    await harness.service.joinGame(chatId, actors[2]!);
    await harness.service.handleGroupText(chatId, actors[0]!.telegramUserId, "question");

    let game = harness.getGameByChat(chatId);
    expect(game.stage).toBe("LOBBY_OPEN");
    expect(game.turns).toEqual([]);

    await harness.service.beginConfiguration(chatId, actors[0]!.telegramUserId);
    game = harness.getGameByChat(chatId);
    await harness.service.handleGroupText(chatId, actors[0]!.telegramUserId, "question");

    const stillConfiguring = harness.getGameById(game.id);
    expect(stillConfiguring.stage).toBe("CONFIGURING");
    expect(stillConfiguring.turns).toEqual([]);
  });

  it("returns a configuration error when voting is requested before game mode is set", async () => {
    const harness = createGameServiceHarness({ minPlayers: 2 });
    const actors = harness.createActors(2);
    const chatId = "chat-entrypoint-vote";

    await harness.service.startGame(chatId, actors[0]!);
    await harness.service.joinGame(chatId, actors[1]!);

    const game = harness.getGameByChat(chatId);

    await expect(
      harness.service.handleVote(game.id, actors[0]!.telegramUserId, "NO"),
    ).resolves.toBeInstanceOf(GameConfigurationNotSetError);
  });
});

it("persists fallback locale and locale source when the public api receives a bare telegram id", async () => {
  const harness = createGameServiceHarness();
  harness.identity.toPlayerIdentity = ({ telegramUserId }) => ({
    id: `tg:${telegramUserId}`,
    telegramUserId,
    displayName: telegramUserId,
    locale: undefined,
    localeSource: undefined,
  });

  await harness.service.startGame("chat-entrypoint-string-actor", "99");

  const game = harness.getGameByChat("chat-entrypoint-string-actor");
  expect(game.players[0]).toMatchObject({
    telegramUserId: "99",
    displayName: "99",
    locale: harness.texts.locale,
    localeSource: "telegram",
  });
  expect(harness.repository.findPlayerProfileByTelegramUserId("99")).toMatchObject({
    locale: harness.texts.locale,
    localeSource: "telegram",
  });
});
