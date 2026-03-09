import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GameRepository } from "../../src/application/ports";
import { GameEngine } from "../../src/domain/game-engine";
import { GameState } from "../../src/domain/types";
import { createDatabase } from "../../src/infrastructure/sqlite/db";
import { SqliteGameRepository } from "../../src/infrastructure/sqlite/game-repository";
import { FakeGameRepository } from "../mocks";

type RepoFactory = () => { repo: GameRepository; close: () => void };

const engine = new GameEngine();

const createGame = (gameId: string, chatId: string, now: string, creatorId = "1"): GameState =>
  engine.createGame({
    gameId,
    chatId,
    now,
    creator: {
      id: `tg:${creatorId}`,
      telegramUserId: creatorId,
      username: `user${creatorId}`,
      displayName: `User ${creatorId}`,
    },
  });

const canUseBetterSqlite = (): boolean => {
  try {
    const db = createDatabase(":memory:");
    db.close();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return !message.includes("Could not locate the bindings file");
  }
};

const defineRepositoryContract = (factory: RepoFactory): void => {
  let repo: GameRepository;
  let close: () => void;

  beforeEach(() => {
    const built = factory();
    repo = built.repo;
    close = built.close;
  });

  afterEach(() => {
    close();
  });

  it("saves and updates game snapshots", () => {
    const original = createGame("g-save", "chat-save", "2026-01-01T00:00:00.000Z");
    repo.create(original);

    const updated: GameState = {
      ...original,
      stage: "CONFIGURING",
      updatedAt: "2026-01-01T00:10:00.000Z",
    };

    repo.update(updated);

    const stored = repo.findById("g-save");
    expect(stored).not.toBeNull();
    expect(stored?.stage).toBe("CONFIGURING");
    expect(stored?.updatedAt).toBe("2026-01-01T00:10:00.000Z");
  });

  it("returns only active games", () => {
    const active = createGame("g-active", "chat-active", "2026-01-01T00:00:00.000Z", "1");
    const canceled = createGame("g-canceled", "chat-canceled", "2026-01-01T00:01:00.000Z", "2");
    const finished = createGame("g-finished", "chat-finished", "2026-01-01T00:02:00.000Z", "3");

    canceled.stage = "CANCELED";
    canceled.updatedAt = "2026-01-01T00:11:00.000Z";
    canceled.canceledReason = "test";

    finished.stage = "FINISHED";
    finished.updatedAt = "2026-01-01T00:12:00.000Z";

    repo.create(active);
    repo.create(canceled);
    repo.create(finished);

    const listed = repo.listActiveGames();
    expect(listed.map((game) => game.id)).toEqual(["g-active"]);

    expect(repo.findActiveByChatId("chat-canceled")).toBeNull();
    expect(repo.findActiveByChatId("chat-finished")).toBeNull();
    expect(repo.findActiveByChatId("chat-active")?.id).toBe("g-active");
  });

  it("enforces one active game per chat", () => {
    const first = createGame("g-1", "chat-1", "2026-01-01T00:00:00.000Z", "1");
    const second = createGame("g-2", "chat-1", "2026-01-01T00:01:00.000Z", "2");

    repo.create(first);
    expect(() => repo.create(second)).toThrowError();
  });

  it("orders active list by updatedAt and returns active game for chat with history", () => {
    const archived = createGame("g-archived", "chat-order", "2026-01-01T00:00:00.000Z", "1");
    archived.stage = "CANCELED";
    archived.updatedAt = "2026-01-01T00:30:00.000Z";

    const activeOlder = createGame("g-older", "chat-order", "2026-01-01T00:10:00.000Z", "2");
    activeOlder.updatedAt = "2026-01-01T00:10:00.000Z";

    const activeNewer = createGame("g-newer", "chat-other", "2026-01-01T00:20:00.000Z", "3");
    activeNewer.updatedAt = "2026-01-01T00:20:00.000Z";

    repo.create(archived);
    repo.create(activeOlder);
    repo.create(activeNewer);

    const listed = repo.listActiveGames();
    expect(listed.map((game) => game.id)).toEqual(["g-newer", "g-older"]);

    const activeForChat = repo.findActiveByChatId("chat-order");
    expect(activeForChat?.id).toBe("g-older");
  });
};

describe("game repository contract: fake", () => {
  defineRepositoryContract(() => ({
    repo: new FakeGameRepository(),
    close: () => {
      // no-op
    },
  }));
});

const describeIfSqliteReady = canUseBetterSqlite() ? describe : describe.skip;

describeIfSqliteReady("game repository contract: sqlite", () => {
  defineRepositoryContract(() => {
    const db = createDatabase(":memory:");
    return {
      repo: new SqliteGameRepository(db),
      close: () => db.close(),
    };
  });
});
