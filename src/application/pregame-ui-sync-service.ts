import * as appErrors from "../domain/errors.js";
import { GameState, UiButton } from "../domain/types.js";
import type { NotificationError } from "../domain/errors.js";
import { GameServiceContext } from "./game-service-context.js";
import { ConfigDraftStore } from "./stores/config-draft-store.js";
import { PrivateExpectationStore } from "./stores/private-expectation-store.js";

interface RenderedView {
  text: string;
  buttons?: UiButton[][];
}

export class PregameUiSyncService {
  constructor(
    private readonly context: GameServiceContext,
    private readonly configDraftStore: ConfigDraftStore,
    private readonly expectationStore: PrivateExpectationStore,
  ) {}

  async syncGame(
    gameId: string,
  ): Promise<
    void | appErrors.GameNotFoundError | appErrors.MarkDmError | NotificationError
  > {
    const game = this.context.getGameByIdOrError(gameId);
    if (game instanceof Error) return game;

    const next = structuredClone(game) as GameState;
    next.ui ??= { privatePanels: {} };

    const groupView = this.renderGroupView(next);
    const groupReceipt = await this.upsertGroupView(next, groupView);
    if (groupReceipt instanceof Error) return groupReceipt;

    for (const player of next.players) {
      const privateView = this.renderPrivateView(next, player.id);
      const privateReceipt = await this.upsertPrivateView(
        next,
        player.id,
        player.telegramUserId,
        privateView,
      );
      if (privateReceipt instanceof Error) return privateReceipt;
    }

    if (JSON.stringify(game) === JSON.stringify(next)) {
      return;
    }

    this.context.repository.update(next);
    return;
  }

  private renderGroupView(game: GameState): RenderedView {
    if (game.stage === "LOBBY_OPEN") {
      return {
        text: this.context.texts.groupLobbyStatusOpen(
          game.players.length,
          this.context.limits.maxPlayers,
          this.context.limits.minPlayers,
        ),
        buttons: [
          [
            {
              kind: "url",
              text: this.context.texts.joinGameButton(),
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
        text: this.context.texts.groupConfiguringStatus({
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
        text: this.context.texts.groupWordCollectionStatus(
          readyCount,
          game.players.length,
        ),
      };
    }

    if (game.stage === "IN_PROGRESS") {
      return {
        text: this.context.texts.groupInitializationFinished(),
      };
    }

    return {
      text:
        game.stage === "CANCELED"
          ? this.context.texts.groupCanceledStatus()
          : this.context.texts.groupFinishedStatus(),
    };
  }

  private renderPrivateView(game: GameState, playerId: string): RenderedView {
    const player = game.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      return { text: this.context.texts.privatePanelPlayerNotFound() };
    }

    const gameLink = game.ui?.groupStatusMessageId
      ? this.context.notifier.buildGroupMessageLink(
          game.chatId,
          game.ui.groupStatusMessageId,
        )
      : null;
    const gameLinkRow = gameLink
      ? [
          {
            kind: "url" as const,
            text: this.context.texts.openMainChatButton(),
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
            text: this.context.texts.configureGameButton(),
            data: `ui:config:${game.id}`,
            style: "primary",
          },
        ]);
      }
      if (gameLinkRow) {
        buttons.push(gameLinkRow);
      }

      return {
        text: this.context.texts.privateLobbyStatus(
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
            text: this.context.texts.openConfigMenuButton(),
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
            ? this.context.texts.privateCreatorConfigStatus()
            : this.context.texts.privatePlayerConfigStatus(),
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
                ? this.context.texts.privateEnterClueStatus(
                    readyCount,
                    game.players.length,
                  )
                : this.context.texts.privateEnterWordStatus(
                    readyCount,
                    game.players.length,
                  ),
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
              text: `✅ ${this.context.texts.yesButton()}`,
              data: `word:confirm:YES:${game.id}`,
              style: "success",
            },
            {
              kind: "callback",
              text: `✏️ ${this.context.texts.noButton()}`,
              data: `word:confirm:NO:${game.id}`,
              style: "danger",
            },
          ]);
          return {
            text: this.context.texts.confirmWordPrompt(entry.word),
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
                text: `💡 ${this.context.texts.yesButton()}`,
                data: `word:clue:YES:${game.id}`,
                style: "primary",
              },
              {
                kind: "callback",
                text: `➡️ ${this.context.texts.noButton()}`,
                data: `word:clue:NO:${game.id}`,
              },
            ]);
            return {
              text: this.context.texts.privateClueDecisionStatus(
                readyCount,
                game.players.length,
              ),
              buttons,
            };
          }

          if (gameLinkRow) {
            buttons.push(gameLinkRow);
          }
          buttons.unshift([
            {
              kind: "callback",
              text: `✅ ${this.context.texts.confirmButton()}`,
              data: `word:final:YES:${game.id}`,
              style: "success",
            },
            {
              kind: "callback",
              text: `✏️ ${this.context.texts.editButton()}`,
              data: `word:final:NO:${game.id}`,
              style: "danger",
            },
          ]);
          return {
            text: this.context.texts.wordSummary(entry.word, entry.clue),
            buttons,
          };
        }
      }

      if (gameLinkRow) {
        buttons.push(gameLinkRow);
      }
      return {
        text: this.context.texts.privateReadyWaitingStatus(
          readyCount,
          game.players.length,
        ),
        buttons: buttons.length > 0 ? buttons : undefined,
      };
    }

    if (game.stage === "IN_PROGRESS") {
      const buttons = gameLinkRow ? [gameLinkRow] : undefined;
      return {
        text: this.context.texts.privateGameStartedStatus(),
        buttons,
      };
    }

    return {
      text:
        game.stage === "CANCELED"
          ? this.context.texts.privateCanceledStatus()
          : this.context.texts.privateFinishedStatus(),
      buttons: gameLinkRow ? [gameLinkRow] : undefined,
    };
  }

  private async upsertGroupView(
    game: GameState,
    view: RenderedView,
  ): Promise<void | NotificationError> {
    const messageId = game.ui?.groupStatusMessageId;
    if (messageId) {
      const edited = await this.context.notifier.editGroupMessage(
        game.chatId,
        messageId,
        view.text,
        view.buttons,
      );
      if (!(edited instanceof Error)) {
        game.ui ??= { privatePanels: {} };
        game.ui.groupStatusMessageId = edited.messageId || messageId;
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

    game.ui ??= { privatePanels: {} };
    game.ui.groupStatusMessageId = created.messageId;
    return;
  }

  private async upsertPrivateView(
    game: GameState,
    playerId: string,
    telegramUserId: string,
    view: RenderedView,
  ): Promise<void | appErrors.MarkDmError | NotificationError> {
    game.ui ??= { privatePanels: {} };
    const existing = game.ui.privatePanels[playerId];
    if (existing) {
      const edited = await this.context.notifier.editPrivateMessage(
        telegramUserId,
        existing.messageId,
        view.text,
        view.buttons,
      );
      if (edited !== false) {
        game.ui.privatePanels[playerId] = {
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
      const blocked = this.context.engine.markDmBlocked(
        game,
        playerId,
        this.context.clock.nowIso(),
      );
      if (blocked instanceof Error) {
        return blocked;
      }
      return;
    }

    game.ui.privatePanels[playerId] = {
      chatId: telegramUserId,
      messageId: created.messageId,
    };
    return;
  }
}
