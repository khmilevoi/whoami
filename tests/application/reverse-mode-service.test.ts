import { describe, expect, it } from "vitest";
import { createGameServiceComponentHarness } from "./game-service-components.harness.js";
import { mustBeDefined } from "../support/strict-helpers.js";

describe("reverse mode service", () => {
  it("creates a target-owned pending vote from OFFLINE ask action", async () => {
    const components = createGameServiceComponentHarness();
    const actors = components.game.createActors(3);
    const started = await components.game.setupInProgressGame({
      chatId: "chat-reverse-offline",
      actors,
      mode: "REVERSE",
      playMode: "OFFLINE",
    });

    const asker = components.game.getCurrentAsker(started.id);
    const target = mustBeDefined(
      components.game.getCurrentTarget(started.id),
      "Expected reverse target",
    );

    await components.reverseMode.askOffline(started.chatId, asker.telegramUserId);

    const updated = components.game.getGameById(started.id);
    expect(updated.inProgress.pendingVote?.askerPlayerId).toBe(asker.id);
    expect(updated.inProgress.pendingVote?.targetWordOwnerId).toBe(target.id);
    expect(updated.inProgress.pendingVote?.eligibleVoterIds).toEqual([target.id]);
    expect(updated.inProgress.pendingVote?.questionText).toBeUndefined();
  });

  it("keeps the same asker on YES and advances state on GUESSED", async () => {
    const components = createGameServiceComponentHarness();
    const actors = components.game.createActors(3);
    const started = await components.game.setupInProgressGame({
      chatId: "chat-reverse-online",
      actors,
      mode: "REVERSE",
      playMode: "ONLINE",
    });

    const initialAsker = components.game.getCurrentAsker(started.id);
    const initialTarget = mustBeDefined(
      components.game.getCurrentTarget(started.id),
      "Expected initial reverse target",
    );

    await components.reverseMode.handleGroupText(
      started.chatId,
      initialAsker.telegramUserId,
      "question-1",
    );
    await components.reverseMode.handleVote(
      started.id,
      initialTarget.telegramUserId,
      "YES",
    );

    let updated = components.game.getGameById(started.id);
    expect(updated.turns.at(-1)).toMatchObject({ outcome: "YES" });
    expect(components.game.getCurrentAsker(started.id).id).toBe(initialAsker.id);
    expect(components.game.getCurrentTarget(started.id)?.id).toBe(initialTarget.id);

    await components.reverseMode.handleGroupText(
      started.chatId,
      initialAsker.telegramUserId,
      "question-2",
    );
    await components.reverseMode.handleVote(
      started.id,
      initialTarget.telegramUserId,
      "GUESSED",
    );

    updated = components.game.getGameById(started.id);
    expect(updated.words[initialTarget.id]?.solved).toBe(true);
    expect(updated.turns.at(-1)).toMatchObject({
      askerPlayerId: initialAsker.id,
      outcome: "GUESSED",
    });
    expect(components.game.getCurrentTarget(started.id)?.id).not.toBe(initialTarget.id);
  });
});

it("formats reverse summaries with zero defaults and no crowns", async () => {
  const components = createGameServiceComponentHarness();
  const started = await components.game.setupInProgressGame({
    chatId: "chat-reverse-summary-extra",
    actors: components.game.createActors(3),
    mode: "REVERSE",
    playMode: "ONLINE",
  });
  const finished = structuredClone(started);
  finished.stage = "FINISHED";
  finished.result = {
    gameId: finished.id,
    mode: "REVERSE",
    createdAt: finished.updatedAt,
    reverse: {
      asWordOwner: [
        {
          playerId: finished.players[0]!.id,
          rounds: 2,
          questions: 4,
          crowns: [],
        },
      ],
      asGuesser: [
        {
          playerId: finished.players[1]!.id,
          rounds: 0,
          questions: 0,
          crowns: [],
        },
      ],
    },
  };

  components.game.notifier.sent.length = 0;
  await components.reverseMode.sendFinalSummary(finished);

  const summaryText = components.game.notifier.sent.at(-1)?.text ?? "";
  expect(summaryText).toContain(
    `${components.context.playerLabel(finished, finished.players[0]!.id)}: 2/4`,
  );
  expect(summaryText).toContain(
    `${components.context.playerLabel(finished, finished.players[1]!.id)}: 0/0`,
  );
  expect(summaryText.includes("👑")).toBe(false);
});

it("returns notifier errors for reverse summaries without mutating the stored result", async () => {
  const components = createGameServiceComponentHarness();
  const started = await components.game.setupInProgressGame({
    chatId: "chat-reverse-summary-error",
    actors: components.game.createActors(3),
    mode: "REVERSE",
    playMode: "ONLINE",
  });
  const finished = structuredClone(started);
  finished.stage = "FINISHED";
  finished.result = {
    gameId: finished.id,
    mode: "REVERSE",
    createdAt: finished.updatedAt,
    reverse: {
      asWordOwner: [],
      asGuesser: [],
    },
  };
  components.game.notifier.setGroupMessageFailure(finished.chatId);

  const result = await components.reverseMode.sendFinalSummary(finished);

  expect(result).toBeInstanceOf(Error);
  expect(finished.result?.reverse).toEqual({ asWordOwner: [], asGuesser: [] });
});
