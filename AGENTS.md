## Environment Notes

- Use Node `24.13.0` for this repository.
- Run project commands through `pnpm` by default.
- Do not prepend `C:\Program Files\Microsoft Visual Studio\2022\Community\Msbuild\Microsoft\VisualStudio\NodeJs\` to `PATH` for Node-based commands in this project. That override switches the shell to Node `20.13.1`, which breaks `better-sqlite3` ABI compatibility and test runs.
- Before running Node commands when the environment is unclear, verify with `node -v`.
- If native modules need rebuilding, rebuild them under the active default Node `24.13.0` runtime.

## Command Troubleshooting

- In this Codex shell, `node` and `pnpm` may be missing from `PATH` even when the project is otherwise usable.
- First check `node -v` and `pnpm -v`. If either command is missing, do not assume the shell is using the correct runtime.
- Do not "fix" missing `node`/`pnpm` by prepending the Visual Studio Node path. That shell exposes Node `20.13.1`, which is incompatible with this repo's native-module setup.
- If command execution is blocked by an unclear runtime, prefer resolving access to the proper Node `24.13.0` + `pnpm` environment instead of falling back to ad-hoc `node.exe` paths.
- All project tasks should be run through `pnpm` commands when possible, for example `pnpm test`, `pnpm vitest`, `pnpm tsc`.
- If a direct fallback is absolutely required for diagnosis, document that it was only a temporary workaround and re-check the result later under the proper `pnpm` + Node `24.13.0` environment.
- This environment has also shown tool instability around file patching, so if an automated patch command fails unexpectedly, verify the file contents immediately and use a minimal file rewrite only as a fallback.

## Repository-Specific Notes

- For this repo inside Codex desktop, a reliable Node fallback is `C:\nvm4w\nodejs\node.exe`. Use it only when `node` is missing from `PATH`, and prefer requesting approval once instead of losing time searching unrelated locations.
- `pnpm` may also be absent from `PATH` in this shell. If the normal command is unavailable, first confirm the correct Node runtime, then use approved direct invocations only as a temporary execution path.
- `@grammyjs/i18n` in this repo is wired through `src/application/app-i18n.ts` and `src/adapters/telegram/telegram-i18n.ts`. Set `localeNegotiator` in the `new I18n(...)` config, not by mutating the instance afterward.
- Keep `fluentBundleOptions.useIsolating = false` in the base i18n config. Otherwise Fluent inserts Unicode isolation marks and string-based tests will fail unexpectedly.
- Locale source of truth is not grammY session. It lives in player profile persistence plus `GameState.groupLocale`, because status subscribers render outside `ctx`.
- Do not remove `TextService` for localization work in this codebase. Treat it as the stable application facade over the i18n backend and preserve its current method-based API unless the user explicitly asks for a bigger refactor.
- Group messages should use `textsForGame(game)`. Private panels and DM responses should use player-specific locale helpers such as `textsForPlayer(game, playerId)` or `texts.forLocale(locale)`.
- `ChatCommandResolver` is intentionally locale-agnostic now. It returns command IDs only; localized command descriptions are materialized later in `TelegramCommandSync`.
- When command sync or translation work changes, rerun both `tsc --noEmit -p tsconfig.json` and `vitest run`. The text-service tests are a fast signal for Fluent formatting regressions.