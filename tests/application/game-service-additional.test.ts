import { describe, expect, it } from "vitest";
import { ActiveGameNotFoundByChatError } from "../../src/domain/errors.js";
import { createGameServiceHarness } from "./game-service.harness.js";

describe("game service additional state flows", () => {
  it("sends a no-active-games private message when private start has no matching games", async () => {
    const harness = createGameServiceHarness();
    const actor = harness.createActor(1);

    await harness.service.handlePrivateStart(actor);

    expect(harness.repository.listActiveGames()).toEqual([]);
    expect(harness.notifier.sent).toEqual([
      expect.objectContaining({
        kind: "private-message",
        userId: actor.telegramUserId,
        text: harness.texts.forLocale("ru").noActiveGamesForUser(),
      }),
    ]);
  });

  it("persists an explicit locale across all active games and later actor refreshes", async () => {
    const harness = createGameServiceHarness();
    const sharedActor = {
      telegramUserId: "1",
      username: "user1",
      firstName: "Alice",
      languageCode: "ru",
    };

    const gameOne = await harness.setupConfiguredGame({
      chatId: "chat-locale-1",
      actors: [sharedActor, harness.createActor(2), harness.createActor(3)],
      mode: "REVERSE",
      playMode: "ONLINE",
    });
    const gameTwo = await harness.setupConfiguredGame({
      chatId: "chat-locale-2",
      actors: [sharedActor, harness.createActor(4), harness.createActor(5)],
      mode: "NORMAL",
      playMode: "OFFLINE",
      pairingMode: "RANDOM",
    });

    await harness.service.setUserLocalePreference(sharedActor, "en");

    expect(
      harness.getPlayerByTelegram(gameOne.id, sharedActor.telegramUserId),
    ).toMatchObject({ locale: "en", localeSource: "explicit" });
    expect(
      harness.getPlayerByTelegram(gameTwo.id, sharedActor.telegramUserId),
    ).toMatchObject({ locale: "en", localeSource: "explicit" });
    expect(
      harness.repository.findPlayerProfileByTelegramUserId(sharedActor.telegramUserId),
    ).toMatchObject({ locale: "en", localeSource: "explicit" });

    await harness.service.handlePrivateStart({
      ...sharedActor,
      languageCode: "ru",
      firstName: "Alicia",
    });

    expect(
      harness.getPlayerByTelegram(gameOne.id, sharedActor.telegramUserId),
    ).toMatchObject({
      displayName: "Alicia",
      locale: "en",
      localeSource: "explicit",
      dmOpened: true,
    });
    expect(
      harness.getPlayerByTelegram(gameTwo.id, sharedActor.telegramUserId),
    ).toMatchObject({
      displayName: "Alicia",
      locale: "en",
      localeSource: "explicit",
      dmOpened: true,
    });
  });

  it("keeps repository state unchanged when joining a missing active game by chat", async () => {
    const harness = createGameServiceHarness();
    const actor = harness.createActor(1);

    await expect(harness.service.joinGame("missing-chat", actor)).resolves.toBeInstanceOf(
      ActiveGameNotFoundByChatError,
    );
    expect(harness.repository.listActiveGames()).toEqual([]);
  });
});

it("falls back to the text service default locale when identity resolution omits locale data", async () => {
  const harness = createGameServiceHarness();
  harness.identity.toPlayerIdentity = ({ telegramUserId, username, firstName, lastName }) => ({
    id: `tg:${telegramUserId}`,
    telegramUserId,
    username,
    displayName: [firstName, lastName].filter(Boolean).join(" ").trim() || telegramUserId,
    locale: undefined,
    localeSource: undefined,
  });

  await harness.service.handlePrivateStart({
    telegramUserId: "42",
    firstName: "NoLocale",
  });

  expect(harness.notifier.sent).toEqual([
    expect.objectContaining({
      kind: "private-message",
      userId: "42",
      text: harness.texts.forLocale(harness.texts.locale).noActiveGamesForUser(),
    }),
  ]);
  expect(harness.repository.findPlayerProfileByTelegramUserId("42")).toMatchObject({
    locale: harness.texts.locale,
    localeSource: "telegram",
  });
});

it("refreshes usernames across active games without overwriting explicit locale preferences", async () => {
  const harness = createGameServiceHarness();
  const sharedActor = {
    telegramUserId: "7",
    username: "user7",
    firstName: "Alice",
    languageCode: "ru",
  };

  const gameOne = await harness.setupConfiguredGame({
    chatId: "chat-username-1",
    actors: [sharedActor, harness.createActor(2), harness.createActor(3)],
    mode: "REVERSE",
    playMode: "ONLINE",
  });
  const gameTwo = await harness.setupConfiguredGame({
    chatId: "chat-username-2",
    actors: [sharedActor, harness.createActor(4), harness.createActor(5)],
    mode: "NORMAL",
    playMode: "OFFLINE",
    pairingMode: "RANDOM",
  });

  await harness.service.setUserLocalePreference(sharedActor, "en");
  await harness.service.handlePrivateStart({
    ...sharedActor,
    username: "renamed7",
    firstName: "Alicia",
  });

  expect(harness.getPlayerByTelegram(gameOne.id, sharedActor.telegramUserId)).toMatchObject({
    username: "renamed7",
    displayName: "Alicia",
    locale: "en",
    localeSource: "explicit",
  });
  expect(harness.getPlayerByTelegram(gameTwo.id, sharedActor.telegramUserId)).toMatchObject({
    username: "renamed7",
    displayName: "Alicia",
    locale: "en",
    localeSource: "explicit",
  });
});
