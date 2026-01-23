# Notepad

## Where We Are

CLI foundation and config loading are complete. The project now has:

- **Entry point**: `src/index.ts` → `src/cli.ts`
- **Command handlers**: `src/commands/*.ts` (init, deploy, remove, list, status, logs, ssh, secrets)
- **Config module**: `src/config.ts` - loads and validates `toss.json`
- **Build system**: `bun run build` produces standalone executables for macOS (arm64, x64) and Linux (x64, arm64)

All commands are placeholder stubs that print "not implemented yet" (except init which won't need config loading).

## Structure

```
src/
├── index.ts        # Entry point
├── cli.ts          # Argument parsing and command routing
├── config.ts       # Config loading and validation
├── config.test.ts  # Tests for config module
└── commands/       # One file per command
    ├── init.ts
    ├── deploy.ts
    ├── remove.ts
    ├── list.ts
    ├── status.ts
    ├── logs.ts
    ├── ssh.ts
    └── secrets.ts
```

## Config Module

The `src/config.ts` module provides:
- `loadConfig()` - finds `toss.json` by walking up directories, validates and returns config + repoRoot
- `parseServerString()` - parses `user@host` or `user@host:port` format
- `extractHostFromServer()` - gets just the host for sslip.io URLs

Config validation ensures:
- Required fields: `app`, `server`, `startCommand`, `deployScript` (array of strings)
- Optional fields: `domain`, `dependencies` (map of name → install command)
- Exits with helpful error if `toss.json` not found

## Scripts

- `bun run dev` - Run CLI in development
- `bun run test` - Run tests
- `bun run typecheck` - Type check
- `bun run build` - Build all executables to `dist/`

## What's Next

The next logical task is **SSH/rsync module** - almost every command (deploy, secrets, logs, ssh, status) needs to run commands over SSH. This is the foundation for the entire CLI.
