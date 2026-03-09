import { ClockPort } from "../application/ports";

export class SystemClock implements ClockPort {
  nowIso(): string {
    return new Date().toISOString();
  }
}
