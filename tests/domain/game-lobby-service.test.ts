import { describe, expect, it } from "vitest";
import {
  LobbyAlreadyClosedError,
  MinPlayersRequiredToStartError,
} from "../../src/domain/errors.js";
import { GameLobbyService } from "../../src/domain/game-lobby/game-lobby-service.js";
import { GameStateAccessService } from "../../src/domain/game-state-access/game-state-access-service.js";
import { createGameState } from "./service-test-helpers.js";

describe("game lobby service", () => {
  it("keeps an explicit locale while refreshing the existing player identity", () => {
    const service = new GameLobbyService(new GameStateAccessService());
    const game = createGameState();
    const existing = game.players[0]!;
    existing.locale = "en";
    existing.localeSource = "explicit";

    service.joinGame(
      game,
      {
        id: existing.id,
        telegramUserId: existing.telegramUserId,
        username: "renamed-user",
        displayName: "Renamed Player",
        locale: "ru",
        localeSource: "telegram",
      },
      { minPlayers: 2, maxPlayers: 5 },
      "2026-01-01T00:01:00.000Z",
    );

    expect(game.players[0]).toMatchObject({
      username: "renamed-user",
      displayName: "Renamed Player",
      locale: "en",
      localeSource: "explicit",
    });
  });

  it("fills legacy locale defaults when an old player record has no locale fields", () => {
    const service = new GameLobbyService(new GameStateAccessService());
    const game = createGameState();
    const existing = game.players[1]!;
    delete existing.locale;
    delete existing.localeSource;

    service.joinGame(
      game,
      {
        id: existing.id,
        telegramUserId: existing.telegramUserId,
        username: existing.username,
        displayName: existing.displayName,
      },
      { minPlayers: 2, maxPlayers: 5 },
      "2026-01-01T00:01:00.000Z",
    );

    expect(game.players[1]).toMatchObject({
      locale: "ru",
      localeSource: "telegram",
    });
  });

  it("reopens a blocked dm panel by marking the player as joined and opened", () => {
    const service = new GameLobbyService(new GameStateAccessService());
    const game = createGameState();
    game.players[0]!.stage = "BLOCKED_DM";

    service.markDmOpened(game, game.players[0]!.id, "2026-01-01T00:01:00.000Z");

    expect(game.players[0]).toMatchObject({ stage: "JOINED", dmOpened: true });
  });

  it("does not overwrite terminal stages when dm delivery is blocked", () => {
    const service = new GameLobbyService(new GameStateAccessService());
    const stages = ["READY", "GUESSED", "GAVE_UP"] as const;

    for (const [index, stage] of stages.entries()) {
      const game = createGameState();
      game.players[0]!.stage = stage;

      service.markDmBlocked(game, game.players[0]!.id, `2026-01-01T00:0${index}:00.000Z`);

      expect(game.players[0]!.stage).toBe(stage);
    }
  });

  it("returns close-lobby errors for the wrong stage and too few players", () => {
    const service = new GameLobbyService(new GameStateAccessService());
    const configured = createGameState({ stage: "CONFIGURING" });
    const wrongStage = service.closeLobby(
      configured,
      configured.creatorPlayerId,
      { minPlayers: 2, maxPlayers: 5 },
      "2026-01-01T00:01:00.000Z",
    );

    expect(wrongStage).toBeInstanceOf(LobbyAlreadyClosedError);

    const tooSmall = createGameState({ playerCount: 2, stage: "LOBBY_OPEN" });
    tooSmall.players.pop();
    delete tooSmall.progress["tg:2"];
    const minPlayersError = service.closeLobby(
      tooSmall,
      tooSmall.creatorPlayerId,
      { minPlayers: 2, maxPlayers: 5 },
      "2026-01-01T00:02:00.000Z",
    );

    expect(minPlayersError).toBeInstanceOf(MinPlayersRequiredToStartError);
    expect(tooSmall.stage).toBe("LOBBY_OPEN");
  });
});
