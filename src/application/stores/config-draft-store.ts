import { GameMode, PairingMode, PlayMode } from "../../domain/types.js";

export type ConfigDraftStep =
  | "MODE"
  | "PLAY_MODE"
  | "PAIRING_MODE"
  | "CONFIRM";

export interface ConfigDraft {
  step?: ConfigDraftStep;
  mode?: GameMode;
  playMode?: PlayMode;
  pairingMode?: PairingMode;
  awaitingConfirmation?: boolean;
}

export class ConfigDraftStore {
  private readonly drafts = new Map<string, ConfigDraft>();

  get(gameId: string): ConfigDraft {
    return this.drafts.get(gameId) ?? { step: "MODE", awaitingConfirmation: false };
  }

  set(gameId: string, draft: ConfigDraft): void {
    this.drafts.set(gameId, draft);
  }

  delete(gameId: string): void {
    this.drafts.delete(gameId);
  }
}
