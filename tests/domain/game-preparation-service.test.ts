import { describe, expect, it } from "vitest";
import {
  GameCanBeConfiguredOnlyAfterLobbyClosedError,
  ManualPairingAvailableOnlyForNormalManualModeError,
  NeedAtLeastTwoPlayersForPairingsError,
  OnlyGameCreatorCanConfigureError,
  PairingModeRequiredForNormalModeError,
} from "../../src/domain/errors.js";
import { GamePreparationService } from "../../src/domain/game-preparation/game-preparation-service.js";
import { GameStateAccessService } from "../../src/domain/game-state-access/game-state-access-service.js";
import { createGameConfig, createGameState } from "./service-test-helpers.js";

describe("game preparation service", () => {
  it("rejects configuration before the lobby is closed", () => {
    const service = new GamePreparationService(new GameStateAccessService());
    const game = createGameState({ stage: "LOBBY_OPEN" });

    expect(
      service.configureGame(
        game,
        {
          actorPlayerId: game.creatorPlayerId,
          mode: "NORMAL",
          playMode: "ONLINE",
          pairingMode: "RANDOM",
        },
        "2026-01-01T00:01:00.000Z",
      ),
    ).toBeInstanceOf(GameCanBeConfiguredOnlyAfterLobbyClosedError);
  });

  it("allows only the creator to configure the game", () => {
    const service = new GamePreparationService(new GameStateAccessService());
    const game = createGameState({ stage: "CONFIGURING" });

    expect(
      service.configureGame(
        game,
        {
          actorPlayerId: game.players[1]!.id,
          mode: "NORMAL",
          playMode: "ONLINE",
          pairingMode: "RANDOM",
        },
        "2026-01-01T00:01:00.000Z",
      ),
    ).toBeInstanceOf(OnlyGameCreatorCanConfigureError);
  });

  it("requires a pairing mode for normal games", () => {
    const service = new GamePreparationService(new GameStateAccessService());
    const game = createGameState({ stage: "CONFIGURING" });

    expect(
      service.configureGame(
        game,
        {
          actorPlayerId: game.creatorPlayerId,
          mode: "NORMAL",
          playMode: "ONLINE",
        },
        "2026-01-01T00:01:00.000Z",
      ),
    ).toBeInstanceOf(PairingModeRequiredForNormalModeError);
  });

  it("surfaces derangement errors for an invalid random-pairing player set", () => {
    const service = new GamePreparationService(new GameStateAccessService());
    const game = createGameState({ playerCount: 1, stage: "CONFIGURING" });

    expect(
      service.configureGame(
        game,
        {
          actorPlayerId: game.creatorPlayerId,
          mode: "NORMAL",
          playMode: "ONLINE",
          pairingMode: "RANDOM",
        },
        "2026-01-01T00:01:00.000Z",
      ),
    ).toBeInstanceOf(NeedAtLeastTwoPlayersForPairingsError);
  });

  it("allows manual pairings only in the normal/manual word-preparation stage", () => {
    const service = new GamePreparationService(new GameStateAccessService());
    const game = createGameState({
      stage: "PREPARE_WORDS",
      config: createGameConfig({ mode: "REVERSE", playMode: "ONLINE" }),
    });

    expect(
      service.selectManualPair(
        game,
        game.players[0]!.id,
        game.players[1]!.id,
        "2026-01-01T00:01:00.000Z",
      ),
    ).toBeInstanceOf(ManualPairingAvailableOnlyForNormalManualModeError);
  });

  it("initializes words only after the final manual pairing choice", () => {
    const service = new GamePreparationService(new GameStateAccessService());
    const game = createGameState({
      stage: "PREPARE_WORDS",
      config: createGameConfig({ mode: "NORMAL", playMode: "ONLINE", pairingMode: "MANUAL" }),
    });
    game.preparation.manualPairingQueue = game.players.map((player) => player.id);

    service.selectManualPair(
      game,
      game.players[0]!.id,
      game.players[1]!.id,
      "2026-01-01T00:01:00.000Z",
    );

    expect(game.pairings).toEqual({ "tg:1": "tg:2" });
    expect(game.words).toEqual({});

    service.selectManualPair(
      game,
      game.players[1]!.id,
      game.players[2]!.id,
      "2026-01-01T00:02:00.000Z",
    );
    service.selectManualPair(
      game,
      game.players[2]!.id,
      game.players[0]!.id,
      "2026-01-01T00:03:00.000Z",
    );

    expect(Object.keys(game.words)).toHaveLength(game.players.length);
    expect(game.words["tg:1"]?.targetPlayerId).toBe("tg:2");
  });
});
