import { describe, expect, it } from "vitest";
import { createGameServiceComponentHarness } from "./game-service-components.harness.js";

const setupManualPairingGame = async () => {
  const components = createGameServiceComponentHarness();
  const actors = components.game.createActors(4);
  const creator = actors[0]!;

  await components.game.service.startGame("chat-pair", creator);
  await components.game.service.joinGame("chat-pair", actors[1]!);
  await components.game.service.joinGame("chat-pair", actors[2]!);
  await components.game.service.joinGame("chat-pair", actors[3]!);
  await components.game.service.beginConfiguration(
    "chat-pair",
    creator.telegramUserId,
  );

  const game = components.game.getGameByChat("chat-pair");
  await components.configurationStage.applyConfigStep(
    game.id,
    creator.telegramUserId,
    "mode",
    "NORMAL",
  );
  await components.configurationStage.applyConfigStep(
    game.id,
    creator.telegramUserId,
    "play",
    "ONLINE",
  );
  await components.configurationStage.applyConfigStep(
    game.id,
    creator.telegramUserId,
    "pair",
    "MANUAL",
  );

  return {
    components,
    gameId: game.id,
    actors,
  };
};

describe("normal pairing stage service", () => {
  it("updates pairings sequentially and initializes words only after the final manual choice", async () => {
    const { components, gameId, actors } = await setupManualPairingGame();

    await components.normalPairingStage.applyManualPair(
      gameId,
      actors[0]!.telegramUserId,
      "tg:2",
    );
    let game = components.game.getGameById(gameId);
    expect(game.pairings).toEqual({ "tg:1": "tg:2" });
    expect(game.preparation.manualPairingCursor).toBe(1);
    expect(game.words).toEqual({});

    await components.normalPairingStage.applyManualPair(
      gameId,
      actors[1]!.telegramUserId,
      "tg:3",
    );
    await components.normalPairingStage.applyManualPair(
      gameId,
      actors[2]!.telegramUserId,
      "tg:4",
    );
    game = components.game.getGameById(gameId);
    expect(game.preparation.manualPairingCursor).toBe(3);
    expect(game.words).toEqual({});

    await components.normalPairingStage.applyManualPair(
      gameId,
      actors[3]!.telegramUserId,
      "tg:1",
    );
    game = components.game.getGameById(gameId);

    expect(game.pairings).toEqual({
      "tg:1": "tg:2",
      "tg:2": "tg:3",
      "tg:3": "tg:4",
      "tg:4": "tg:1",
    });
    expect(game.preparation.manualPairingCursor).toBe(4);
    expect(Object.keys(game.words)).toHaveLength(4);
    expect(game.stage).toBe("PREPARE_WORDS");
  });

  it("does not mutate manual pairing state during startup recovery", async () => {
    const { components, gameId, actors } = await setupManualPairingGame();

    await components.normalPairingStage.applyManualPair(
      gameId,
      actors[0]!.telegramUserId,
      "tg:2",
    );
    const beforeRecovery = components.game.getGameById(gameId);

    await components.normalPairingStage.recoverPromptsOnStartup();

    const afterRecovery = components.game.getGameById(gameId);
    expect(afterRecovery).toEqual(beforeRecovery);
  });
});
