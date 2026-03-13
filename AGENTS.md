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
