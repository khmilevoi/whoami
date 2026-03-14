import * as errore from "errore";
import { createBaseI18n, TranslationBackend } from "./app-i18n.js";
import { DomainAppError } from "../domain/errors.js";
import {
  LocaleSource,
  GameMode,
  PairingMode,
  PlayMode,
  SupportedLocale,
  TurnRecord,
  VoteDecision,
} from "../domain/types.js";
import { LEGACY_LOCALE } from "../domain/locale.js";

interface ConfigSavedInput {
  mode: GameMode;
  playMode: PlayMode;
  pairingMode?: PairingMode;
}

type VoteOutcome = TurnRecord["outcome"];

type TextServiceInit =
  | SupportedLocale
  | {
      locale?: SupportedLocale;
      i18n?: TranslationBackend;
    };

const defaultI18n = createBaseI18n();

const joinOptionalLine = (value: string | undefined): string => (value ? `, ${value}` : "");

export class TextService {
  readonly locale: SupportedLocale;
  private readonly i18n: TranslationBackend;

  constructor(init: TextServiceInit = LEGACY_LOCALE) {
    if (typeof init === "string") {
      this.locale = init;
      this.i18n = defaultI18n;
      return;
    }

    this.locale = init.locale ?? LEGACY_LOCALE;
    this.i18n = init.i18n ?? defaultI18n;
  }

  forLocale(locale: SupportedLocale): TextService {
    return new TextService({ locale, i18n: this.i18n });
  }

  renderError(error: DomainAppError): string {
    const translation: {
      key: string;
      vars?: Record<string, unknown>;
    } = errore.matchError(error, {
      InvalidManualPairPayloadError: () => ({ key: "error-invalid-manual-pair-payload" }),
      InvalidStartPayloadError: () => ({ key: "error-invalid-start-payload" }),
      ActiveGameNotFoundByChatError: () => ({ key: "error-active-game-not-found-by-chat" }),
      GameNotFoundError: () => ({ key: "error-game-not-found" }),
      PlayerNotFoundInGameError: () => ({ key: "error-player-not-found-in-game" }),
      ActiveGameAlreadyExistsInChatError: () => ({ key: "error-active-game-already-exists" }),
      GameConfigurationNotSetError: () => ({ key: "error-game-configuration-not-set" }),
      GameConfigurationMissingError: () => ({ key: "error-game-configuration-missing" }),
      OnlyGameCreatorCanCancelError: () => ({ key: "error-only-game-creator-can-cancel" }),
      UnknownGameModeError: (typedError) => ({
        key: "error-unknown-game-mode",
        vars: { mode: typedError.mode },
      }),
      OnlyGameCreatorCanConfigureError: () => ({ key: "error-only-game-creator-can-configure" }),
      JoinAllowedOnlyWhenLobbyOpenError: () => ({ key: "error-join-allowed-only-when-lobby-open" }),
      MaxPlayersReachedError: (typedError) => ({
        key: "error-max-players-reached",
        vars: { maxPlayers: typedError.maxPlayers },
      }),
      LobbyAlreadyClosedError: () => ({ key: "error-lobby-already-closed" }),
      OnlyGameCreatorCanCloseLobbyError: () => ({ key: "error-only-game-creator-can-close-lobby" }),
      MinPlayersRequiredToStartError: (typedError) => ({
        key: "error-min-players-required",
        vars: { minPlayers: typedError.minPlayers },
      }),
      GameCanBeConfiguredOnlyAfterLobbyClosedError: () => ({
        key: "error-game-can-be-configured-only-after-lobby-closed",
      }),
      PairingModeRequiredForNormalModeError: () => ({
        key: "error-pairing-mode-required-for-normal-mode",
      }),
      ManualPairingAvailableOnlyForNormalManualModeError: () => ({
        key: "error-manual-pairing-available-only-for-normal-manual-mode",
      }),
      NotPlayersTurnToPickPairError: () => ({ key: "error-not-players-turn-to-pick-pair" }),
      WordCannotBeEmptyError: () => ({ key: "error-word-cannot-be-empty" }),
      WordMustBeSubmittedBeforeConfirmationError: () => ({
        key: "error-word-must-be-submitted-before-confirmation",
      }),
      WordMustBeConfirmedBeforeClueSubmissionError: () => ({
        key: "error-word-must-be-confirmed-before-clue-submission",
      }),
      WordMustBeConfirmedBeforeFinalizationError: () => ({
        key: "error-word-must-be-confirmed-before-finalization",
      }),
      NotAllPlayersConfirmedWordsError: () => ({ key: "error-not-all-players-confirmed-words" }),
      PendingVoteMustBeResolvedFirstError: () => ({
        key: "error-pending-vote-must-be-resolved-first",
      }),
      QuestionTextRequiredInOnlineModeError: () => ({
        key: "error-question-text-required-in-online-mode",
      }),
      NotPlayersTurnError: () => ({ key: "error-not-players-turn" }),
      ReverseModeTargetMissingError: () => ({ key: "error-reverse-mode-target-missing" }),
      NoPendingVoteError: () => ({ key: "error-no-pending-vote" }),
      PlayerNotAllowedToVoteError: () => ({ key: "error-player-not-allowed-to-vote" }),
      ReverseVoteTargetMissingError: () => ({ key: "error-reverse-vote-target-missing" }),
      NoActivePlayersLeftError: () => ({ key: "error-no-active-players-left" }),
      UnableToResolveCurrentAskerError: () => ({ key: "error-unable-to-resolve-current-asker" }),
      ReverseModeAskerMissingError: () => ({ key: "error-reverse-mode-asker-missing" }),
      WordActionsNotAvailableInCurrentStageError: () => ({
        key: "error-word-actions-not-available-in-current-stage",
      }),
      ExpectedStageMismatchError: (typedError) => ({
        key: "error-expected-stage-mismatch",
        vars: {
          expectedStage: typedError.expectedStage,
          actualStage: typedError.actualStage,
        },
      }),
      PlayerNotFoundError: () => ({ key: "error-player-not-found" }),
      WordEntryForPlayerMissingError: () => ({ key: "error-word-entry-for-player-missing" }),
      NeedAtLeastTwoPlayersForPairingsError: () => ({
        key: "error-need-at-least-two-players-for-pairings",
      }),
      UnknownPlayerInManualPairingError: () => ({ key: "error-unknown-player-in-manual-pairing" }),
      PlayerCannotPairWithSelfError: () => ({ key: "error-player-cannot-pair-with-self" }),
      PlayerHasAlreadySelectedAPairError: () => ({
        key: "error-player-has-already-selected-a-pair",
      }),
      SelectedTargetIsAlreadyTakenError: () => ({ key: "error-selected-target-is-already-taken" }),
      Error: () => ({ key: "generic-error-retry" }),
    });

    return this.t(translation.key, translation.vars);
  }

  commandOpenPrivateChatDescription(): string {
    return this.t("command-open-private-chat-description");
  }

  commandCreateGameDescription(): string {
    return this.t("command-create-game-description");
  }

  commandJoinGameDescription(): string {
    return this.t("command-join-game-description");
  }

  commandConfigureGameDescription(): string {
    return this.t("command-configure-game-description");
  }

  commandCancelGameDescription(): string {
    return this.t("command-cancel-game-description");
  }

  commandGiveUpDescription(): string {
    return this.t("command-giveup-description");
  }

  commandAskOfflineDescription(): string {
    return this.t("command-ask-offline-description");
  }

  commandLanguageDescription(): string {
    return this.t("command-language-description");
  }

  genericErrorRetry(): string {
    return this.t("generic-error-retry");
  }

  groupOnlyCommand(): string {
    return this.t("group-only-command");
  }

  gameCreatedAck(): string {
    return this.t("game-created-ack");
  }

  joinedGameAck(): string {
    return this.t("joined-game-ack");
  }

  configSentToCreatorAck(): string {
    return this.t("config-sent-to-creator-ack");
  }

  gameCancelledAck(): string {
    return this.t("game-cancelled-ack");
  }

  onlineModeDisabledMessage(): string {
    return this.t("online-mode-disabled-message");
  }

  onlineModeDisabledAlert(): string {
    return this.t("online-mode-disabled-alert");
  }

  onlineModeUnknownMessage(): string {
    return this.t("online-mode-unknown-message");
  }

  onlineModeUnknownAlert(): string {
    return this.t("online-mode-unknown-alert");
  }

  gameStarted(creatorName: string): string {
    return this.t("game-started", { creatorName });
  }

  playerJoined(name: string, count: number): string {
    return this.t("player-joined", { name, count });
  }

  lobbyClosedConfiguringInPrivate(): string {
    return this.t("lobby-closed-configuring-in-private");
  }

  chooseGameModePrompt(): string {
    return this.t("choose-game-mode-prompt");
  }

  gameModeButton(mode: GameMode): string {
    return mode === "NORMAL"
      ? this.t("game-mode-button-normal")
      : this.t("game-mode-button-reverse");
  }

  creatorDmRequired(deepLink: string): string {
    return this.t("creator-dm-required", { deepLink });
  }

  dmLinkRequired(playerLabel: string, deepLink: string): string {
    return this.t("dm-link-required", { playerLabel, deepLink });
  }

  dmLinkWithLabel(playerLabel: string, deepLink: string): string {
    return this.t("dm-link-with-label", { playerLabel, deepLink });
  }

  noActiveGamesForUser(): string {
    return this.t("no-active-games-for-user");
  }

  privateChatActivated(): string {
    return this.t("private-chat-activated");
  }

  giveUpOnlyDuringGame(): string {
    return this.t("give-up-only-during-game");
  }

  gameCancelledByCreator(): string {
    return this.t("game-cancelled-by-creator");
  }

  voteOutcome(outcome: VoteOutcome): string {
    if (outcome === "YES") {
      return this.t("vote-outcome-yes");
    }
    if (outcome === "NO") {
      return this.t("vote-outcome-no");
    }
    if (outcome === "GUESSED") {
      return this.t("vote-outcome-guessed");
    }
    return this.t("vote-outcome-giveup");
  }

  voteDecisionButton(decision: VoteDecision): string {
    if (decision === "YES") {
      return this.t("vote-outcome-yes");
    }
    if (decision === "NO") {
      return this.t("vote-outcome-no");
    }
    return this.t("vote-outcome-guessed");
  }

  voteSummary(outcome: VoteOutcome): string {
    return this.t("vote-summary", { outcome: this.voteOutcome(outcome) });
  }

  playerGaveUp(name: string): string {
    return this.t("player-gave-up", { name });
  }

  currentTurn(label: string): string {
    return this.t("current-turn", { label });
  }

  askOfflinePrompt(label: string): string {
    return this.t("ask-offline-prompt", { label });
  }

  startPollButton(): string {
    return this.t("start-poll-button");
  }

  otherPlayersWordsList(visibleWords: string): string {
    return this.t("other-players-words-list", {
      visibleWords: visibleWords || this.t("other-players-words-list-empty"),
    });
  }

  gameFinished(): string {
    return this.t("game-finished");
  }

  normalSummary(lines: string[]): string {
    return `${this.t("normal-summary-title")}\n${lines.join("\n")}`;
  }

  finalWordAssignments(lines: string[]): string {
    return `${this.t("final-word-assignments-title")}\n${lines.join("\n") || "-"}`;
  }

  votePrompt(askerLabel: string): string {
    return this.t("vote-prompt", { askerLabel });
  }

  reverseTargetTurn(targetLabel: string, askerLabel: string): string {
    return this.t("reverse-target-turn", { targetLabel, askerLabel });
  }

  reverseSummary(ownerText: string, guesserText: string): string {
    return [
      this.t("reverse-summary-title"),
      this.t("reverse-summary-owned"),
      ownerText || "-",
      "",
      this.t("reverse-summary-guessed"),
      guesserText || "-",
    ].join("\n");
  }

  reverseVotePrompt(askerLabel: string, targetLabel: string): string {
    return this.t("reverse-vote-prompt", { askerLabel, targetLabel });
  }

  choosePlayModePrompt(): string {
    return this.t("choose-play-mode-prompt");
  }

  playModeButton(mode: PlayMode): string {
    return mode === "ONLINE"
      ? this.t("play-mode-button-online")
      : this.t("play-mode-button-offline");
  }

  choosePairingModePrompt(): string {
    return this.t("choose-pairing-mode-prompt");
  }

  pairingModeButton(mode: PairingMode): string {
    return mode === "RANDOM"
      ? this.t("pairing-mode-button-random")
      : this.t("pairing-mode-button-manual");
  }

  gameMode(mode: GameMode): string {
    return mode === "NORMAL" ? this.t("game-mode-normal") : this.t("game-mode-reverse");
  }

  playMode(mode: PlayMode): string {
    return mode === "ONLINE" ? this.t("play-mode-online") : this.t("play-mode-offline");
  }

  pairingMode(mode: PairingMode): string {
    return mode === "RANDOM" ? this.t("pairing-mode-random") : this.t("pairing-mode-manual");
  }

  configSaved(input: ConfigSavedInput): string {
    return this.t("config-saved", {
      mode: this.gameMode(input.mode),
      playMode: this.playMode(input.playMode),
      pairingMode: joinOptionalLine(
        input.pairingMode
          ? this.t("config-saved-pairing-mode", {
              pairingMode: this.pairingMode(input.pairingMode),
            })
          : undefined,
      ),
    });
  }

  manualPairPrompt(): string {
    return this.t("manual-pair-prompt");
  }

  manualPairingCompleted(): string {
    return this.t("manual-pairing-completed");
  }

  allReadyGameStarts(): string {
    return this.t("all-ready-game-starts");
  }

  waitForPairingCompletion(): string {
    return this.t("wait-for-pairing-completion");
  }

  confirmWordPrompt(word: string): string {
    return this.t("confirm-word-prompt", { word });
  }

  yesButton(): string {
    return this.t("yes-button");
  }

  noButton(): string {
    return this.t("no-button");
  }

  reenterWordPrompt(): string {
    return this.t("reenter-word-prompt");
  }

  addCluePrompt(): string {
    return this.t("add-clue-prompt");
  }

  enterCluePrompt(): string {
    return this.t("enter-clue-prompt");
  }

  restartWordPrompt(): string {
    return this.t("restart-word-prompt");
  }

  readyWaitingOthers(): string {
    return this.t("ready-waiting-others");
  }

  enterWordPrompt(): string {
    return this.t("enter-word-prompt");
  }

  wordSummary(word: string | undefined, clue: string | undefined): string {
    return [
      this.t("word-summary-word", { word: word ?? "-" }),
      this.t("word-summary-clue", { clue: clue ?? this.t("word-summary-clue-empty") }),
      this.t("word-summary-confirm"),
    ].join("\n");
  }

  confirmButton(): string {
    return this.t("confirm-button");
  }

  editButton(): string {
    return this.t("edit-button");
  }

  groupLobbyStatusOpen(joined: number, maxPlayers: number, minPlayers: number): string {
    return [
      this.t("group-lobby-status-open-title"),
      this.t("group-lobby-status-open-count", { joined, maxPlayers }),
      joined >= minPlayers
        ? this.t("group-lobby-status-open-ready")
        : this.t("group-lobby-status-open-min-players", { minPlayers }),
    ].join("\n");
  }

  groupConfiguringStatus(input: {
    mode?: GameMode;
    playMode?: PlayMode;
    pairingMode?: PairingMode;
  }): string {
    return [
      this.t("group-configuring-status-title"),
      this.t("group-configuring-status-private-chat"),
      this.t("group-configuring-status-mode", {
        mode: input.mode ? this.gameMode(input.mode) : "-",
      }),
      this.t("group-configuring-status-play-mode", {
        playMode: input.playMode ? this.playMode(input.playMode) : "-",
      }),
      this.t("group-configuring-status-pairing-mode", {
        pairingMode: input.pairingMode ? this.pairingMode(input.pairingMode) : "-",
      }),
    ].join("\n");
  }

  groupWordCollectionStatus(readyCount: number, totalPlayers: number): string {
    return [
      this.t("group-word-collection-status-title"),
      this.t("group-word-collection-status-count", { readyCount, totalPlayers }),
    ].join("\n");
  }

  groupInitializationFinished(): string {
    return [
      this.t("group-initialization-finished-title"),
      this.t("group-initialization-finished-subtitle"),
    ].join("\n");
  }

  groupCanceledStatus(): string {
    return this.t("group-canceled-status");
  }

  groupFinishedStatus(): string {
    return this.t("group-finished-status");
  }

  privatePanelPlayerNotFound(): string {
    return this.t("private-panel-player-not-found");
  }

  privateLobbyStatus(playerCount: number, isCreator: boolean): string {
    return [
      this.t("private-lobby-status-title"),
      this.t("private-lobby-status-room", { playerCount }),
      isCreator
        ? this.t("private-lobby-status-creator")
        : this.t("private-lobby-status-player"),
    ].join("\n");
  }

  privateCreatorConfigStatus(): string {
    return this.t("private-creator-config-status");
  }

  privatePlayerConfigStatus(): string {
    return this.t("private-player-config-status");
  }

  privateEnterWordStatus(readyCount: number, totalPlayers: number): string {
    return this.t("private-enter-word-status", { readyCount, totalPlayers });
  }

  privateEnterClueStatus(readyCount: number, totalPlayers: number): string {
    return this.t("private-enter-clue-status", { readyCount, totalPlayers });
  }

  privateClueDecisionStatus(readyCount: number, totalPlayers: number): string {
    return `${this.addCluePrompt()}\n${this.t("group-word-collection-status-count", {
      readyCount,
      totalPlayers,
    })}`;
  }

  privateReadyWaitingStatus(readyCount: number, totalPlayers: number): string {
    return this.t("private-ready-waiting-status", { readyCount, totalPlayers });
  }

  privateGameStartedStatus(): string {
    return this.t("private-game-started-status");
  }

  privateCanceledStatus(): string {
    return this.t("private-canceled-status");
  }

  privateFinishedStatus(): string {
    return this.t("private-finished-status");
  }

  configProgressLine(currentStep: number, totalSteps: number, remainingSteps: number): string {
    return this.t("config-progress-line", {
      currentStep,
      totalSteps,
      remainingSteps,
    });
  }

  configResponsibleLine(playerLabel: string): string {
    return this.t("config-responsible-line", { playerLabel });
  }

  configDraftSummary(input: {
    mode?: GameMode;
    playMode?: PlayMode;
    pairingMode?: PairingMode;
  }): string {
    return [
      this.t("group-configuring-status-mode", {
        mode: input.mode ? this.gameMode(input.mode) : "-",
      }),
      this.t("group-configuring-status-play-mode", {
        playMode: input.playMode ? this.playMode(input.playMode) : "-",
      }),
      this.t("group-configuring-status-pairing-mode", {
        pairingMode: input.pairingMode ? this.pairingMode(input.pairingMode) : "-",
      }),
    ].join("\n");
  }

  wizardConfirmConfigTitle(): string {
    return this.t("wizard-confirm-config-title");
  }

  restartConfigButton(): string {
    return this.t("restart-config-button");
  }

  manualPairingStatusTitle(): string {
    return this.t("manual-pairing-status-title");
  }

  manualPairingCurrentChooser(playerLabel: string): string {
    return this.t("manual-pairing-current-chooser", { playerLabel });
  }

  manualPairingQueuePosition(queuePosition: number): string {
    return this.t("manual-pairing-queue-position", { queuePosition });
  }

  manualPairingRemaining(remainingSteps: number): string {
    return this.t("manual-pairing-remaining", { remainingSteps });
  }

  manualPairingAlreadySelected(): string {
    return this.t("manual-pairing-already-selected");
  }

  joinGameButton(): string {
    return this.t("join-game-button");
  }

  configureGameButton(): string {
    return this.t("configure-game-button");
  }

  openConfigMenuButton(): string {
    return this.t("open-config-menu-button");
  }

  openPrivateChatButton(): string {
    return this.t("open-private-chat-button");
  }

  openMainChatButton(): string {
    return this.t("open-main-chat-button");
  }

  chooseLanguagePrompt(): string {
    return this.t("choose-language-prompt");
  }

  languageUpdated(locale: SupportedLocale): string {
    return this.t("language-updated", { language: this.localeName(locale) });
  }

  languagePrivateOnly(deepLink: string): string {
    return this.t("language-private-only", { deepLink });
  }

  languageButton(locale: SupportedLocale): string {
    return locale === "ru" ? this.t("language-button-ru") : this.t("language-button-en");
  }

  localeName(locale: SupportedLocale): string {
    return locale === "ru" ? this.t("locale-name-ru") : this.t("locale-name-en");
  }

  private t(key: string, variables?: Record<string, unknown>): string {
    return this.i18n.t(this.locale, key, variables);
  }
}



