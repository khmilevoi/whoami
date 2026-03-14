import { describe, expect, it } from "vitest";
import { createGameServiceComponentHarness } from "./game-service-components.harness.js";
import { mustBeDefined } from "../support/strict-helpers.js";

describe("normal mode service", () => {
  it("creates a pending vote from group text in ONLINE mode and records the question on game state", async () => {
    const components = createGameServiceComponentHarness();
    const actors = components.game.createActors(3);
    const started = await components.game.setupInProgressGame({
      chatId: "chat-normal-online",
      actors,
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
    });

    const asker = components.game.getCurrentAsker(started.id);

    await components.normalMode.handleGroupText(
      started.chatId,
      asker.telegramUserId,
      "is it an animal?",
    );

    const updated = components.game.getGameById(started.id);
    expect(updated.inProgress.pendingVote).toMatchObject({
      askerPlayerId: asker.id,
      questionText: "is it an animal?",
    });
    expect(updated.progress[asker.id]?.questionsAsked).toBe(1);
  });

  it("resolves votes into turn history and advances the asker when the result is NO", async () => {
    const components = createGameServiceComponentHarness();
    const actors = components.game.createActors(3);
    const started = await components.game.setupInProgressGame({
      chatId: "chat-normal-no",
      actors,
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
    });

    const firstAsker = components.game.getCurrentAsker(started.id);
    await components.normalMode.handleGroupText(
      started.chatId,
      firstAsker.telegramUserId,
      "question",
    );

    const gameWithVote = components.game.getGameById(started.id);
    const pendingVote = mustBeDefined(
      gameWithVote.inProgress.pendingVote,
      "Expected pending vote for normal mode",
    );
    for (const voterId of pendingVote.eligibleVoterIds) {
      const voter = mustBeDefined(
        gameWithVote.players.find((player) => player.id === voterId),
        `Expected voter ${voterId}`,
      );
      await components.normalMode.handleVote(started.id, voter.telegramUserId, "NO");
    }

    const updated = components.game.getGameById(started.id);
    expect(updated.inProgress.pendingVote).toBeUndefined();
    expect(updated.turns.at(-1)).toMatchObject({
      askerPlayerId: firstAsker.id,
      outcome: "NO",
      questionText: "question",
    });
    expect(components.game.getCurrentAsker(started.id).id).not.toBe(firstAsker.id);
  });
});

it("includes clues in the visible-word list before the first turn", async () => {
  const components = createGameServiceComponentHarness();
  const actors = components.game.createActors(3);
  const started = await components.game.setupInProgressGame({
    chatId: "chat-normal-clues",
    actors,
    mode: "NORMAL",
    playMode: "ONLINE",
    pairingMode: "RANDOM",
    wordsByTelegramUserId: {
      [actors[0]!.telegramUserId]: { word: "lion", clue: "savannah" },
      [actors[1]!.telegramUserId]: { word: "tiger" },
      [actors[2]!.telegramUserId]: { word: "bear" },
    },
  });

  components.game.notifier.sent.length = 0;
  await components.normalMode.beforeFirstTurn(started);

  expect(
    components.game.notifier.sent.some(
      (notification) =>
        notification.kind === "private-message" &&
        notification.text.includes("lion (savannah)"),
    ),
  ).toBe(true);
});

it("formats crownless summary rows and propagates send errors without mutating the result", async () => {
  const components = createGameServiceComponentHarness();
  const started = await components.game.setupInProgressGame({
    chatId: "chat-normal-summary-extra",
    actors: components.game.createActors(3),
    mode: "NORMAL",
    playMode: "ONLINE",
    pairingMode: "RANDOM",
  });
  const finished = structuredClone(started);
  finished.stage = "FINISHED";
  finished.result = {
    gameId: finished.id,
    mode: "NORMAL",
    createdAt: finished.updatedAt,
    normal: [
      {
        playerId: finished.players[0]!.id,
        rounds: 2,
        questions: 3,
        crowns: [],
      },
    ],
  };

  components.game.notifier.sent.length = 0;
  await components.normalMode.sendFinalSummary(finished);

  expect(components.game.notifier.sent.at(-1)?.text).toContain(
    `${components.context.playerLabel(finished, finished.players[0]!.id)}: 2/3`,
  );
  expect(components.game.notifier.sent.at(-1)?.text).toContain(
    `${components.context.playerLabel(finished, finished.players[0]!.id)} -> ${components.context.playerLabel(finished, finished.words[finished.players[0]!.id]!.targetPlayerId ?? "-")}: ${finished.words[finished.players[0]!.id]!.word ?? "-"}`,
  );

  components.game.notifier.sent.length = 0;
  components.game.notifier.setGroupMessageFailure(finished.chatId);
  const result = await components.normalMode.sendFinalSummary(finished);

  expect(result).toBeInstanceOf(Error);
  expect(finished.result?.normal?.[0]?.crowns).toEqual([]);
});



