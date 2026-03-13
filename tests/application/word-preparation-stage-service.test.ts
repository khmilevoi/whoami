import { describe, expect, it } from "vitest";
import { createGameServiceComponentHarness } from "./game-service-components.harness.js";

describe("word preparation stage service", () => {
  it("restarts the player word draft after confirm NO and final NO", async () => {
    const components = createGameServiceComponentHarness();
    const actors = components.game.createActors(3);
    const configured = await components.game.setupConfiguredGame({
      chatId: "chat-word-restart",
      actors,
      mode: "REVERSE",
      playMode: "ONLINE",
    });

    await components.wordPreparationStage.handlePrivateText(
      actors[0]!.telegramUserId,
      "planet",
    );
    await components.wordPreparationStage.handleWordCallback(
      configured.id,
      actors[0]!.telegramUserId,
      "confirm",
      "NO",
    );

    let updated = components.game.getGameById(configured.id);
    expect(updated.words["tg:1"]?.word).toBeUndefined();
    expect(updated.words["tg:1"]?.clue).toBeUndefined();
    expect(updated.words["tg:1"]?.wordConfirmed).toBe(false);
    expect(updated.words["tg:1"]?.finalConfirmed).toBe(false);
    expect(updated.players.find((player) => player.id === "tg:1")?.stage).toBe(
      "WORD_DRAFT",
    );

    await components.wordPreparationStage.handlePrivateText(
      actors[0]!.telegramUserId,
      "mars",
    );
    await components.wordPreparationStage.handleWordCallback(
      configured.id,
      actors[0]!.telegramUserId,
      "confirm",
      "YES",
    );
    await components.wordPreparationStage.handleWordCallback(
      configured.id,
      actors[0]!.telegramUserId,
      "clue",
      "YES",
    );
    await components.wordPreparationStage.handlePrivateText(
      actors[0]!.telegramUserId,
      "red world",
    );
    await components.wordPreparationStage.handleWordCallback(
      configured.id,
      actors[0]!.telegramUserId,
      "final",
      "NO",
    );

    updated = components.game.getGameById(configured.id);
    expect(updated.words["tg:1"]?.word).toBeUndefined();
    expect(updated.words["tg:1"]?.clue).toBeUndefined();
    expect(updated.words["tg:1"]?.wordConfirmed).toBe(false);
    expect(updated.words["tg:1"]?.finalConfirmed).toBe(false);
    expect(updated.players.find((player) => player.id === "tg:1")?.stage).toBe(
      "WORD_DRAFT",
    );
  });

  it("starts the game only after all players finalize their words", async () => {
    const components = createGameServiceComponentHarness();
    const actors = components.game.createActors(3);
    const configured = await components.game.setupConfiguredGame({
      chatId: "chat-word-ready",
      actors,
      mode: "REVERSE",
      playMode: "OFFLINE",
    });

    for (const actor of actors.slice(0, 2)) {
      await components.wordPreparationStage.handlePrivateText(
        actor.telegramUserId,
        `word-${actor.telegramUserId}`,
      );
      await components.wordPreparationStage.handleWordCallback(
        configured.id,
        actor.telegramUserId,
        "confirm",
        "YES",
      );
      await components.wordPreparationStage.handleWordCallback(
        configured.id,
        actor.telegramUserId,
        "clue",
        "NO",
      );
      await components.wordPreparationStage.handleWordCallback(
        configured.id,
        actor.telegramUserId,
        "final",
        "YES",
      );
    }

    let updated = components.game.getGameById(configured.id);
    expect(updated.stage).toBe("PREPARE_WORDS");

    await components.wordPreparationStage.handlePrivateText(
      actors[2]!.telegramUserId,
      `word-${actors[2]!.telegramUserId}`,
    );
    await components.wordPreparationStage.handleWordCallback(
      configured.id,
      actors[2]!.telegramUserId,
      "confirm",
      "YES",
    );
    await components.wordPreparationStage.handleWordCallback(
      configured.id,
      actors[2]!.telegramUserId,
      "clue",
      "NO",
    );
    await components.wordPreparationStage.handleWordCallback(
      configured.id,
      actors[2]!.telegramUserId,
      "final",
      "YES",
    );

    updated = components.game.getGameById(configured.id);
    expect(updated.stage).toBe("IN_PROGRESS");
    expect(updated.players.every((player) => player.stage === "READY")).toBe(true);
    expect(updated.inProgress.round).toBe(1);
  });
});

it("ignores private text when the player has no active game or the game is in the wrong stage", async () => {
  const components = createGameServiceComponentHarness();
  const actor = components.game.createActor(1);

  await expect(
    components.wordPreparationStage.handlePrivateText(actor.telegramUserId, "ghost"),
  ).resolves.toBeUndefined();

  await components.game.service.startGame("chat-word-wrong-stage", actor);
  const lobby = components.game.getGameByChat("chat-word-wrong-stage");
  await components.wordPreparationStage.handlePrivateText(actor.telegramUserId, "ignored");

  const updated = components.game.getGameById(lobby.id);
  expect(updated.stage).toBe("LOBBY_OPEN");
  expect(updated.words).toEqual({});
});

it("publishes status when a player is present but has no word entry", async () => {
  const components = createGameServiceComponentHarness();
  const actors = components.game.createActors(3);
  const configured = await components.game.setupConfiguredGame({
    chatId: "chat-word-missing-entry",
    actors,
    mode: "REVERSE",
    playMode: "ONLINE",
  });
  const game = components.game.getGameById(configured.id);
  delete game.words["tg:1"];
  components.game.repository.update(game);

  await components.wordPreparationStage.handlePrivateText(actors[0]!.telegramUserId, "word");

  expect(components.context.statusService.getByGameId(configured.id)?.gameId).toBe(configured.id);
  expect(components.game.getGameById(configured.id).words["tg:1"]).toBeUndefined();
});

it("stores and clears clue expectations across clue and final callbacks", async () => {
  const components = createGameServiceComponentHarness();
  const actors = components.game.createActors(3);
  const configured = await components.game.setupConfiguredGame({
    chatId: "chat-word-clue-flow",
    actors,
    mode: "REVERSE",
    playMode: "ONLINE",
  });

  for (const actor of actors.slice(0, 2)) {
    await components.wordPreparationStage.handlePrivateText(
      actor.telegramUserId,
      `word-${actor.telegramUserId}`,
    );
    await components.wordPreparationStage.handleWordCallback(
      configured.id,
      actor.telegramUserId,
      "confirm",
      "YES",
    );
    await components.wordPreparationStage.handleWordCallback(
      configured.id,
      actor.telegramUserId,
      "clue",
      "NO",
    );
    await components.wordPreparationStage.handleWordCallback(
      configured.id,
      actor.telegramUserId,
      "final",
      "YES",
    );
  }

  await components.wordPreparationStage.handlePrivateText(
    actors[2]!.telegramUserId,
    "planet",
  );
  await components.wordPreparationStage.handleWordCallback(
    configured.id,
    actors[2]!.telegramUserId,
    "confirm",
    "YES",
  );
  await components.wordPreparationStage.handleWordCallback(
    configured.id,
    actors[2]!.telegramUserId,
    "clue",
    "YES",
  );

  expect(components.expectationStore.get(configured.id, "tg:3")).toBe("CLUE");

  await components.wordPreparationStage.handlePrivateText(
    actors[2]!.telegramUserId,
    "space clue",
  );
  expect(components.expectationStore.get(configured.id, "tg:3")).toBeUndefined();

  await components.wordPreparationStage.handleWordCallback(
    configured.id,
    actors[2]!.telegramUserId,
    "final",
    "YES",
  );

  const started = components.game.getGameById(configured.id);
  expect(started.stage).toBe("IN_PROGRESS");
  expect(components.expectationStore.get(configured.id, "tg:3")).toBeUndefined();
  expect(started.words["tg:3"]?.clue).toBe("space clue");
});
