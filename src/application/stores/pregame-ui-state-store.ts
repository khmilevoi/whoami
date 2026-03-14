export interface PregameUiPanelState {
  chatId: string;
  messageId: number;
  renderKey?: string;
}

export interface PregameUiGameState {
  groupStatusMessageId?: number;
  groupRenderKey?: string;
  privatePanels: Record<string, PregameUiPanelState>;
}

export class PregameUiStateStore {
  private readonly states = new Map<string, PregameUiGameState>();

  get(gameId: string): PregameUiGameState {
    return this.states.get(gameId) ?? { privatePanels: {} };
  }

  set(gameId: string, state: PregameUiGameState): void {
    this.states.set(gameId, state);
  }

  delete(gameId: string): void {
    this.states.delete(gameId);
  }
}
