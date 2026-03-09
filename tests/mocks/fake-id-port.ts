import { IdPort } from "../../src/application/ports";

export class FakeIdPort implements IdPort {
  private counter = 1;

  constructor(
    private readonly queuedIds: string[] = [],
    private readonly prefix = "id",
  ) {}

  nextId(): string {
    const queued = this.queuedIds.shift();
    if (queued) {
      return queued;
    }

    const next = `${this.prefix}-${this.counter}`;
    this.counter += 1;
    return next;
  }
}
