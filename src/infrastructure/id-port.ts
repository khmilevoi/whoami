import { customAlphabet } from "nanoid";
import { IdPort } from "../application/ports";

const nano = customAlphabet("1234567890abcdefghijklmnopqrstuvwxyz", 16);

export class NanoIdPort implements IdPort {
  nextId(): string {
    return nano();
  }
}
