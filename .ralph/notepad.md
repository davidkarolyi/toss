# Notepad

## Where We Are

CLI foundation is complete with core modules. Major commands implemented:
- **`toss deploy`** - full deploy flow with secret overrides
- **`toss remove`** - environment teardown
- **`toss list`** - compact deployment table
- **`toss status`** - **NEW** - comprehensive project summary

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

## What Just Happened

Implemented `toss status` command with:
- Configuration section (app, server, domain or "(sslip.io)", start command, deploy script count)
- Server connection test with troubleshooting tips on failure
- Lock status (shows unlocked, locked, or locked (stale))
- Deployments section showing for each:
  - URL, port, status (running/stopped/failed)
  - Secret override keys (just keys, not values)

**Output example:**
```
Configuration
──────────────────────────────────────────────────
  App:           myapp
  Server:        root@64.23.123.45
  Domain:        myapp.com
  Start:         npm start
  Deploy script: 2 command(s)

Server Connection
──────────────────────────────────────────────────
  Status: connected

Deploy Lock
──────────────────────────────────────────────────
  Status: unlocked

Deployments
──────────────────────────────────────────────────

  production
    URL:      https://myapp.com
    Port:     3000
    Status:   running

  pr-42
    URL:      https://pr-42.preview.myapp.com
    Port:     3001
    Status:   running
    Overrides: DATABASE_URL, DEBUG
```

Reuses `parseEnvFile` from deploy.ts for reading override files.

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
├── *.test.ts                # Tests (211 passing)
└── commands/
    ├── init.ts              # Interactive setup wizard
    ├── secrets.ts           # Secrets push/pull
    ├── deploy.ts            # Deploy command
    ├── remove.ts            # Remove command
    ├── list.ts              # List command
    └── status.ts            # Status command (NEW)
```

## Scripts

- `bun run dev` - Run CLI in development
- `bun run test` - Run tests (211 passing)
- `bun run typecheck` - Type check
- `bun run build` - Build executables

## What's Next

1. **`toss logs`** - tail journalctl logs with `-n` flag support
2. **`toss ssh`** - interactive shell to deployment dir
3. **Environment name validation** - DNS-safe names (a-z, 0-9, -, start with letter, max 63 chars)
