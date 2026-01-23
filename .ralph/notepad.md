# Notepad

## Where We Are

CLI foundation is complete with core modules. Major commands implemented:
- **`toss deploy`** - full deploy flow with secret overrides
- **`toss remove`** - environment teardown
- **`toss list`** - compact deployment table
- **`toss status`** - comprehensive project summary
- **`toss logs`** - **NEW** - tail journalctl logs with `-n` support

**Implemented modules:**
- `src/config.ts` - loads/validates `toss.json`, parses server strings
- `src/ssh.ts` - remote command execution, file operations
- `src/rsync.ts` - file sync with gitignore support
- `src/systemd.ts` - service management (toss-<app>-<env> naming)
- `src/state.ts` - reading/writing `.toss/state.json`, origin verification
- `src/caddy.ts` - Caddyfile generation and Caddy management
- `src/provisioning.ts` - server setup for `toss init`
- `src/dependencies.ts` - server dependency tracking
- `src/lock.ts` - deployment locking
- `src/ports.ts` - deterministic port assignment
- `src/commands/init.ts` - interactive setup wizard
- `src/commands/secrets.ts` - secrets push/pull commands
- `src/commands/deploy.ts` - core deploy flow
- `src/commands/remove.ts` - environment teardown
- `src/commands/list.ts` - deployment listing
- `src/commands/status.ts` - project status summary
- `src/commands/logs.ts` - log tailing (NEW)

## What Just Happened

Implemented `toss logs` command with:
- Required environment name argument
- `-n <lines>` flag to show last N lines and exit
- Continuous streaming mode (follow) when `-n` is not provided
- Uses `journalctl -u toss-<app>-<env>` over SSH
- Proper Ctrl+C handling (exit code 130 is expected in streaming mode)
- Help text with usage examples

**Usage:**
```
toss logs production         # Stream continuously, Ctrl+C to stop
toss logs pr-42 -n 100       # Show last 100 lines
```

Added tests for argument parsing and journalctl command construction. Tests now at 235 passing.

## Structure

```
src/
├── index.ts, cli.ts         # Entry + routing
├── config.ts                # Config loading
├── ssh.ts                   # SSH operations
├── rsync.ts                 # File sync
├── systemd.ts               # Process management
├── state.ts                 # Server state + origin verification
├── caddy.ts                 # Reverse proxy
├── provisioning.ts          # Server setup
├── dependencies.ts          # Server dependencies
├── lock.ts                  # Deployment locking
├── ports.ts                 # Port assignment
├── *.test.ts                # Tests (235 passing)
└── commands/
    ├── init.ts              # Interactive setup wizard
    ├── secrets.ts           # Secrets push/pull
    ├── deploy.ts            # Deploy command
    ├── remove.ts            # Remove command
    ├── list.ts              # List command
    ├── status.ts            # Status command
    ├── logs.ts              # Logs command (NEW)
    └── ssh.ts               # SSH command (placeholder)
```

## Scripts

- `bun run dev` - Run CLI in development
- `bun run test` - Run tests (235 passing)
- `bun run typecheck` - Type check
- `bun run build` - Build executables

## What's Next

1. **`toss ssh`** - interactive shell to deployment dir
2. **Environment name validation** - DNS-safe names (a-z, 0-9, -, start with letter, max 63 chars)
