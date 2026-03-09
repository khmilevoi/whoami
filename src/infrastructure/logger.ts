import { LoggerPort } from "../application/ports";

const print = (level: string, event: string, payload?: Record<string, unknown>): void => {
  const row = {
    level,
    event,
    payload: payload ?? {},
    ts: new Date().toISOString(),
  };
  console.log(JSON.stringify(row));
};

export class ConsoleLogger implements LoggerPort {
  info(event: string, payload?: Record<string, unknown>): void {
    print("info", event, payload);
  }

  warn(event: string, payload?: Record<string, unknown>): void {
    print("warn", event, payload);
  }

  error(event: string, payload?: Record<string, unknown>): void {
    print("error", event, payload);
  }
}
