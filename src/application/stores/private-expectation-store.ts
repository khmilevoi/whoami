export type TextExpectation = "WORD" | "CLUE";

export class PrivateExpectationStore {
  private readonly expectations = new Map<string, TextExpectation>();

  get(gameId: string, playerId: string): TextExpectation | undefined {
    return this.expectations.get(this.key(gameId, playerId));
  }

  set(gameId: string, playerId: string, expectation: TextExpectation): void {
    this.expectations.set(this.key(gameId, playerId), expectation);
  }

  delete(gameId: string, playerId: string): void {
    this.expectations.delete(this.key(gameId, playerId));
  }

  private key(gameId: string, playerId: string): string {
    return `${gameId}:${playerId}`;
  }
}
