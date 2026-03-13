import { describe, expect, it } from "vitest";
import { createGameServiceComponentHarness } from "./game-service-components.harness.js";

describe("ready start stage service", () => {
  it("does nothing when the game stage does not transition to in progress", async () => {
    const components = createGameServiceComponentHarness();
    const configured = await components.game.setupConfiguredGame({
      chatId: "chat-ready-start-noop",
      actors: components.game.createActors(3),
      mode: "REVERSE",
      playMode: "ONLINE",
    });

    await expect(components.readyStartStage.tryStartGame(configured.id)).resolves.toBeUndefined();

    expect(components.game.getGameById(configured.id).stage).toBe("PREPARE_WORDS");
    expect(components.context.statusService.getByGameId(configured.id)).toBeNull();
  });

  it("returns an error when READY_WAIT still has unconfirmed words", async () => {
    const components = createGameServiceComponentHarness();
    const configured = await components.game.setupConfiguredGame({
      chatId: "chat-ready-start-error",
      actors: components.game.createActors(3),
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
    });
    const game = components.game.getGameById(configured.id);
    game.stage = "READY_WAIT";
    game.words["tg:1"] = {
      ownerPlayerId: "tg:1",
      targetPlayerId: "tg:2",
      word: "alpha",
      clue: "one",
      wordConfirmed: true,
      finalConfirmed: false,
      solved: false,
    };
    components.game.repository.update(game);

    const result = await components.readyStartStage.tryStartGame(configured.id);

    expect(result).toBeInstanceOf(Error);
    expect(components.game.getGameById(configured.id).stage).toBe("READY_WAIT");
    expect(components.context.statusService.getByGameId(configured.id)).toBeNull();
  });
});
