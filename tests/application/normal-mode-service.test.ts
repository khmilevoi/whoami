import { describe, expect, it } from "vitest";
import { createGameServiceComponentHarness } from "./game-service-components.harness.js";

describe("normal mode service", () => {
  it("sends pre-start disclosure to every player", async () => {
    const components = createGameServiceComponentHarness();
    const chatId = "chat-normal-disclosure";
    const actors = [
      components.game.createActor(1),
      components.game.createActor(2),
      components.game.createActor(3),
    ];

    const started = await components.game.setupNormalOnlineRandomInProgress(
      chatId,
      actors,
    );
    components.game.notifier.sent.length = 0;

    await components.normalMode.beforeFirstTurn(started);

    const disclosureMessages = components.game.notifier.sent.filter(
      (entry) =>
        entry.kind === "private-message" &&
        entry.text.startsWith("Список слов других игроков:"),
    );
    expect(disclosureMessages).toHaveLength(actors.length);
  });

  it("handles online question flow and resolves votes", async () => {
    const components = createGameServiceComponentHarness();
    const chatId = "chat-normal-flow";
    const actors = [
      components.game.createActor(1),
      components.game.createActor(2),
      components.game.createActor(3),
    ];

    const started = await components.game.setupNormalOnlineRandomInProgress(
      chatId,
      actors,
    );
    const current = components.game.getGameById(started.id);
    const askerId = current.inProgress.turnOrder[current.inProgress.turnCursor];
    const asker = current.players.find((player) => player.id === askerId)!;

    await components.normalMode.handleGroupText(
      chatId,
      asker.telegramUserId,
      "Question 1",
    );

    const withVote = components.game.getGameById(started.id);
    expect(withVote.inProgress.pendingVote).toBeDefined();
    expect(
      components.game.notifier.sent.some(
        (entry) =>
          entry.kind === "group-keyboard" &&
          entry.chatId === chatId &&
          entry.text.includes("Голосуем"),
      ),
    ).toBe(true);

    for (const voterId of withVote.inProgress.pendingVote!.eligibleVoterIds) {
      const voter = withVote.players.find((player) => player.id === voterId)!;
      await components.normalMode.handleVote(
        started.id,
        voter.telegramUserId,
        "NO",
      );
    }

    const updated = components.game.getGameById(started.id);
    expect(updated.turns).toHaveLength(1);
    expect(updated.turns[0]?.outcome).toBe("NO");
    expect(updated.inProgress.pendingVote).toBeUndefined();
  });
});
