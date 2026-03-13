import { describe, expect, it } from "vitest";
import { createGameServiceComponentHarness } from "./game-service-components.harness.js";

const setupLobby = async () => {
  const components = createGameServiceComponentHarness();
  const actors = components.game.createActors(3);
  const creator = actors[0]!;

  await components.game.service.startGame("chat-config", creator);
  await components.game.service.joinGame("chat-config", actors[1]!);
  await components.game.service.joinGame("chat-config", actors[2]!);
  await components.game.service.beginConfiguration(
    "chat-config",
    creator.telegramUserId,
  );

  return {
    components,
    actors,
    game: components.game.getGameByChat("chat-config"),
  };
};

describe("configuration stage service", () => {
  it("stores NORMAL draft choices until the final pairing step and then configures random pairings", async () => {
    const { components, actors, game } = await setupLobby();
    const creator = actors[0]!;

    await components.configurationStage.applyConfigStep(
      game.id,
      creator.telegramUserId,
      "mode",
      "NORMAL",
    );

    expect(components.configDraftStore.get(game.id)).toEqual({ mode: "NORMAL" });
    expect(components.game.getGameById(game.id).config).toBeUndefined();

    await components.configurationStage.applyConfigStep(
      game.id,
      creator.telegramUserId,
      "play",
      "ONLINE",
    );

    expect(components.configDraftStore.get(game.id)).toEqual({
      mode: "NORMAL",
      playMode: "ONLINE",
    });
    expect(components.game.getGameById(game.id).config).toBeUndefined();

    await components.configurationStage.applyConfigStep(
      game.id,
      creator.telegramUserId,
      "pair",
      "RANDOM",
    );

    const configured = components.game.getGameById(game.id);
    expect(components.configDraftStore.get(game.id)).toEqual({});
    expect(configured.config).toEqual({
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
    });
    expect(configured.stage).toBe("PREPARE_WORDS");
    expect(Object.keys(configured.pairings)).toHaveLength(configured.players.length);
    expect(Object.keys(configured.words)).toHaveLength(configured.players.length);
  });

  it("configures REVERSE mode immediately after the play-mode step without manual pairing state", async () => {
    const { components, actors, game } = await setupLobby();
    const creator = actors[0]!;

    await components.configurationStage.applyConfigStep(
      game.id,
      creator.telegramUserId,
      "mode",
      "REVERSE",
    );
    await components.configurationStage.applyConfigStep(
      game.id,
      creator.telegramUserId,
      "play",
      "OFFLINE",
    );

    const configured = components.game.getGameById(game.id);
    expect(components.configDraftStore.get(game.id)).toEqual({});
    expect(configured.config).toEqual({
      mode: "REVERSE",
      playMode: "OFFLINE",
      pairingMode: undefined,
    });
    expect(configured.preparation.manualPairingQueue).toEqual([]);
    expect(Object.keys(configured.words)).toEqual(
      configured.players.map((player) => player.id),
    );
    for (const player of configured.players) {
      expect(configured.words[player.id]).toMatchObject({
        ownerPlayerId: player.id,
        targetPlayerId: player.id,
      });
    }
  });
});

it("rejects non-creator config changes without mutating the draft or game", async () => {
  const { components, actors, game } = await setupLobby();

  const result = await components.configurationStage.applyConfigStep(
    game.id,
    actors[1]!.telegramUserId,
    "mode",
    "REVERSE",
  );

  expect(result).toBeInstanceOf(Error);
  expect(components.configDraftStore.get(game.id)).toEqual({});
  expect(components.game.getGameById(game.id).config).toBeUndefined();
});

it("publishes chooser state for manual pairing without priming word expectations", async () => {
  const { components, actors, game } = await setupLobby();
  const creator = actors[0]!;

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

  const configured = components.game.getGameById(game.id);
  const snapshot = components.context.statusService.getByGameId(game.id);

  expect(configured.stage).toBe("PREPARE_WORDS");
  expect(configured.words).toEqual({});
  expect(snapshot?.manualPairingPending).toBe(true);
  expect(snapshot?.manualPairingChooserPlayerId).toBe(configured.players[0]!.id);
  expect(components.expectationStore.get(game.id, configured.players[0]!.id)).toBeUndefined();
});
