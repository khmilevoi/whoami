import { describe, expect, it } from "vitest";
import { createBotCommands } from "../../src/application/bot-commands";
import { TextService } from "../../src/application/text-service";
import { DomainErrorCode } from "../../src/domain/errors";

const texts = new TextService("ru");

const allErrorCodes = [
  "INVALID_MANUAL_PAIR_PAYLOAD",
  "ACTIVE_GAME_NOT_FOUND_BY_CHAT",
  "GAME_NOT_FOUND",
  "PLAYER_NOT_FOUND_IN_GAME",
  "ACTIVE_GAME_ALREADY_EXISTS_IN_CHAT",
  "GAME_CONFIGURATION_NOT_SET",
  "ONLY_GAME_CREATOR_CAN_CANCEL",
  "UNKNOWN_GAME_MODE",
  "ONLY_GAME_CREATOR_CAN_CONFIGURE",
  "JOIN_ALLOWED_ONLY_WHEN_LOBBY_OPEN",
  "MAX_PLAYERS_REACHED",
  "LOBBY_ALREADY_CLOSED",
  "ONLY_GAME_CREATOR_CAN_CLOSE_LOBBY",
  "MIN_PLAYERS_REQUIRED_TO_START",
  "GAME_CAN_BE_CONFIGURED_ONLY_AFTER_LOBBY_CLOSED",
  "PAIRING_MODE_REQUIRED_FOR_NORMAL_MODE",
  "MANUAL_PAIRING_AVAILABLE_ONLY_FOR_NORMAL_MANUAL_MODE",
  "NOT_PLAYERS_TURN_TO_PICK_PAIR",
  "WORD_CANNOT_BE_EMPTY",
  "WORD_MUST_BE_SUBMITTED_BEFORE_CONFIRMATION",
  "WORD_MUST_BE_CONFIRMED_BEFORE_CLUE_SUBMISSION",
  "WORD_MUST_BE_CONFIRMED_BEFORE_FINALIZATION",
  "NOT_ALL_PLAYERS_CONFIRMED_WORDS",
  "GAME_CONFIGURATION_MISSING",
  "PENDING_VOTE_MUST_BE_RESOLVED_FIRST",
  "QUESTION_TEXT_REQUIRED_IN_ONLINE_MODE",
  "NOT_PLAYERS_TURN",
  "REVERSE_MODE_TARGET_MISSING",
  "NO_PENDING_VOTE",
  "PLAYER_NOT_ALLOWED_TO_VOTE",
  "REVERSE_VOTE_TARGET_MISSING",
  "NO_ACTIVE_PLAYERS_LEFT",
  "UNABLE_TO_RESOLVE_CURRENT_ASKER",
  "REVERSE_MODE_ASKER_MISSING",
  "WORD_ACTIONS_NOT_AVAILABLE_IN_CURRENT_STAGE",
  "EXPECTED_STAGE_MISMATCH",
  "PLAYER_NOT_FOUND",
  "WORD_ENTRY_FOR_PLAYER_MISSING",
  "NEED_AT_LEAST_TWO_PLAYERS_FOR_PAIRINGS",
  "UNKNOWN_PLAYER_IN_MANUAL_PAIRING",
  "PLAYER_CANNOT_PAIR_WITH_SELF",
  "PLAYER_HAS_ALREADY_SELECTED_A_PAIR",
  "SELECTED_TARGET_IS_ALREADY_TAKEN",
] as const satisfies readonly DomainErrorCode[];

describe("text service", () => {
  it("renders command descriptions through the command catalog", () => {
    const commands = createBotCommands(texts);

    expect(commands.BOT_COMMANDS.START_PRIVATE.description).toBe("Открыть личный чат с ботом");
    expect(commands.BOT_COMMANDS.START_GAME.description).toBe("Создать новую игру");
    expect(commands.BOT_COMMANDS.ASK.description).toBe("Запустить опрос (оффлайн)");
  });

  it("renders representative runtime messages", () => {
    expect(texts.configSaved({ mode: "NORMAL", playMode: "OFFLINE", pairingMode: "MANUAL" })).toBe(
      "Конфигурация сохранена: обычный, оффлайн, пары: ручной.",
    );
    expect(texts.manualPairPrompt()).toBe("Выберите игрока, которому загадываете слово:");
    expect(texts.voteSummary("GUESSED")).toBe("Итог голосования: Угадал.");
  });

  it("renders every domain error code", () => {
    const rendered = allErrorCodes.map((code) => {
      switch (code) {
        case "UNKNOWN_GAME_MODE":
          return texts.renderError({ code, params: { mode: "BROKEN" } });
        case "MAX_PLAYERS_REACHED":
          return texts.renderError({ code, params: { maxPlayers: 7 } });
        case "MIN_PLAYERS_REQUIRED_TO_START":
          return texts.renderError({ code, params: { minPlayers: 3 } });
        case "EXPECTED_STAGE_MISMATCH":
          return texts.renderError({ code, params: { expectedStage: "IN_PROGRESS", actualStage: "LOBBY_OPEN" } });
        default:
          return texts.renderError({ code });
      }
    });

    expect(rendered).toHaveLength(allErrorCodes.length);
    expect(rendered.every((message) => message.length > 0)).toBe(true);
  });
});

