# whoami-bot

Telegram bot for "Кто я?" game.

## Stack

- Node.js + TypeScript
- grammy
- express
- awilix
- SQLite (better-sqlite3)

## Setup

1. Install Node.js 20+.
2. Copy `.env.example` to `.env` and fill values.
3. Install dependencies: `pnpm install`.
4. If `better-sqlite3` bindings are missing, run:

- `pnpm approve-builds`
- `pnpm rebuild better-sqlite3`

5. Run type checks: `pnpm typecheck`.
6. Start in dev mode: `pnpm dev`.

## Build and Run

- `pnpm build` - build the app with `tsdown` into `dist/index.mjs`
- `pnpm start` - build first, then run `node --enable-source-maps dist/index.mjs`
- `pnpm dev` - watch sources with `tsdown` and restart the Node process from `dist/index.mjs`

## Notes on Runtime Dependencies

- `tsdown` does not bundle `node_modules` in this setup.
- `better-sqlite3` must remain installed on the runtime machine.
- If native bindings are missing, `pnpm approve-builds` and `pnpm rebuild better-sqlite3` are still the recovery path.

## Commands

- `/whoami_start` - create game in group
- `/join` - join lobby
- `/whoami_config` - close lobby and start config (creator)
- `/whoami_cancel` - cancel game (creator)
- `/giveup` - give up during active phase
- `/ask` - start offline poll on your turn

## HTTP

- `GET /health`
- `POST /telegram/webhook`

## ONLINE Mode Requirement

- Online mode requires disabled Telegram Group Privacy (`can_read_all_group_messages = true`).
- Disable it in @BotFather: `/mybots` -> your bot -> `Bot Settings` -> `Group Privacy` -> `Turn off`.
- If this setting is enabled (or cannot be verified), ONLINE selection is blocked and OFFLINE remains available.

## Notes

- Only one active game per group chat is allowed.
- Game state and history are saved in SQLite.
- Sensitive steps (word input) run via bot private chat.
- Group chats always show `/whoami_start` as default command, even before first game.
