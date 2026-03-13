## Environment Notes

- Use Node `24.13.0` for this repository.
- Do not prepend `C:\Program Files\Microsoft Visual Studio\2022\Community\Msbuild\Microsoft\VisualStudio\NodeJs\` to `PATH` for Node-based commands in this project. That override switches the shell to Node `20.13.1`, which breaks `better-sqlite3` ABI compatibility and test runs.
- Before running Node commands when the environment is unclear, verify with `node -v`.
- If native modules need rebuilding, rebuild them under the active default Node `24.13.0` runtime.
