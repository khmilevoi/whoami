import { ClockPort } from "../../src/application/ports";

export class FakeClock implements ClockPort {
  private currentMs: number;

  constructor(startIso = "2026-01-01T00:00:00.000Z", private readonly stepMs = 1000) {
    this.currentMs = Date.parse(startIso);
  }

  nowIso(): string {
    const iso = new Date(this.currentMs).toISOString();
    this.currentMs += this.stepMs;
    return iso;
  }

  advanceMs(ms: number): void {
    this.currentMs += ms;
  }

  setNow(iso: string): void {
    this.currentMs = Date.parse(iso);
  }
}
