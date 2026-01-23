# Notepad

## Where We Are

CLI foundation is complete with all major commands implemented:
- **`toss deploy`** - full deploy flow with secret overrides
- **`toss remove`** - environment teardown
- **`toss list`** - compact deployment table
- **`toss status`** - comprehensive project summary
- **`toss logs`** - tail journalctl logs with `-n` support
- **`toss ssh`** - **NEW** - interactive shell to deployment dir

**Implemented modules:**
- `src/config.ts` - loads/validates `toss.json`, parses server strings
- `src/ssh.ts` - remote command execution, file operations, interactive sessions
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
- `src/commands/logs.ts` - log tailing
- `src/commands/ssh.ts` - interactive SSH sessions (NEW)

## What Just Happened

Implemented `toss ssh` command with:
- Required environment name argument
- Opens interactive SSH session to server
- Changes to deployment directory (`/srv/<app>/<env>/`)
- Uses `openInteractiveSession` from `src/ssh.ts` (already existed)
- Starts a login shell with `exec $SHELL -l` for proper environment
- Help text with usage examples

**Usage:**
```
toss ssh production    # SSH into production, lands in /srv/myapp/production
toss ssh pr-42         # SSH into pr-42 preview
```

Added 21 tests for argument parsing and path construction. Tests now at 256 passing.

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
├── *.test.ts                # Tests (256 passing)
└── commands/
    ├── init.ts              # Interactive setup wizard
    ├── secrets.ts           # Secrets push/pull
    ├── deploy.ts            # Deploy command
    ├── remove.ts            # Remove command
    ├── list.ts              # List command
    ├── status.ts            # Status command
    ├── logs.ts              # Logs command
    └── ssh.ts               # SSH command (NEW)
```

## Scripts

- `bun run dev` - Run CLI in development
- `bun run test` - Run tests (256 passing)
- `bun run typecheck` - Type check
- `bun run build` - Build executables

## What's Next

1. **Environment name validation** - DNS-safe names (a-z, 0-9, -, start with letter, max 63 chars)
