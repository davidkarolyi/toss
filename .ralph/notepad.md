# Notepad

## Where We Are

CLI foundation and config loading are complete. SSH and rsync modules are now built. The project has:

- **Entry point**: `src/index.ts` → `src/cli.ts`
- **Command handlers**: `src/commands/*.ts` (init, deploy, remove, list, status, logs, ssh, secrets)
- **Config module**: `src/config.ts` - loads and validates `toss.json`
- **SSH module**: `src/ssh.ts` - remote command execution, connection testing, file operations
- **Rsync module**: `src/rsync.ts` - file sync with gitignore support and standard excludes
- **Build system**: `bun run build` produces standalone executables for macOS (arm64, x64) and Linux (x64, arm64)

All commands are placeholder stubs that print "not implemented yet".

## Structure

```
src/
├── index.ts        # Entry point
├── cli.ts          # Argument parsing and command routing
├── config.ts       # Config loading and validation
├── config.test.ts  # Tests for config module
├── ssh.ts          # SSH connection and remote execution
├── ssh.test.ts     # Tests for SSH module
├── rsync.ts        # File sync to remote server
├── rsync.test.ts   # Tests for rsync module
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

## SSH Module

`src/ssh.ts` provides:
- `testConnection()` - tests SSH connectivity with actionable error messages
- `exec()` / `execOrFail()` - run remote commands with optional streaming
- `openInteractiveSession()` - for interactive SSH (used by `toss ssh`)
- `readRemoteFile()` / `writeRemoteFile()` - remote file I/O
- `mkdirRemote()` / `removeRemote()` - directory operations
- `remoteExists()` - check if path exists
- `escapeShellArg()` - safe shell escaping
- `buildSshArgs()` - construct SSH command args (respects custom ports)

Key decisions:
- Uses system's `ssh` binary with `BatchMode=yes` for non-interactive use
- `StrictHostKeyChecking=accept-new` auto-accepts new hosts
- `ConnectTimeout=10` for reasonable timeout
- Connection errors include troubleshooting steps

## Rsync Module

`src/rsync.ts` provides:
- `syncToRemote()` / `syncToRemoteOrFail()` - sync local dir to server
- Supports custom SSH ports
- Default excludes: `node_modules`, `.git`, `.next`, `.DS_Store`, `.env*`
- Gitignore support via `--filter=':- .gitignore'`
- Archive mode (`-avz`) preserves permissions and timestamps
- Error messages include rsync exit code explanations

## Scripts

- `bun run dev` - Run CLI in development
- `bun run test` - Run tests (23 passing)
- `bun run typecheck` - Type check
- `bun run build` - Build all executables to `dist/`

## What's Next

The next logical tasks are:
1. **systemd module** - for managing services on the server
2. **Caddy config generation** - for reverse proxy setup
3. **Server provisioning** - initial VPS setup during `toss init`

These build on the SSH module we just created.
