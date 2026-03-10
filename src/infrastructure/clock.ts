import { ClockPort } from "../application/ports.js";

export class SystemClock implements ClockPort {
  nowIso(): string {
    return new Date().toISOString();
  }
}
