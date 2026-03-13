import { describe, expect, it } from "vitest";
import {
  ActiveGameNotFoundByChatError,
  GameNotFoundError,
  PlayerNotFoundInGameError,
} from "../../src/domain/errors.js";
import { createGameServiceComponentHarness } from "./game-service-components.harness.js";

describe("game service context", () => {
  it("resolves games and republishes snapshots through the status service", async () => {
    const components = createGameServiceComponentHarness();
    const actors = components.game.createActors(3);

    await components.game.service.startGame("chat-context", actors[0]!);
    await components.game.service.joinGame("chat-context", actors[1]!);
    await components.game.service.joinGame("chat-context", actors[2]!);

    const game = components.game.getGameByChat("chat-context");

    expect(components.context.getGameByChatOrError(game.chatId)).toMatchObject({
      id: game.id,
      chatId: game.chatId,
    });
    expect(components.context.getGameByChatOrError("missing-chat")).toBeInstanceOf(
      ActiveGameNotFoundByChatError,
    );
    expect(components.context.getGameByIdOrError("missing-game")).toBeInstanceOf(
      GameNotFoundError,
    );

    expect(components.context.statusService.getByGameId(game.id)).toBeNull();
    components.context.publishGameStatus(game);
    expect(components.context.statusService.getByGameId(game.id)?.gameId).toBe(game.id);

    components.context.republishGameStatus(game.id);
    expect(components.context.statusService.getByChatId(game.chatId)?.chatId).toBe(
      game.chatId,
    );
  });

  it("uses locale-aware text helpers and fallback player labels", async () => {
    const components = createGameServiceComponentHarness();
    const actors = components.game.createActors(3);

    await components.game.service.startGame("chat-context-locale", actors[0]!);
    await components.game.service.joinGame("chat-context-locale", actors[1]!);
    await components.game.service.joinGame("chat-context-locale", actors[2]!);

    const game = components.game.getGameByChat("chat-context-locale");
    game.groupLocale = "en";
    game.players[0]!.locale = "en";
    game.players[0]!.localeSource = "explicit";
    components.game.repository.update(game);

    const updated = components.game.getGameById(game.id);
    const firstPlayer = updated.players[0]!;

    expect(components.context.textsForGame(updated).locale).toBe("en");
    expect(components.context.textsForPlayer(updated, firstPlayer.id).locale).toBe(
      "en",
    );
    expect(components.context.textsForPlayer(updated, "missing-player").locale).toBe(
      "ru",
    );
    expect(
      components.context.findActiveGameByTelegramUser(firstPlayer.telegramUserId)?.id,
    ).toBe(updated.id);
    expect(components.context.findActiveGameByTelegramUser("404")).toBeNull();
    expect(
      components.context.getPlayerByTelegramOrError(
        updated,
        firstPlayer.telegramUserId,
      ),
    ).toMatchObject({ id: firstPlayer.id });
    expect(
      components.context.getPlayerByTelegramOrError(updated, "404"),
    ).toBeInstanceOf(PlayerNotFoundInGameError);
    expect(components.context.playerLabel(updated, firstPlayer.id)).toContain(
      firstPlayer.displayName,
    );
    expect(components.context.playerLabel(updated, "missing-player")).toBe(
      "missing-player",
    );
    expect(components.context.outcomeLabel(updated, "YES")).toBe(
      components.context.textsForGame(updated).voteOutcome("YES"),
    );
  });
});
