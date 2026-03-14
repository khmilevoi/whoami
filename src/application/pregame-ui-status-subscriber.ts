import * as appErrors from "../domain/errors.js";
import { GameState } from "../domain/types.js";
import type { NotificationError } from "../domain/errors.js";
import {
  GameStatusSubscriber,
  GameStatusTransition,
} from "./game-status-service.js";
import { GameServiceContext } from "./game-service-context.js";
import { PregameUiRenderer } from "./pregame-ui-renderer.js";
import { ConfigDraftStore } from "./stores/config-draft-store.js";
import { PrivateExpectationStore } from "./stores/private-expectation-store.js";
import {
  PregameUiGameState,
  PregameUiStateStore,
} from "./stores/pregame-ui-state-store.js";

export class PregameUiStatusSubscriber implements GameStatusSubscriber {
  private readonly renderer: PregameUiRenderer;
  private readonly syncQueue = new Map<string, Promise<void>>();

  constructor(
    private readonly context: GameServiceContext,
    private readonly configDraftStore: ConfigDraftStore,
    private readonly expectationStore: PrivateExpectationStore,
    private readonly uiStateStore: PregameUiStateStore,
  ) {
    this.renderer = new PregameUiRenderer(
      context,
      configDraftStore,
      expectationStore,
    );
  }

  async onGameStatusChanged(
    transition: GameStatusTransition,
  ): Promise<void | Error> {
    const gameId = transition.current?.gameId ?? transition.previous?.gameId;
    if (!gameId) {
      return;
    }

    return this.enqueueGameSync(gameId, async () => {
      if (!transition.current) {
        this.uiStateStore.delete(gameId);
        return;
      }

      return this.syncGame(gameId);
    });
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

    const groupView = this.renderer.renderGroupView(game);
    const groupReceipt = await this.upsertGroupView(game, state, groupView);
    if (groupReceipt instanceof Error) return groupReceipt;
    this.uiStateStore.set(game.id, state);

    for (const player of game.players) {
      const privateView = this.renderer.renderPrivateView(
        game,
        state.groupStatusMessageId,
        player.id,
      );
      const privateReceipt = await this.upsertPrivateView(
        game,
        state,
        player.id,
        player.telegramUserId,
        privateView,
      );
      if (privateReceipt instanceof Error) return privateReceipt;
      this.uiStateStore.set(game.id, state);
    }
  }

  private async upsertGroupView(
    game: GameState,
    state: PregameUiGameState,
    view: { text: string; buttons?: import("../domain/types.js").UiButton[][] },
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
    view: { text: string; buttons?: import("../domain/types.js").UiButton[][] },
  ): Promise<
    void | appErrors.MarkDmError | appErrors.GameNotFoundError | NotificationError
  > {
    if (game.stage === "LOBBY_OPEN") {
      delete state.privatePanels[playerId];
      return;
    }

    const player = game.players.find((candidate) => candidate.id === playerId);
    if (!player?.dmOpened || player.stage === "BLOCKED_DM") {
      delete state.privatePanels[playerId];
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
      delete state.privatePanels[playerId];
      return this.markDmBlocked(game.id, playerId);
    }

    state.privatePanels[playerId] = {
      chatId: telegramUserId,
      messageId: created.messageId,
    };
  }

  private enqueueGameSync(
    gameId: string,
    action: () => Promise<void | Error>,
  ): Promise<void | Error> {
    const previous = this.syncQueue.get(gameId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(action);
    const settled = run.then(
      () => undefined,
      () => undefined,
    );

    this.syncQueue.set(gameId, settled);
    return run.finally(() => {
      if (this.syncQueue.get(gameId) === settled) {
        this.syncQueue.delete(gameId);
      }
    });
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
