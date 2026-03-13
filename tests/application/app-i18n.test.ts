import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createBaseI18n } from "../../src/application/app-i18n.js";
import { TextService } from "../../src/application/text-service.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const localesDirectory = path.resolve(currentDir, "../../src/locales");

describe("app i18n", () => {
  it("boots against the repository locale files", () => {
    expect(fs.existsSync(path.resolve(localesDirectory, "en.ftl"))).toBe(true);
    expect(fs.existsSync(path.resolve(localesDirectory, "ru.ftl"))).toBe(true);

    const i18n = createBaseI18n();
    expect(i18n.t("en", "command-language-description")).toBe("Change language");

    const texts = new TextService({ locale: "en", i18n });
    expect(texts.commandLanguageDescription()).toBe("Change language");
  });
});
