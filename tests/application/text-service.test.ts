import { describe, expect, it } from "vitest";
import { createBotCommands } from "../../src/application/bot-commands.js";
import { TextService } from "../../src/application/text-service.js";
import { DOMAIN_ERROR_FACTORIES } from "../../src/domain/errors.js";

const texts = new TextService("ru");
const englishTexts = texts.forLocale("en");

describe("text service", () => {
  it("renders command descriptions through the command catalog", () => {
    const commands = createBotCommands(texts);

    expect(commands.BOT_COMMANDS.START_PRIVATE.description).toBe(
      "Открыть личный чат с ботом",
    );
    expect(commands.BOT_COMMANDS.START_GAME.description).toBe(
      "Создать новую игру",
    );
    expect(commands.BOT_COMMANDS.GIVEUP.description).toBe("Сдаться");
    expect(commands.BOT_COMMANDS.LANGUAGE.description).toBe("Сменить язык");
  });

  it("renders representative runtime messages in russian", () => {
    expect(
      texts.configSaved({
        mode: "NORMAL",
        playMode: "OFFLINE",
        pairingMode: "MANUAL",
      }),
    ).toBe("Конфигурация сохранена: обычный, оффлайн, пары: ручной.");
    expect(texts.manualPairPrompt()).toBe(
      "Выберите игрока, которому загадываете слово:",
    );
    expect(texts.voteSummary("GUESSED")).toBe("Итог голосования: Угадал.");
    expect(texts.openMainChatButton()).toBe("🎮 Перейти в основной чат");
    expect(texts.finalWordAssignments(["- Alice -> Bob: moon"])).toBe(
      "Загаданные слова:\n- Alice -> Bob: moon",
    );
  });

  it("renders english locale through the same facade", () => {
    expect(englishTexts.commandLanguageDescription()).toBe("Change language");
    expect(englishTexts.voteSummary("NO")).toBe("Vote result: No.");
    expect(englishTexts.openMainChatButton()).toBe("🎮 Open main chat");
    expect(englishTexts.finalWordAssignments(["- Alice: moon"])).toBe(
      "Assigned words:\n- Alice: moon",
    );
  });

  it("renders every domain error class", () => {
    const rendered = Object.values(DOMAIN_ERROR_FACTORIES).map((factory) =>
      texts.renderError(factory()),
    );

    expect(rendered).toHaveLength(Object.keys(DOMAIN_ERROR_FACTORIES).length);
    expect(rendered.every((message) => message.length > 0)).toBe(true);
  });
});

