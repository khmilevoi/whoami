import { LoggerPort } from "../../src/application/ports.js";

export interface LoggedEvent {
  level: "info" | "warn" | "error";
  event: string;
  payload?: Record<string, unknown>;
}

export class FakeLogger implements LoggerPort {
  readonly events: LoggedEvent[] = [];

  info(event: string, payload?: Record<string, unknown>): void {
    this.events.push({ level: "info", event, payload });
  }

  warn(event: string, payload?: Record<string, unknown>): void {
    this.events.push({ level: "warn", event, payload });
  }

  error(event: string, payload?: Record<string, unknown>): void {
    this.events.push({ level: "error", event, payload });
  }
}
