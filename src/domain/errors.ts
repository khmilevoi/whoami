import * as errore from "errore";

export class DomainAppErrorBase extends Error {}

export class InfrastructureErrorBase extends Error {}

export class InvalidManualPairPayloadError extends errore.createTaggedError({
  name: "InvalidManualPairPayloadError",
  message: "InvalidManualPairPayloadError",
  extends: DomainAppErrorBase,
}) {}

export class InvalidStartPayloadError extends errore.createTaggedError({
  name: "InvalidStartPayloadError",
  message: "InvalidStartPayloadError",
  extends: DomainAppErrorBase,
}) {}

export class ActiveGameNotFoundByChatError extends errore.createTaggedError({
  name: "ActiveGameNotFoundByChatError",
  message: "ActiveGameNotFoundByChatError",
  extends: DomainAppErrorBase,
}) {}

export class GameNotFoundError extends errore.createTaggedError({
  name: "GameNotFoundError",
  message: "GameNotFoundError",
  extends: DomainAppErrorBase,
}) {}

export class PlayerNotFoundInGameError extends errore.createTaggedError({
  name: "PlayerNotFoundInGameError",
  message: "PlayerNotFoundInGameError",
  extends: DomainAppErrorBase,
}) {}

export class ActiveGameAlreadyExistsInChatError extends errore.createTaggedError(
  {
    name: "ActiveGameAlreadyExistsInChatError",
    message: "ActiveGameAlreadyExistsInChatError",
    extends: DomainAppErrorBase,
  },
) {}

export class GameConfigurationNotSetError extends errore.createTaggedError({
  name: "GameConfigurationNotSetError",
  message: "GameConfigurationNotSetError",
  extends: DomainAppErrorBase,
}) {}

export class OnlyGameCreatorCanCancelError extends errore.createTaggedError({
  name: "OnlyGameCreatorCanCancelError",
  message: "OnlyGameCreatorCanCancelError",
  extends: DomainAppErrorBase,
}) {}

export class UnknownGameModeError extends errore.createTaggedError({
  name: "UnknownGameModeError",
  message: "Unknown game mode $mode",
  extends: DomainAppErrorBase,
}) {}

export class OnlyGameCreatorCanConfigureError extends errore.createTaggedError({
  name: "OnlyGameCreatorCanConfigureError",
  message: "OnlyGameCreatorCanConfigureError",
  extends: DomainAppErrorBase,
}) {}

export class JoinAllowedOnlyWhenLobbyOpenError extends errore.createTaggedError(
  {
    name: "JoinAllowedOnlyWhenLobbyOpenError",
    message: "JoinAllowedOnlyWhenLobbyOpenError",
    extends: DomainAppErrorBase,
  },
) {}

export class MaxPlayersReachedError extends errore.createTaggedError({
  name: "MaxPlayersReachedError",
  message: "Maximum players reached $maxPlayers",
  extends: DomainAppErrorBase,
}) {}

export class LobbyAlreadyClosedError extends errore.createTaggedError({
  name: "LobbyAlreadyClosedError",
  message: "LobbyAlreadyClosedError",
  extends: DomainAppErrorBase,
}) {}

export class OnlyGameCreatorCanCloseLobbyError extends errore.createTaggedError(
  {
    name: "OnlyGameCreatorCanCloseLobbyError",
    message: "OnlyGameCreatorCanCloseLobbyError",
    extends: DomainAppErrorBase,
  },
) {}

export class MinPlayersRequiredToStartError extends errore.createTaggedError({
  name: "MinPlayersRequiredToStartError",
  message: "Minimum players required $minPlayers",
  extends: DomainAppErrorBase,
}) {}

export class GameCanBeConfiguredOnlyAfterLobbyClosedError extends errore.createTaggedError(
  {
    name: "GameCanBeConfiguredOnlyAfterLobbyClosedError",
    message: "GameCanBeConfiguredOnlyAfterLobbyClosedError",
    extends: DomainAppErrorBase,
  },
) {}

export class PairingModeRequiredForNormalModeError extends errore.createTaggedError(
  {
    name: "PairingModeRequiredForNormalModeError",
    message: "PairingModeRequiredForNormalModeError",
    extends: DomainAppErrorBase,
  },
) {}

export class ManualPairingAvailableOnlyForNormalManualModeError extends errore.createTaggedError(
  {
    name: "ManualPairingAvailableOnlyForNormalManualModeError",
    message: "ManualPairingAvailableOnlyForNormalManualModeError",
    extends: DomainAppErrorBase,
  },
) {}

export class NotPlayersTurnToPickPairError extends errore.createTaggedError({
  name: "NotPlayersTurnToPickPairError",
  message: "NotPlayersTurnToPickPairError",
  extends: DomainAppErrorBase,
}) {}

export class WordCannotBeEmptyError extends errore.createTaggedError({
  name: "WordCannotBeEmptyError",
  message: "WordCannotBeEmptyError",
  extends: DomainAppErrorBase,
}) {}

export class WordMustBeSubmittedBeforeConfirmationError extends errore.createTaggedError(
  {
    name: "WordMustBeSubmittedBeforeConfirmationError",
    message: "WordMustBeSubmittedBeforeConfirmationError",
    extends: DomainAppErrorBase,
  },
) {}

export class WordMustBeConfirmedBeforeClueSubmissionError extends errore.createTaggedError(
  {
    name: "WordMustBeConfirmedBeforeClueSubmissionError",
    message: "WordMustBeConfirmedBeforeClueSubmissionError",
    extends: DomainAppErrorBase,
  },
) {}

export class WordMustBeConfirmedBeforeFinalizationError extends errore.createTaggedError(
  {
    name: "WordMustBeConfirmedBeforeFinalizationError",
    message: "WordMustBeConfirmedBeforeFinalizationError",
    extends: DomainAppErrorBase,
  },
) {}

export class NotAllPlayersConfirmedWordsError extends errore.createTaggedError({
  name: "NotAllPlayersConfirmedWordsError",
  message: "NotAllPlayersConfirmedWordsError",
  extends: DomainAppErrorBase,
}) {}

export class GameConfigurationMissingError extends errore.createTaggedError({
  name: "GameConfigurationMissingError",
  message: "GameConfigurationMissingError",
  extends: DomainAppErrorBase,
}) {}

export class PendingVoteMustBeResolvedFirstError extends errore.createTaggedError(
  {
    name: "PendingVoteMustBeResolvedFirstError",
    message: "PendingVoteMustBeResolvedFirstError",
    extends: DomainAppErrorBase,
  },
) {}

export class QuestionTextRequiredInOnlineModeError extends errore.createTaggedError(
  {
    name: "QuestionTextRequiredInOnlineModeError",
    message: "QuestionTextRequiredInOnlineModeError",
    extends: DomainAppErrorBase,
  },
) {}

export class NotPlayersTurnError extends errore.createTaggedError({
  name: "NotPlayersTurnError",
  message: "NotPlayersTurnError",
  extends: DomainAppErrorBase,
}) {}

export class ReverseModeTargetMissingError extends errore.createTaggedError({
  name: "ReverseModeTargetMissingError",
  message: "ReverseModeTargetMissingError",
  extends: DomainAppErrorBase,
}) {}

export class NoPendingVoteError extends errore.createTaggedError({
  name: "NoPendingVoteError",
  message: "NoPendingVoteError",
  extends: DomainAppErrorBase,
}) {}

export class PlayerNotAllowedToVoteError extends errore.createTaggedError({
  name: "PlayerNotAllowedToVoteError",
  message: "PlayerNotAllowedToVoteError",
  extends: DomainAppErrorBase,
}) {}

export class ReverseVoteTargetMissingError extends errore.createTaggedError({
  name: "ReverseVoteTargetMissingError",
  message: "ReverseVoteTargetMissingError",
  extends: DomainAppErrorBase,
}) {}

export class NoActivePlayersLeftError extends errore.createTaggedError({
  name: "NoActivePlayersLeftError",
  message: "NoActivePlayersLeftError",
  extends: DomainAppErrorBase,
}) {}

export class UnableToResolveCurrentAskerError extends errore.createTaggedError({
  name: "UnableToResolveCurrentAskerError",
  message: "UnableToResolveCurrentAskerError",
  extends: DomainAppErrorBase,
}) {}

export class ReverseModeAskerMissingError extends errore.createTaggedError({
  name: "ReverseModeAskerMissingError",
  message: "ReverseModeAskerMissingError",
  extends: DomainAppErrorBase,
}) {}

export class WordActionsNotAvailableInCurrentStageError extends errore.createTaggedError(
  {
    name: "WordActionsNotAvailableInCurrentStageError",
    message: "WordActionsNotAvailableInCurrentStageError",
    extends: DomainAppErrorBase,
  },
) {}

export class ExpectedStageMismatchError extends errore.createTaggedError({
  name: "ExpectedStageMismatchError",
  message: "Expected stage $expectedStage, got $actualStage",
  extends: DomainAppErrorBase,
}) {}

export class PlayerNotFoundError extends errore.createTaggedError({
  name: "PlayerNotFoundError",
  message: "PlayerNotFoundError",
  extends: DomainAppErrorBase,
}) {}

export class WordEntryForPlayerMissingError extends errore.createTaggedError({
  name: "WordEntryForPlayerMissingError",
  message: "WordEntryForPlayerMissingError",
  extends: DomainAppErrorBase,
}) {}

export class NeedAtLeastTwoPlayersForPairingsError extends errore.createTaggedError(
  {
    name: "NeedAtLeastTwoPlayersForPairingsError",
    message: "NeedAtLeastTwoPlayersForPairingsError",
    extends: DomainAppErrorBase,
  },
) {}

export class UnknownPlayerInManualPairingError extends errore.createTaggedError(
  {
    name: "UnknownPlayerInManualPairingError",
    message: "UnknownPlayerInManualPairingError",
    extends: DomainAppErrorBase,
  },
) {}

export class PlayerCannotPairWithSelfError extends errore.createTaggedError({
  name: "PlayerCannotPairWithSelfError",
  message: "PlayerCannotPairWithSelfError",
  extends: DomainAppErrorBase,
}) {}

export class PlayerHasAlreadySelectedAPairError extends errore.createTaggedError(
  {
    name: "PlayerHasAlreadySelectedAPairError",
    message: "PlayerHasAlreadySelectedAPairError",
    extends: DomainAppErrorBase,
  },
) {}

export class SelectedTargetIsAlreadyTakenError extends errore.createTaggedError(
  {
    name: "SelectedTargetIsAlreadyTakenError",
    message: "SelectedTargetIsAlreadyTakenError",
    extends: DomainAppErrorBase,
  },
) {}

export class MissingBotTokenError extends errore.createTaggedError({
  name: "MissingBotTokenError",
  message: "MissingBotTokenError",
  extends: InfrastructureErrorBase,
}) {}

export class DatabaseOpenError extends errore.createTaggedError({
  name: "DatabaseOpenError",
  message: "Failed to open database at $filePath",
  extends: InfrastructureErrorBase,
}) {}

export class TelegramApiError extends errore.createTaggedError({
  name: "TelegramApiError",
  message: "Telegram API failed during $operation",
  extends: InfrastructureErrorBase,
}) {}

export class CommandSyncError extends errore.createTaggedError({
  name: "CommandSyncError",
  message: "Command sync failed for $scope",
  extends: InfrastructureErrorBase,
}) {}

export class StartupTaskError extends errore.createTaggedError({
  name: "StartupTaskError",
  message: "Startup task failed for $task",
  extends: InfrastructureErrorBase,
}) {}

export class WebhookHandlingError extends errore.createTaggedError({
  name: "WebhookHandlingError",
  message: "WebhookHandlingError",
  extends: InfrastructureErrorBase,
}) {}

export type ManualPairPayloadError = InvalidManualPairPayloadError;
export type StartPayloadError = InvalidStartPayloadError;

export type PairingValidationError =
  | UnknownPlayerInManualPairingError
  | PlayerCannotPairWithSelfError
  | PlayerHasAlreadySelectedAPairError
  | SelectedTargetIsAlreadyTakenError;

export type PairingError =
  | NeedAtLeastTwoPlayersForPairingsError
  | PairingValidationError;

export type MarkDmError = PlayerNotFoundError;

export type JoinGameError =
  | JoinAllowedOnlyWhenLobbyOpenError
  | MaxPlayersReachedError;

export type CloseLobbyError =
  | LobbyAlreadyClosedError
  | OnlyGameCreatorCanCloseLobbyError
  | MinPlayersRequiredToStartError;

export type ConfigureGameError =
  | GameCanBeConfiguredOnlyAfterLobbyClosedError
  | OnlyGameCreatorCanConfigureError
  | PairingModeRequiredForNormalModeError
  | PairingError;

export type SelectManualPairError =
  | ExpectedStageMismatchError
  | ManualPairingAvailableOnlyForNormalManualModeError
  | NotPlayersTurnToPickPairError
  | PairingValidationError;

export type SubmitWordError =
  | WordActionsNotAvailableInCurrentStageError
  | WordCannotBeEmptyError
  | WordEntryForPlayerMissingError
  | PlayerNotFoundError;

export type ConfirmWordError =
  | WordActionsNotAvailableInCurrentStageError
  | WordEntryForPlayerMissingError
  | PlayerNotFoundError
  | WordMustBeSubmittedBeforeConfirmationError;

export type SubmitClueError =
  | WordActionsNotAvailableInCurrentStageError
  | WordEntryForPlayerMissingError
  | WordMustBeConfirmedBeforeClueSubmissionError;

export type FinalizeWordError =
  | WordActionsNotAvailableInCurrentStageError
  | WordEntryForPlayerMissingError
  | PlayerNotFoundError
  | WordMustBeConfirmedBeforeFinalizationError;

export type StatsError = GameConfigurationMissingError | PlayerNotFoundError;

export type StartGameIfReadyError =
  | NotAllPlayersConfirmedWordsError
  | GameConfigurationMissingError;

export type ResolveCurrentAskerError =
  | GameConfigurationMissingError
  | NoActivePlayersLeftError
  | PlayerNotFoundError
  | UnableToResolveCurrentAskerError
  | ReverseModeAskerMissingError;

export type AskQuestionError =
  | ExpectedStageMismatchError
  | ResolveCurrentAskerError
  | PendingVoteMustBeResolvedFirstError
  | QuestionTextRequiredInOnlineModeError
  | NotPlayersTurnError
  | ReverseModeTargetMissingError;

export type CastVoteError =
  | ExpectedStageMismatchError
  | NoPendingVoteError
  | PlayerNotAllowedToVoteError
  | GameConfigurationMissingError
  | ReverseVoteTargetMissingError
  | ResolveCurrentAskerError;

export type GiveUpError =
  | ExpectedStageMismatchError
  | GameConfigurationMissingError
  | PlayerNotFoundError
  | ResolveCurrentAskerError;

export type GameEngineError =
  | MarkDmError
  | JoinGameError
  | CloseLobbyError
  | ConfigureGameError
  | SelectManualPairError
  | SubmitWordError
  | ConfirmWordError
  | SubmitClueError
  | FinalizeWordError
  | StartGameIfReadyError
  | AskQuestionError
  | CastVoteError
  | GiveUpError;

export type NotificationError = TelegramApiError;
export type CommandSyncAppError = CommandSyncError;
export type WebhookAppError = WebhookHandlingError;
export type StartAppError = MissingBotTokenError;
export type StartupAppError = CommandSyncError | StartupTaskError;

export const DOMAIN_ERROR_FACTORIES = {
  InvalidManualPairPayloadError: () => new InvalidManualPairPayloadError(),
  InvalidStartPayloadError: () => new InvalidStartPayloadError(),
  ActiveGameNotFoundByChatError: () => new ActiveGameNotFoundByChatError(),
  GameNotFoundError: () => new GameNotFoundError(),
  PlayerNotFoundInGameError: () => new PlayerNotFoundInGameError(),
  ActiveGameAlreadyExistsInChatError: () =>
    new ActiveGameAlreadyExistsInChatError(),
  GameConfigurationNotSetError: () => new GameConfigurationNotSetError(),
  OnlyGameCreatorCanCancelError: () => new OnlyGameCreatorCanCancelError(),
  UnknownGameModeError: () => new UnknownGameModeError({ mode: "BROKEN" }),
  OnlyGameCreatorCanConfigureError: () =>
    new OnlyGameCreatorCanConfigureError(),
  JoinAllowedOnlyWhenLobbyOpenError: () =>
    new JoinAllowedOnlyWhenLobbyOpenError(),
  MaxPlayersReachedError: () => new MaxPlayersReachedError({ maxPlayers: 7 }),
  LobbyAlreadyClosedError: () => new LobbyAlreadyClosedError(),
  OnlyGameCreatorCanCloseLobbyError: () =>
    new OnlyGameCreatorCanCloseLobbyError(),
  MinPlayersRequiredToStartError: () =>
    new MinPlayersRequiredToStartError({ minPlayers: 3 }),
  GameCanBeConfiguredOnlyAfterLobbyClosedError: () =>
    new GameCanBeConfiguredOnlyAfterLobbyClosedError(),
  PairingModeRequiredForNormalModeError: () =>
    new PairingModeRequiredForNormalModeError(),
  ManualPairingAvailableOnlyForNormalManualModeError: () =>
    new ManualPairingAvailableOnlyForNormalManualModeError(),
  NotPlayersTurnToPickPairError: () => new NotPlayersTurnToPickPairError(),
  WordCannotBeEmptyError: () => new WordCannotBeEmptyError(),
  WordMustBeSubmittedBeforeConfirmationError: () =>
    new WordMustBeSubmittedBeforeConfirmationError(),
  WordMustBeConfirmedBeforeClueSubmissionError: () =>
    new WordMustBeConfirmedBeforeClueSubmissionError(),
  WordMustBeConfirmedBeforeFinalizationError: () =>
    new WordMustBeConfirmedBeforeFinalizationError(),
  NotAllPlayersConfirmedWordsError: () =>
    new NotAllPlayersConfirmedWordsError(),
  GameConfigurationMissingError: () => new GameConfigurationMissingError(),
  PendingVoteMustBeResolvedFirstError: () =>
    new PendingVoteMustBeResolvedFirstError(),
  QuestionTextRequiredInOnlineModeError: () =>
    new QuestionTextRequiredInOnlineModeError(),
  NotPlayersTurnError: () => new NotPlayersTurnError(),
  ReverseModeTargetMissingError: () => new ReverseModeTargetMissingError(),
  NoPendingVoteError: () => new NoPendingVoteError(),
  PlayerNotAllowedToVoteError: () => new PlayerNotAllowedToVoteError(),
  ReverseVoteTargetMissingError: () => new ReverseVoteTargetMissingError(),
  NoActivePlayersLeftError: () => new NoActivePlayersLeftError(),
  UnableToResolveCurrentAskerError: () =>
    new UnableToResolveCurrentAskerError(),
  ReverseModeAskerMissingError: () => new ReverseModeAskerMissingError(),
  WordActionsNotAvailableInCurrentStageError: () =>
    new WordActionsNotAvailableInCurrentStageError(),
  ExpectedStageMismatchError: () =>
    new ExpectedStageMismatchError({
      expectedStage: "IN_PROGRESS",
      actualStage: "LOBBY_OPEN",
    }),
  PlayerNotFoundError: () => new PlayerNotFoundError(),
  WordEntryForPlayerMissingError: () => new WordEntryForPlayerMissingError(),
  NeedAtLeastTwoPlayersForPairingsError: () =>
    new NeedAtLeastTwoPlayersForPairingsError(),
  UnknownPlayerInManualPairingError: () =>
    new UnknownPlayerInManualPairingError(),
  PlayerCannotPairWithSelfError: () => new PlayerCannotPairWithSelfError(),
  PlayerHasAlreadySelectedAPairError: () =>
    new PlayerHasAlreadySelectedAPairError(),
  SelectedTargetIsAlreadyTakenError: () =>
    new SelectedTargetIsAlreadyTakenError(),
} as const;

export type DomainAppError = ReturnType<
  (typeof DOMAIN_ERROR_FACTORIES)[keyof typeof DOMAIN_ERROR_FACTORIES]
>;

export type InfrastructureAppError =
  | MissingBotTokenError
  | DatabaseOpenError
  | TelegramApiError
  | CommandSyncError
  | StartupTaskError
  | WebhookHandlingError;

export type AppError = DomainAppError | InfrastructureAppError;



