export interface DomainErrorParamsMap {
  INVALID_MANUAL_PAIR_PAYLOAD: undefined;
  ACTIVE_GAME_NOT_FOUND_BY_CHAT: undefined;
  GAME_NOT_FOUND: undefined;
  PLAYER_NOT_FOUND_IN_GAME: undefined;
  ACTIVE_GAME_ALREADY_EXISTS_IN_CHAT: undefined;
  GAME_CONFIGURATION_NOT_SET: undefined;
  ONLY_GAME_CREATOR_CAN_CANCEL: undefined;
  UNKNOWN_GAME_MODE: { mode: string };
  ONLY_GAME_CREATOR_CAN_CONFIGURE: undefined;
  JOIN_ALLOWED_ONLY_WHEN_LOBBY_OPEN: undefined;
  MAX_PLAYERS_REACHED: { maxPlayers: number };
  LOBBY_ALREADY_CLOSED: undefined;
  ONLY_GAME_CREATOR_CAN_CLOSE_LOBBY: undefined;
  MIN_PLAYERS_REQUIRED_TO_START: { minPlayers: number };
  GAME_CAN_BE_CONFIGURED_ONLY_AFTER_LOBBY_CLOSED: undefined;
  PAIRING_MODE_REQUIRED_FOR_NORMAL_MODE: undefined;
  MANUAL_PAIRING_AVAILABLE_ONLY_FOR_NORMAL_MANUAL_MODE: undefined;
  NOT_PLAYERS_TURN_TO_PICK_PAIR: undefined;
  WORD_CANNOT_BE_EMPTY: undefined;
  WORD_MUST_BE_SUBMITTED_BEFORE_CONFIRMATION: undefined;
  WORD_MUST_BE_CONFIRMED_BEFORE_CLUE_SUBMISSION: undefined;
  WORD_MUST_BE_CONFIRMED_BEFORE_FINALIZATION: undefined;
  NOT_ALL_PLAYERS_CONFIRMED_WORDS: undefined;
  GAME_CONFIGURATION_MISSING: undefined;
  PENDING_VOTE_MUST_BE_RESOLVED_FIRST: undefined;
  QUESTION_TEXT_REQUIRED_IN_ONLINE_MODE: undefined;
  NOT_PLAYERS_TURN: undefined;
  REVERSE_MODE_TARGET_MISSING: undefined;
  NO_PENDING_VOTE: undefined;
  PLAYER_NOT_ALLOWED_TO_VOTE: undefined;
  REVERSE_VOTE_TARGET_MISSING: undefined;
  NO_ACTIVE_PLAYERS_LEFT: undefined;
  UNABLE_TO_RESOLVE_CURRENT_ASKER: undefined;
  REVERSE_MODE_ASKER_MISSING: undefined;
  WORD_ACTIONS_NOT_AVAILABLE_IN_CURRENT_STAGE: undefined;
  EXPECTED_STAGE_MISMATCH: { expectedStage: string; actualStage: string };
  PLAYER_NOT_FOUND: undefined;
  WORD_ENTRY_FOR_PLAYER_MISSING: undefined;
  NEED_AT_LEAST_TWO_PLAYERS_FOR_PAIRINGS: undefined;
  UNKNOWN_PLAYER_IN_MANUAL_PAIRING: undefined;
  PLAYER_CANNOT_PAIR_WITH_SELF: undefined;
  PLAYER_HAS_ALREADY_SELECTED_A_PAIR: undefined;
  SELECTED_TARGET_IS_ALREADY_TAKEN: undefined;
}

export type DomainErrorCode = keyof DomainErrorParamsMap;

export type DomainErrorPayload = {
  [TCode in DomainErrorCode]: DomainErrorParamsMap[TCode] extends undefined
    ? { code: TCode }
    : { code: TCode; params: DomainErrorParamsMap[TCode] };
}[DomainErrorCode];

export class DomainError extends Error {
  readonly error: DomainErrorPayload;

  constructor(error: DomainErrorPayload) {
    super(error.code);
    this.name = "DomainError";
    this.error = error;
  }

  get code(): DomainErrorCode {
    return this.error.code;
  }

  get params(): DomainErrorParamsMap[DomainErrorCode] | undefined {
    return "params" in this.error ? this.error.params : undefined;
  }
}
