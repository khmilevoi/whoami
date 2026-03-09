import { describe, expect, it } from "vitest";
import { createGameServiceComponentHarness } from "./game-service-components.harness";

describe("reverse mode service", () => {
  it("does nothing before first turn hook", async () => {
    const components = createGameServiceComponentHarness();
    const chatId = "chat-reverse-hook";
    const actors = [components.game.createActor(1), components.game.createActor(2), components.game.createActor(3)];

    const started = await components.game.setupReverseOfflineInProgress(chatId, actors);
    components.game.notifier.sent.length = 0;

    await components.reverseMode.beforeFirstTurn(started);

    expect(components.game.notifier.sent).toHaveLength(0);
  });

  it("asks offline through the current target owner and advances after the vote", async () => {
    const components = createGameServiceComponentHarness();
    const chatId = "chat-reverse-flow";
    const actors = [components.game.createActor(1), components.game.createActor(2), components.game.createActor(3)];

    const started = await components.game.setupReverseOfflineInProgress(chatId, actors);
    const before = components.game.getGameById(started.id);
    const askerId = before.inProgress.turnOrder[before.inProgress.turnCursor];
    const asker = before.players.find((player) => player.id === askerId)!;

    await components.reverseMode.askOffline(chatId, asker.telegramUserId);

    const withVote = components.game.getGameById(started.id);
    const pendingVote = withVote.inProgress.pendingVote;
    expect(pendingVote).toBeDefined();
    expect(pendingVote?.eligibleVoterIds).toHaveLength(1);

    const target = withVote.players.find((player) => player.id === pendingVote!.targetWordOwnerId)!;
    expect(
      components.game.notifier.sent.some(
        (entry) => entry.kind === "private-keyboard" && entry.userId === target.telegramUserId && entry.text.includes("Выберите ответ"),
      ),
    ).toBe(true);

    await components.reverseMode.handleVote(started.id, target.telegramUserId, "NO");

    const updated = components.game.getGameById(started.id);
    expect(updated.turns).toHaveLength(1);
    expect(updated.inProgress.pendingVote).toBeUndefined();
  });
});
