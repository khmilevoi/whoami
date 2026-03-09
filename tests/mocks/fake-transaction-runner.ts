import { TransactionRunner } from "../../src/application/ports";

export class FakeTransactionRunner implements TransactionRunner {
  runs = 0;
  nextError: Error | null = null;

  runInTransaction<T>(work: () => T): T {
    this.runs += 1;

    if (this.nextError) {
      const error = this.nextError;
      this.nextError = null;
      throw error;
    }

    return work();
  }
}
