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
5. Start in dev mode: `pnpm dev`.

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

## Notes

- Only one active game per group chat is allowed.
- Game state and history are saved in SQLite.
- Sensitive steps (word input) run via bot private chat.
- Group chats always show `/whoami_start` as default command, even before first game.

