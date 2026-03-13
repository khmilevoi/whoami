import * as appErrors from "../domain/errors.js";
import { GameState, UiButton } from "../domain/types.js";
import type { NotificationError } from "../domain/errors.js";
import {
  GameStatusSubscriber,
  GameStatusTransition,
} from "./game-status-service.js";
import { GameServiceContext } from "./game-service-context.js";
import { ConfigDraftStore } from "./stores/config-draft-store.js";
import { PrivateExpectationStore } from "./stores/private-expectation-store.js";
import {
  PregameUiGameState,
  PregameUiStateStore,
} from "./stores/pregame-ui-state-store.js";

interface RenderedView {
  text: string;
  buttons?: UiButton[][];
}

export class PregameUiStatusSubscriber implements GameStatusSubscriber {
  constructor(
    private readonly context: GameServiceContext,
    private readonly configDraftStore: ConfigDraftStore,
    private readonly expectationStore: PrivateExpectationStore,
    private readonly uiStateStore: PregameUiStateStore,
  ) {}

  async onGameStatusChanged(
    transition: GameStatusTransition,
  ): Promise<void | Error> {
    const gameId = transition.current?.gameId ?? transition.previous?.gameId;
    if (!gameId) {
      return;
    }

    if (!transition.current) {
      this.uiStateStore.delete(gameId);
      return;
    }

    return this.syncGame(gameId);
  }

  async syncGame(
    gameId: string,
  ): Promise<
    void | appErrors.GameNotFoundError | appErrors.MarkDmError | NotificationError
  > {
    const game = this.context.getGameByIdOrError(gameId);
    if (game instanceof Error) return game;

    const state = structuredClone(this.uiStateStore.get(game.id)) as PregameUiGameState;
    state.privatePanels ??= {};

    const groupView = this.renderGroupView(game);
    const groupReceipt = await this.upsertGroupView(game, state, groupView);
    if (groupReceipt instanceof Error) return groupReceipt;

    for (const player of game.players) {
      const privateView = this.renderPrivateView(game, state, player.id);
      const privateReceipt = await this.upsertPrivateView(
        game,
        state,
        player.id,
        player.telegramUserId,
        privateView,
      );
      if (privateReceipt instanceof Error) return privateReceipt;
    }

    this.uiStateStore.set(game.id, state);
  }

  private renderGroupView(game: GameState): RenderedView {
    const texts = this.context.textsForGame(game);
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
              kind: "url",
              text: texts.joinGameButton(),
              url: this.context.notifier.buildBotDeepLink(`join-${game.id}`),
              style: "primary",
            },
          ],
        ],
      };
    }

    if (game.stage === "CONFIGURING") {
      const draft = this.configDraftStore.get(game.id);
      return {
        text: texts.groupConfiguringStatus({
          mode: draft.mode,
          playMode: draft.playMode,
          pairingMode: draft.pairingMode,
        }),
      };
    }

    if (game.stage === "PREPARE_WORDS" || game.stage === "READY_WAIT") {
      const readyCount = Object.values(game.words).filter(
        (entry) => entry.finalConfirmed,
      ).length;
      return {
        text: texts.groupWordCollectionStatus(readyCount, game.players.length),
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

  private renderPrivateView(
    game: GameState,
    state: PregameUiGameState,
    playerId: string,
  ): RenderedView {
    const texts = this.context.textsForPlayer(game, playerId);
    const player = game.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      return { text: texts.privatePanelPlayerNotFound() };
    }

    const gameLink = state.groupStatusMessageId
      ? this.context.notifier.buildGroupMessageLink(
          game.chatId,
          state.groupStatusMessageId,
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
        text:
          player.id === game.creatorPlayerId
            ? texts.privateCreatorConfigStatus()
            : texts.privatePlayerConfigStatus(),
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

  private async upsertGroupView(
    game: GameState,
    state: PregameUiGameState,
    view: RenderedView,
  ): Promise<void | NotificationError> {
    const messageId = state.groupStatusMessageId;
    if (messageId) {
      const edited = await this.context.notifier.editGroupMessage(
        game.chatId,
        messageId,
        view.text,
        view.buttons,
      );
      if (!(edited instanceof Error)) {
        state.groupStatusMessageId = edited.messageId || messageId;
        return;
      }
    }

    const created = view.buttons
      ? await this.context.notifier.sendGroupKeyboard(
          game.chatId,
          view.text,
          view.buttons,
        )
      : await this.context.notifier.sendGroupMessage(game.chatId, view.text);
    if (created instanceof Error) {
      return created;
    }

    state.groupStatusMessageId = created.messageId;
  }

  private async upsertPrivateView(
    game: GameState,
    state: PregameUiGameState,
    playerId: string,
    telegramUserId: string,
    view: RenderedView,
  ): Promise<
    void | appErrors.MarkDmError | appErrors.GameNotFoundError | NotificationError
  > {
    const player = game.players.find((candidate) => candidate.id === playerId);
    if (player?.stage === "BLOCKED_DM" && !player.dmOpened) {
      return;
    }

    const existing = state.privatePanels[playerId];
    if (existing) {
      const edited = await this.context.notifier.editPrivateMessage(
        telegramUserId,
        existing.messageId,
        view.text,
        view.buttons,
      );
      if (edited !== false) {
        state.privatePanels[playerId] = {
          chatId: telegramUserId,
          messageId: edited.messageId || existing.messageId,
        };
        return;
      }
    }

    const created = view.buttons
      ? await this.context.notifier.sendPrivateKeyboard(
          telegramUserId,
          view.text,
          view.buttons,
        )
      : await this.context.notifier.sendPrivateMessage(telegramUserId, view.text);
    if (created === false) {
      return this.markDmBlocked(game.id, playerId);
    }

    state.privatePanels[playerId] = {
      chatId: telegramUserId,
      messageId: created.messageId,
    };
  }

  private markDmBlocked(
    gameId: string,
    playerId: string,
  ): void |
    appErrors.MarkDmError |
    appErrors.GameNotFoundError |
    appErrors.PlayerNotFoundError {
    const updated = this.context.transactionRunner.runInTransaction(() => {
      const current = this.context.getGameByIdOrError(gameId);
      if (current instanceof Error) return current;

      const next = this.context.engine.markDmBlocked(
        current,
        playerId,
        this.context.clock.nowIso(),
      );
      if (next instanceof Error) return next;

      this.context.repository.update(next);
      return next;
    });
    if (updated instanceof Error) return updated;

    return this.context.publishGameStatus(updated);
  }
}
