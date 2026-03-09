import { GameMode, PairingMode, PlayMode } from "../../domain/types";

export interface ConfigDraft {
  mode?: GameMode;
  playMode?: PlayMode;
  pairingMode?: PairingMode;
}

export class ConfigDraftStore {
  private readonly drafts = new Map<string, ConfigDraft>();

  get(gameId: string): ConfigDraft {
    return this.drafts.get(gameId) ?? {};
  }

  set(gameId: string, draft: ConfigDraft): void {
    this.drafts.set(gameId, draft);
  }

  delete(gameId: string): void {
    this.drafts.delete(gameId);
  }
}
