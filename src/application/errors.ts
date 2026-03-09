import type {
  ActiveGameAlreadyExistsInChatError,
  ActiveGameNotFoundByChatError,
  AskQuestionError,
  CastVoteError,
  CloseLobbyError,
  CommandSyncAppError,
  ConfigureGameError,
  DomainAppError,
  FinalizeWordError,
  GameConfigurationNotSetError,
  GameNotFoundError,
  GiveUpError,
  JoinGameError,
  ManualPairPayloadError,
  MarkDmError,
  NotificationError,
  OnlyGameCreatorCanCancelError,
  PlayerNotFoundInGameError,
  SelectManualPairError,
  StartGameIfReadyError,
  StartupAppError,
  SubmitClueError,
  SubmitWordError,
  ConfirmWordError,
  UnknownGameModeError,
  WebhookAppError,
} from "../domain/errors";

export type GameServiceContextError =
  | ActiveGameNotFoundByChatError
  | GameNotFoundError
  | PlayerNotFoundInGameError;

export type StartQuestionError = GameNotFoundError | AskQuestionError | NotificationError;

export type VoteHandlingError =
  | GameNotFoundError
  | PlayerNotFoundInGameError
  | CastVoteError
  | NotificationError;

export type GiveUpHandlingError =
  | GameNotFoundError
  | PlayerNotFoundInGameError
  | GiveUpError
  | NotificationError;

export type ModeServiceError = StartQuestionError | VoteHandlingError | GiveUpHandlingError;

export type ReadyStartError = GameNotFoundError | StartGameIfReadyError | NotificationError;

export type PromptWordCollectionError = GameNotFoundError | MarkDmError | NotificationError;

export type WordPreparationStageError =
  | GameNotFoundError
  | PlayerNotFoundInGameError
  | SubmitWordError
  | ConfirmWordError
  | SubmitClueError
  | FinalizeWordError
  | PromptWordCollectionError
  | ReadyStartError
  | NotificationError;

export type NormalPairingStageError =
  | GameNotFoundError
  | PlayerNotFoundInGameError
  | SelectManualPairError
  | WordPreparationStageError
  | NotificationError;

export type ConfigurationStageError =
  | GameNotFoundError
  | PlayerNotFoundInGameError
  | ConfigureGameError
  | NormalPairingStageError
  | WordPreparationStageError
  | NotificationError;

export type GameServiceError =
  | ActiveGameAlreadyExistsInChatError
  | GameServiceContextError
  | JoinGameError
  | CloseLobbyError
  | MarkDmError
  | OnlyGameCreatorCanCancelError
  | GameConfigurationNotSetError
  | UnknownGameModeError
  | ConfigurationStageError
  | NormalPairingStageError
  | WordPreparationStageError
  | ModeServiceError
  | NotificationError;

export type RecoveryStartupError = NormalPairingStageError;
export type TelegramHandlerError = GameServiceError | ManualPairPayloadError;
export type AppBoundaryError = StartupAppError | WebhookAppError;
export type KnownAppError = DomainAppError | GameServiceError | CommandSyncAppError;
