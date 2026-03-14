import { describe, expect, it } from "vitest";
import { GameState } from "../../src/domain/types.js";
import { createGameServiceComponentHarness } from "./game-service-components.harness.js";
import { mustBeDefined } from "../support/strict-helpers.js";

const groupMessages = (
  harness: ReturnType<typeof createGameServiceComponentHarness>,
) => harness.game.notifier.sent.filter((notification) => notification.kind === "group-message");

const cloneGame = (game: GameState): GameState => structuredClone(game) as GameState;

describe("game mode notification flows", () => {
  it("announces the current NORMAL offline turn with a poll-start keyboard", async () => {
    const components = createGameServiceComponentHarness();
    const actors = components.game.createActors(3);
    const started = await components.game.setupInProgressGame({
      chatId: "chat-normal-offline-turn",
      actors,
      mode: "NORMAL",
      playMode: "OFFLINE",
      pairingMode: "RANDOM",
    });
    const currentAsker = components.game.getCurrentAsker(started.id);
    const texts = components.context.textsForGame(started);

    components.game.notifier.sent.length = 0;
    await components.normalMode.announceCurrentTurn(started);

    expect(groupMessages(components).map((notification) => notification.text)).toEqual(
      expect.arrayContaining([
        texts.currentTurn(components.context.playerLabel(started, currentAsker.id)),
        texts.askOfflinePrompt(components.context.playerLabel(started, currentAsker.id)),
      ]),
    );
    expect(
      groupMessages(components).find((notification) => notification.buttons)?.buttons,
    ).toEqual([
      [
        expect.objectContaining({
          kind: "callback",
          data: `ask:${started.id}`,
        }),
      ],
    ]);
  });

  it("sends each NORMAL player only the visible words before the first turn", async () => {
    const components = createGameServiceComponentHarness();
    const actors = components.game.createActors(3);
    const started = await components.game.setupInProgressGame({
      chatId: "chat-normal-before-first-turn",
      actors,
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
      wordsByTelegramUserId: {
        [actors[0]!.telegramUserId]: { word: "lion" },
        [actors[1]!.telegramUserId]: { word: "tiger" },
        [actors[2]!.telegramUserId]: { word: "bear" },
      },
    });

    components.game.notifier.sent.length = 0;
    await components.normalMode.beforeFirstTurn(started);

    for (const player of started.players) {
      const hiddenEntry = mustBeDefined(
        Object.values(started.words).find((entry) => entry.targetPlayerId === player.id),
        `Expected hidden word for ${player.id}`,
      );
      const visibleEntry = mustBeDefined(
        Object.values(started.words).find((entry) => entry.targetPlayerId !== player.id),
        `Expected visible word for ${player.id}`,
      );
      const message = mustBeDefined(
        components.game.notifier.sent.find(
          (notification) =>
            notification.kind === "private-message" &&
            notification.userId === player.telegramUserId,
        ),
        `Expected private word list for ${player.telegramUserId}`,
      );

      expect(message.text).toContain(visibleEntry.word);
      expect(message.text).not.toContain(hiddenEntry.word);
    }
  });

  it("sends the generic NORMAL finished text when no final result exists", async () => {
    const components = createGameServiceComponentHarness();
    const started = await components.game.setupInProgressGame({
      chatId: "chat-normal-finished-generic",
      actors: components.game.createActors(3),
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
    });
    const finished = cloneGame(started);
    finished.stage = "FINISHED";
    delete finished.result;

    components.game.notifier.sent.length = 0;
    await components.normalMode.sendFinalSummary(finished);

    expect(groupMessages(components).map((notification) => notification.text)).toContain(
      components.context.textsForGame(finished).gameFinished(),
    );
  });

  it("formats the NORMAL final summary with assigned words", async () => {
    const components = createGameServiceComponentHarness();
    const started = await components.game.setupInProgressGame({
      chatId: "chat-normal-summary",
      actors: components.game.createActors(3),
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
    });
    const finished = cloneGame(started);
    finished.stage = "FINISHED";
    finished.result = {
      gameId: finished.id,
      mode: "NORMAL",
      createdAt: finished.updatedAt,
      normal: [
        {
          playerId: finished.players[0]!.id,
          rounds: 1,
          questions: 2,
          crowns: ["gold"],
        },
      ],
    };

    const lines = [
      `- ${components.context.playerLabel(finished, finished.players[0]!.id)}: 1/2 👑`,
    ];
    const assignmentLines = finished.players.map((player) => {
      const entry = finished.words[player.id]!;
      return `- ${components.context.playerLabel(finished, player.id)} -> ${components.context.playerLabel(finished, entry.targetPlayerId ?? "-")}: ${entry.word ?? "-"}`;
    });

    components.game.notifier.sent.length = 0;
    await components.normalMode.sendFinalSummary(finished);

    expect(groupMessages(components).map((notification) => notification.text)).toContain(
      [
        components.context.textsForGame(finished).normalSummary(lines),
        components.context.textsForGame(finished).finalWordAssignments(assignmentLines),
      ].join("\n\n"),
    );
  });

  it("announces the current REVERSE offline turn with the target player and poll-start keyboard", async () => {
    const components = createGameServiceComponentHarness();
    const actors = components.game.createActors(3);
    const started = await components.game.setupInProgressGame({
      chatId: "chat-reverse-offline-turn",
      actors,
      mode: "REVERSE",
      playMode: "OFFLINE",
    });
    const currentAsker = components.game.getCurrentAsker(started.id);
    const currentTarget = mustBeDefined(
      components.game.getCurrentTarget(started.id),
      "Expected reverse target",
    );
    const texts = components.context.textsForGame(started);

    components.game.notifier.sent.length = 0;
    await components.reverseMode.announceCurrentTurn(started);

    expect(groupMessages(components).map((notification) => notification.text)).toEqual(
      expect.arrayContaining([
        texts.reverseTargetTurn(
          components.context.playerLabel(started, currentTarget.id),
          components.context.playerLabel(started, currentAsker.id),
        ),
        texts.askOfflinePrompt(components.context.playerLabel(started, currentAsker.id)),
      ]),
    );
    expect(
      groupMessages(components).find((notification) => notification.buttons)?.buttons,
    ).toEqual([
      [
        expect.objectContaining({
          kind: "callback",
          data: `ask:${started.id}`,
        }),
      ],
    ]);
  });

  it("formats the REVERSE final summary from owner and guesser standings", async () => {
    const components = createGameServiceComponentHarness();
    const started = await components.game.setupInProgressGame({
      chatId: "chat-reverse-summary",
      actors: components.game.createActors(3),
      mode: "REVERSE",
      playMode: "ONLINE",
    });
    const finished = cloneGame(started);
    finished.stage = "FINISHED";
    finished.result = {
      gameId: finished.id,
      mode: "REVERSE",
      createdAt: finished.updatedAt,
      reverse: {
        asWordOwner: [
          {
            playerId: finished.players[0]!.id,
            rounds: 1,
            questions: 2,
            crowns: ["gold"],
          },
        ],
        asGuesser: [
          {
            playerId: finished.players[1]!.id,
            rounds: 0,
            questions: 0,
            avgRounds: 1.5,
            avgQuestions: 2.5,
            crowns: [],
          },
        ],
      },
    };

    const ownerText = `- ${components.context.playerLabel(finished, finished.players[0]!.id)}: 1/2 👑`;
    const guesserText = `- ${components.context.playerLabel(finished, finished.players[1]!.id)}: 1.5/2.5`;
    const assignmentLines = finished.players.map(
      (player) => `- ${components.context.playerLabel(finished, player.id)}: ${finished.words[player.id]!.word ?? "-"}`,
    );

    components.game.notifier.sent.length = 0;
    await components.reverseMode.sendFinalSummary(finished);

    expect(groupMessages(components).map((notification) => notification.text)).toContain(
      [
        components.context.textsForGame(finished).reverseSummary(ownerText, guesserText),
        components.context.textsForGame(finished).finalWordAssignments(assignmentLines),
      ].join("\n\n"),
    );
  });
});


