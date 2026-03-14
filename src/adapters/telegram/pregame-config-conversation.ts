import type { Conversation } from "@grammyjs/conversations";
import * as appErrors from "../../domain/errors.js";
import { GameService } from "../../application/game-service.js";
import { getConfigProgress } from "../../application/pregame-ui-projection.js";
import { ConfigDraft, ConfigDraftStore } from "../../application/stores/config-draft-store.js";
import { TextService } from "../../application/text-service.js";
import { GameMode, PairingMode, PlayMode } from "../../domain/types.js";
import { BotContext } from "./bot-context.js";

export interface PregameConfigWizardState {
  step: "MODE" | "PLAY_MODE" | "PAIRING_MODE" | "CONFIRM";
  mode?: GameMode;
  playMode?: PlayMode;
  pairingMode?: PairingMode;
  awaitingConfirmation: boolean;
}

export type PregameConfigWizardAction =
  | { type: "mode"; value: GameMode }
  | { type: "play"; value: PlayMode }
  | { type: "pair"; value: PairingMode }
  | { type: "confirm" }
  | { type: "restart" };

const asActor = (ctx: { from?: BotContext["from"] }) => ({
  telegramUserId: String(ctx.from?.id ?? ""),
  username: ctx.from?.username,
  firstName: ctx.from?.first_name,
  lastName: ctx.from?.last_name,
  languageCode: ctx.from?.language_code,
});

const buildKeyboard = (
  rows: Array<Array<{ text: string; callback_data: string }>>,
) => ({
  inline_keyboard: rows,
});

const initialWizardState = (): PregameConfigWizardState => ({
  step: "MODE",
  awaitingConfirmation: false,
});

const toDraft = (state: PregameConfigWizardState): ConfigDraft => ({
  step: state.step,
  mode: state.mode,
  playMode: state.playMode,
  pairingMode: state.pairingMode,
  awaitingConfirmation: state.awaitingConfirmation,
});

export const createPregameConfigWizardState = (
  draft: ConfigDraft,
): PregameConfigWizardState => {
  if (!draft.mode) {
    return initialWizardState();
  }

  if (!draft.playMode) {
    return {
      step: "PLAY_MODE",
      mode: draft.mode,
      awaitingConfirmation: false,
    };
  }

  if (draft.mode === "NORMAL" && !draft.pairingMode) {
    return {
      step: "PAIRING_MODE",
      mode: draft.mode,
      playMode: draft.playMode,
      awaitingConfirmation: false,
    };
  }

  return {
    step: "CONFIRM",
    mode: draft.mode,
    playMode: draft.playMode,
    pairingMode: draft.mode === "NORMAL" ? draft.pairingMode : undefined,
    awaitingConfirmation: true,
  };
};

export const advancePregameConfigWizardState = (
  state: PregameConfigWizardState,
  action: PregameConfigWizardAction,
): PregameConfigWizardState => {
  if (action.type === "restart") {
    return initialWizardState();
  }

  if (action.type === "mode") {
    return {
      step: "PLAY_MODE",
      mode: action.value,
      awaitingConfirmation: false,
    };
  }

  if (action.type === "play") {
    return {
      step: state.mode === "NORMAL" ? "PAIRING_MODE" : "CONFIRM",
      mode: state.mode,
      playMode: action.value,
      awaitingConfirmation: state.mode !== "NORMAL",
    };
  }

  if (action.type === "pair") {
    return {
      step: "CONFIRM",
      mode: state.mode,
      playMode: state.playMode,
      pairingMode: action.value,
      awaitingConfirmation: true,
    };
  }

  return {
    ...state,
    step: "CONFIRM",
    awaitingConfirmation: true,
  };
};

const deletePrompt = async (
  ctx: { chat?: BotContext["chat"]; api: BotContext["api"] },
  messageId: number,
): Promise<void> => {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    return;
  }

  await ctx.api.deleteMessage(chatId, messageId).catch(() => undefined);
};

const answerError = async (
  ctx: { answerCallbackQuery: BotContext["answerCallbackQuery"] },
  texts: TextService,
  error: Error,
): Promise<void> => {
  const text =
    error instanceof appErrors.DomainAppErrorBase
      ? error.message
      : texts.genericErrorRetry();

  await ctx.answerCallbackQuery({
    text: text.slice(0, 180),
    show_alert: false,
  });
};

const waitForWizardCallback = async (
  conversation: Conversation<BotContext>,
  gameId: string,
  expectedActions: string[],
) => {
  while (true) {
    const ctx = await conversation.waitFor("callback_query:data");
    const payload = ctx.callbackQuery.data;
    const parts = payload.split(":");
    if (parts[0] !== "cfgw") {
      await ctx.answerCallbackQuery();
      continue;
    }

    const [, action, value, payloadGameId] = parts;
    if (!payloadGameId || payloadGameId !== gameId || !expectedActions.includes(action)) {
      await ctx.answerCallbackQuery();
      continue;
    }

    return {
      ctx,
      action,
      value,
    };
  }
};

const modeKeyboard = (texts: TextService, gameId: string) =>
  buildKeyboard([
    [
      {
        text: `🎲 ${texts.gameModeButton("NORMAL")}`,
        callback_data: `cfgw:mode:NORMAL:${gameId}`,
      },
      {
        text: `🔄 ${texts.gameModeButton("REVERSE")}`,
        callback_data: `cfgw:mode:REVERSE:${gameId}`,
      },
    ],
  ]);

const playKeyboard = (texts: TextService, gameId: string) =>
  buildKeyboard([
    [
      {
        text: `💬 ${texts.playModeButton("ONLINE")}`,
        callback_data: `cfgw:play:ONLINE:${gameId}`,
      },
      {
        text: `🪑 ${texts.playModeButton("OFFLINE")}`,
        callback_data: `cfgw:play:OFFLINE:${gameId}`,
      },
    ],
  ]);

const pairKeyboard = (texts: TextService, gameId: string) =>
  buildKeyboard([
    [
      {
        text: `🎯 ${texts.pairingModeButton("RANDOM")}`,
        callback_data: `cfgw:pair:RANDOM:${gameId}`,
      },
      {
        text: `🧩 ${texts.pairingModeButton("MANUAL")}`,
        callback_data: `cfgw:pair:MANUAL:${gameId}`,
      },
    ],
  ]);

const confirmKeyboard = (texts: TextService, gameId: string) =>
  buildKeyboard([
    [
      {
        text: `✅ ${texts.confirmButton()}`,
        callback_data: `cfgw:confirm:YES:${gameId}`,
      },
      {
        text: `🔁 ${texts.restartConfigButton()}`,
        callback_data: `cfgw:restart:YES:${gameId}`,
      },
    ],
  ]);

const isTerminalWizardError = (error: Error): boolean =>
  error instanceof appErrors.GameNotFoundError ||
  error instanceof appErrors.PlayerNotFoundInGameError ||
  error instanceof appErrors.OnlyGameCreatorCanConfigureError ||
  error instanceof appErrors.GameCanBeConfiguredOnlyAfterLobbyClosedError;

const loadInitialWizardState = async (
  conversation: Conversation<BotContext>,
  gameService: GameService,
  configDraftStore: ConfigDraftStore,
  creatorTelegramUserId: string,
  gameId: string,
): Promise<PregameConfigWizardState | null> =>
  conversation.external(() => {
    const snapshot = gameService.findConfiguringGameByCreator(creatorTelegramUserId);
    if (!snapshot || snapshot.gameId !== gameId) {
      return null;
    }

    return createPregameConfigWizardState(configDraftStore.get(gameId));
  });

export const runPregameConfigConversation = async (
  conversation: Conversation<BotContext>,
  ctx: BotContext,
  gameService: GameService,
  configDraftStore: ConfigDraftStore,
  texts: TextService,
  gameId: string,
): Promise<void> => {
  const creatorTelegramUserId = String(ctx.from?.id ?? "");
  let state = await loadInitialWizardState(
    conversation,
    gameService,
    configDraftStore,
    creatorTelegramUserId,
    gameId,
  );
  if (!state) {
    return;
  }

  while (true) {
    const localizedTexts = texts.forLocale(ctx.locale);
    const progress = getConfigProgress(toDraft(state));

    if (state.step === "MODE") {
      const prompt = await ctx.reply(
        [
          localizedTexts.chooseGameModePrompt(),
          localizedTexts.configProgressLine(
            progress.currentStep,
            progress.totalSteps,
            progress.remainingSteps,
          ),
        ].join("\n"),
        { reply_markup: modeKeyboard(localizedTexts, gameId) as never },
      );
      while (true) {
        const callback = await waitForWizardCallback(conversation, gameId, ["mode"]);
        const result = await conversation.external(() =>
          gameService.saveConfigDraftStep(
            gameId,
            asActor(callback.ctx),
            "mode",
            callback.value as GameMode,
          ),
        );
        if (result instanceof Error) {
          if (isTerminalWizardError(result)) {
            await callback.ctx.answerCallbackQuery();
            await deletePrompt(callback.ctx, prompt.message_id);
            return;
          }

          await answerError(callback.ctx, localizedTexts, result);
          continue;
        }

        await callback.ctx.answerCallbackQuery();
        await deletePrompt(callback.ctx, prompt.message_id);
        state = advancePregameConfigWizardState(state, {
          type: "mode",
          value: callback.value as GameMode,
        });
        break;
      }
      continue;
    }

    if (state.step === "PLAY_MODE") {
      const prompt = await ctx.reply(
        [
          localizedTexts.choosePlayModePrompt(),
          localizedTexts.configProgressLine(
            progress.currentStep,
            progress.totalSteps,
            progress.remainingSteps,
          ),
          localizedTexts.configDraftSummary(state),
        ].join("\n"),
        { reply_markup: playKeyboard(localizedTexts, gameId) as never },
      );
      while (true) {
        const callback = await waitForWizardCallback(conversation, gameId, ["play"]);
        const result = await conversation.external(() =>
          gameService.saveConfigDraftStep(
            gameId,
            asActor(callback.ctx),
            "play",
            callback.value as PlayMode,
          ),
        );
        if (result instanceof Error) {
          if (isTerminalWizardError(result)) {
            await callback.ctx.answerCallbackQuery();
            await deletePrompt(callback.ctx, prompt.message_id);
            return;
          }

          await answerError(callback.ctx, localizedTexts, result);
          continue;
        }

        await callback.ctx.answerCallbackQuery();
        await deletePrompt(callback.ctx, prompt.message_id);
        state = advancePregameConfigWizardState(state, {
          type: "play",
          value: callback.value as PlayMode,
        });
        break;
      }
      continue;
    }

    if (state.step === "PAIRING_MODE") {
      const prompt = await ctx.reply(
        [
          localizedTexts.choosePairingModePrompt(),
          localizedTexts.configProgressLine(
            progress.currentStep,
            progress.totalSteps,
            progress.remainingSteps,
          ),
          localizedTexts.configDraftSummary(state),
        ].join("\n"),
        { reply_markup: pairKeyboard(localizedTexts, gameId) as never },
      );
      while (true) {
        const callback = await waitForWizardCallback(conversation, gameId, ["pair"]);
        const result = await conversation.external(() =>
          gameService.saveConfigDraftStep(
            gameId,
            asActor(callback.ctx),
            "pair",
            callback.value as PairingMode,
          ),
        );
        if (result instanceof Error) {
          if (isTerminalWizardError(result)) {
            await callback.ctx.answerCallbackQuery();
            await deletePrompt(callback.ctx, prompt.message_id);
            return;
          }

          await answerError(callback.ctx, localizedTexts, result);
          continue;
        }

        await callback.ctx.answerCallbackQuery();
        await deletePrompt(callback.ctx, prompt.message_id);
        state = advancePregameConfigWizardState(state, {
          type: "pair",
          value: callback.value as PairingMode,
        });
        break;
      }
      continue;
    }

    const confirmPrompt = await ctx.reply(
      [
        localizedTexts.wizardConfirmConfigTitle(),
        localizedTexts.configProgressLine(
          progress.currentStep,
          progress.totalSteps,
          progress.remainingSteps,
        ),
        localizedTexts.configDraftSummary(state),
      ].join("\n"),
      { reply_markup: confirmKeyboard(localizedTexts, gameId) as never },
    );
    while (true) {
      const callback = await waitForWizardCallback(conversation, gameId, ["confirm", "restart"]);
      const result = await conversation.external(() =>
        callback.action === "confirm"
          ? gameService.confirmConfigDraft(gameId, asActor(callback.ctx))
          : gameService.restartConfigDraft(gameId, asActor(callback.ctx)),
      );
      if (result instanceof Error) {
        if (isTerminalWizardError(result)) {
          await callback.ctx.answerCallbackQuery();
          await deletePrompt(callback.ctx, confirmPrompt.message_id);
          return;
        }

        await answerError(callback.ctx, localizedTexts, result);
        continue;
      }

      await callback.ctx.answerCallbackQuery();
      await deletePrompt(callback.ctx, confirmPrompt.message_id);
      if (callback.action === "confirm") {
        return;
      }

      state = advancePregameConfigWizardState(state, { type: "restart" });
      break;
    }
  }
};
