import { describe, expect, it } from "vitest";
import {
  advancePregameConfigWizardState,
  createPregameConfigWizardState,
} from "../../../src/adapters/telegram/pregame-config-conversation.js";

describe("pregame config conversation helpers", () => {
  it("advances deterministically through NORMAL mode flow", () => {
    const initial = createPregameConfigWizardState({});
    const modeSelected = advancePregameConfigWizardState(initial, {
      type: "mode",
      value: "NORMAL",
    });
    const playSelected = advancePregameConfigWizardState(modeSelected, {
      type: "play",
      value: "ONLINE",
    });
    const pairingSelected = advancePregameConfigWizardState(playSelected, {
      type: "pair",
      value: "MANUAL",
    });

    expect(initial).toEqual({
      step: "MODE",
      awaitingConfirmation: false,
    });
    expect(modeSelected).toEqual({
      step: "PLAY_MODE",
      mode: "NORMAL",
      awaitingConfirmation: false,
    });
    expect(playSelected).toEqual({
      step: "PAIRING_MODE",
      mode: "NORMAL",
      playMode: "ONLINE",
      awaitingConfirmation: false,
    });
    expect(pairingSelected).toEqual({
      step: "CONFIRM",
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "MANUAL",
      awaitingConfirmation: true,
    });
  });

  it("skips pairing for REVERSE mode", () => {
    const initial = createPregameConfigWizardState({});
    const modeSelected = advancePregameConfigWizardState(initial, {
      type: "mode",
      value: "REVERSE",
    });
    const playSelected = advancePregameConfigWizardState(modeSelected, {
      type: "play",
      value: "OFFLINE",
    });

    expect(playSelected).toEqual({
      step: "CONFIRM",
      mode: "REVERSE",
      playMode: "OFFLINE",
      awaitingConfirmation: true,
    });
  });

  it("restarts back to the initial state", () => {
    const current = createPregameConfigWizardState({
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
    });

    expect(
      advancePregameConfigWizardState(current, { type: "restart" }),
    ).toEqual({
      step: "MODE",
      awaitingConfirmation: false,
    });
  });

  it("reconstructs local wizard state from a persisted draft", () => {
    expect(
      createPregameConfigWizardState({
        mode: "NORMAL",
        playMode: "OFFLINE",
      }),
    ).toEqual({
      step: "PAIRING_MODE",
      mode: "NORMAL",
      playMode: "OFFLINE",
      awaitingConfirmation: false,
    });

    expect(
      createPregameConfigWizardState({
        mode: "REVERSE",
        playMode: "ONLINE",
      }),
    ).toEqual({
      step: "CONFIRM",
      mode: "REVERSE",
      playMode: "ONLINE",
      pairingMode: undefined,
      awaitingConfirmation: true,
    });
  });
});
