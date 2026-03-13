import { GameState, UiButton } from "../domain/types.js";
import { GameServiceContext } from "./game-service-context.js";
import {
  getConfigProgress,
  getManualPairingProgress,
  isManualPairingPending,
} from "./pregame-ui-projection.js";
import { ConfigDraftStore } from "./stores/config-draft-store.js";
import { PrivateExpectationStore } from "./stores/private-expectation-store.js";

export interface RenderedView {
  text: string;
  buttons?: UiButton[][];
}

export class PregameUiRenderer {
  constructor(
    private readonly context: GameServiceContext,
    private readonly configDraftStore: ConfigDraftStore,
    private readonly expectationStore: PrivateExpectationStore,
  ) {}

  renderGroupView(game: GameState): RenderedView {
    const texts = this.context.textsForGame(game);
    const privateChatButtons: UiButton[][] = [
      [
        {
          kind: "url",
          text: texts.openPrivateChatButton(),
          url: this.context.notifier.buildBotDeepLink(`open-${game.id}`),
          style: "primary",
        },
      ],
    ];

    if (game.stage === "LOBBY_OPEN") {
      return {
        text: texts.groupLobbyStatusOpen(
          game.players.length,
          this.context.limits.maxPlayers,
          this.context.limits.minPlayers,
        ),
        buttons: [
          [
            {
              kind: "callback",
              text: texts.joinGameButton(),
              data: `ui:join:${game.id}`,
              style: "primary",
            },
            {
              kind: "callback",
              text: texts.configureGameButton(),
              data: `ui:close-lobby:${game.id}`,
            },
          ],
        ],
      };
    }

    if (game.stage === "CONFIGURING") {
      const draft = this.configDraftStore.get(game.id);
      const progress = getConfigProgress(draft);
      return {
        text: [
          texts.groupConfiguringStatus({
            mode: draft.mode,
            playMode: draft.playMode,
            pairingMode: draft.pairingMode,
          }),
          texts.configResponsibleLine(
            this.context.playerLabel(game, game.creatorPlayerId),
          ),
          texts.configProgressLine(
            progress.currentStep,
            progress.totalSteps,
            progress.remainingSteps,
          ),
        ].join("\n"),
        buttons: privateChatButtons,
      };
    }

    if (isManualPairingPending(game)) {
      const progress = getManualPairingProgress(game);
      const chooserLabel = progress.chooserPlayerId
        ? this.context.playerLabel(game, progress.chooserPlayerId)
        : "-";
      return {
        text: [
          texts.manualPairingStatusTitle(),
          texts.manualPairingCurrentChooser(chooserLabel),
          texts.configProgressLine(
            progress.currentStep,
            progress.totalSteps,
            progress.remainingSteps,
          ),
        ].join("\n"),
        buttons: privateChatButtons,
      };
    }

    if (game.stage === "PREPARE_WORDS" || game.stage === "READY_WAIT") {
      const readyCount = Object.values(game.words).filter(
        (entry) => entry.finalConfirmed,
      ).length;
      return {
        text: texts.groupWordCollectionStatus(readyCount, game.players.length),
        buttons: privateChatButtons,
      };
    }

    if (game.stage === "IN_PROGRESS") {
      return {
        text: texts.groupInitializationFinished(),
      };
    }

    return {
      text: game.stage === "CANCELED" ? texts.groupCanceledStatus() : texts.groupFinishedStatus(),
    };
  }

  renderPrivateView(
    game: GameState,
    groupStatusMessageId: number | undefined,
    playerId: string,
  ): RenderedView {
    const texts = this.context.textsForPlayer(game, playerId);
    const player = game.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      return { text: texts.privatePanelPlayerNotFound() };
    }

    const gameLink = groupStatusMessageId
      ? this.context.notifier.buildGroupMessageLink(
          game.chatId,
          groupStatusMessageId,
        )
      : null;
    const gameLinkRow = gameLink
      ? [
          {
            kind: "url" as const,
            text: texts.openMainChatButton(),
            url: gameLink,
            style: "primary" as const,
          },
        ]
      : null;

    if (game.stage === "LOBBY_OPEN") {
      const buttons: UiButton[][] = [];
      if (
        player.id === game.creatorPlayerId &&
        game.players.length >= this.context.limits.minPlayers
      ) {
        buttons.push([
          {
            kind: "callback",
            text: texts.configureGameButton(),
            data: `ui:config:${game.id}`,
            style: "primary",
          },
        ]);
      }
      if (gameLinkRow) {
        buttons.push(gameLinkRow);
      }

      return {
        text: texts.privateLobbyStatus(
          game.players.length,
          player.id === game.creatorPlayerId,
        ),
        buttons: buttons.length > 0 ? buttons : undefined,
      };
    }

    if (game.stage === "CONFIGURING") {
      const draft = this.configDraftStore.get(game.id);
      const progress = getConfigProgress(draft);
      const buttons: UiButton[][] = [];
      if (player.id === game.creatorPlayerId) {
        buttons.push([
          {
            kind: "callback",
            text: texts.openConfigMenuButton(),
            data: `ui:open-config:${game.id}`,
            style: "primary",
          },
        ]);
      }
      if (gameLinkRow) {
        buttons.push(gameLinkRow);
      }

      return {
        text: [
          player.id === game.creatorPlayerId
            ? texts.privateCreatorConfigStatus()
            : texts.privatePlayerConfigStatus(),
          texts.configResponsibleLine(
            this.context.playerLabel(game, game.creatorPlayerId),
          ),
          texts.configProgressLine(
            progress.currentStep,
            progress.totalSteps,
            progress.remainingSteps,
          ),
          texts.configDraftSummary(draft),
        ].join("\n"),
        buttons: buttons.length > 0 ? buttons : undefined,
      };
    }

    if (isManualPairingPending(game)) {
      const progress = getManualPairingProgress(game);
      const chooserId = progress.chooserPlayerId;
      const chooserLabel = chooserId ? this.context.playerLabel(game, chooserId) : "-";
      const queuePosition = progress.queuePositionByPlayer[player.id] ?? 0;
      const buttons: UiButton[][] = [];
      if (player.id === chooserId) {
        buttons.push(...this.buildManualPairingButtons(game, chooserId));
      }
      if (gameLinkRow) {
        buttons.push(gameLinkRow);
      }

      const queueLine =
        player.id === chooserId
          ? texts.manualPairPrompt()
          : queuePosition > 0
            ? texts.manualPairingQueuePosition(queuePosition)
            : texts.manualPairingAlreadySelected();

      return {
        text: [
          texts.manualPairingStatusTitle(),
          texts.manualPairingCurrentChooser(chooserLabel),
          queueLine,
          texts.manualPairingRemaining(progress.remainingSteps),
          texts.configProgressLine(
            progress.currentStep,
            progress.totalSteps,
            progress.remainingSteps,
          ),
        ].join("\n"),
        buttons: buttons.length > 0 ? buttons : undefined,
      };
    }

    if (game.stage === "PREPARE_WORDS" || game.stage === "READY_WAIT") {
      const readyCount = Object.values(game.words).filter(
        (entry) => entry.finalConfirmed,
      ).length;
      const entry = game.words[player.id];
      const expectation = this.expectationStore.get(game.id, player.id) ?? "WORD";
      const buttons: UiButton[][] = [];
      if (entry) {
        if (!entry.word) {
          if (gameLinkRow) {
            buttons.push(gameLinkRow);
          }
          return {
            text:
              expectation === "CLUE"
                ? texts.privateEnterClueStatus(readyCount, game.players.length)
                : texts.privateEnterWordStatus(readyCount, game.players.length),
            buttons: buttons.length > 0 ? buttons : undefined,
          };
        }

        if (!entry.wordConfirmed) {
          if (gameLinkRow) {
            buttons.push(gameLinkRow);
          }
          buttons.unshift([
            {
              kind: "callback",
              text: `✅ ${texts.yesButton()}`,
              data: `word:confirm:YES:${game.id}`,
              style: "success",
            },
            {
              kind: "callback",
              text: `✏️ ${texts.noButton()}`,
              data: `word:confirm:NO:${game.id}`,
              style: "danger",
            },
          ]);
          return {
            text: texts.confirmWordPrompt(entry.word),
            buttons,
          };
        }

        if (!entry.finalConfirmed) {
          const needsClueDecision = entry.clue === undefined && expectation !== "CLUE";
          if (needsClueDecision) {
            if (gameLinkRow) {
              buttons.push(gameLinkRow);
            }
            buttons.unshift([
              {
                kind: "callback",
                text: `💡 ${texts.yesButton()}`,
                data: `word:clue:YES:${game.id}`,
                style: "primary",
              },
              {
                kind: "callback",
                text: `➡️ ${texts.noButton()}`,
                data: `word:clue:NO:${game.id}`,
              },
            ]);
            return {
              text: texts.privateClueDecisionStatus(readyCount, game.players.length),
              buttons,
            };
          }

          if (gameLinkRow) {
            buttons.push(gameLinkRow);
          }
          buttons.unshift([
            {
              kind: "callback",
              text: `✅ ${texts.confirmButton()}`,
              data: `word:final:YES:${game.id}`,
              style: "success",
            },
            {
              kind: "callback",
              text: `✏️ ${texts.editButton()}`,
              data: `word:final:NO:${game.id}`,
              style: "danger",
            },
          ]);
          return {
            text: texts.wordSummary(entry.word, entry.clue),
            buttons,
          };
        }
      }

      if (gameLinkRow) {
        buttons.push(gameLinkRow);
      }
      return {
        text: texts.privateReadyWaitingStatus(readyCount, game.players.length),
        buttons: buttons.length > 0 ? buttons : undefined,
      };
    }

    if (game.stage === "IN_PROGRESS") {
      const buttons = gameLinkRow ? [gameLinkRow] : undefined;
      return {
        text: texts.privateGameStartedStatus(),
        buttons,
      };
    }

    return {
      text: game.stage === "CANCELED" ? texts.privateCanceledStatus() : texts.privateFinishedStatus(),
      buttons: gameLinkRow ? [gameLinkRow] : undefined,
    };
  }

  private buildManualPairingButtons(
    game: GameState,
    chooserId: string,
  ): UiButton[][] {
    const takenTargetIds = new Set(Object.values(game.pairings));
    return game.players
      .filter(
        (candidate) =>
          candidate.id !== chooserId && !takenTargetIds.has(candidate.id),
      )
      .map((candidate) => [
        {
          kind: "callback" as const,
          text: this.context.playerLabel(game, candidate.id),
          data: `pair:${candidate.id}:${game.id}`,
          style: "primary" as const,
        },
      ]);
  }
}
