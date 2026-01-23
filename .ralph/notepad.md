# Notepad

## Where We Are

CLI foundation is complete with core modules plus **`toss deploy`**, **`toss remove`**, and **`toss list`** are fully implemented.

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
- `src/commands/list.ts` - **NEW** - show deployments with URLs

## Commands Implemented

### `toss deploy <environment>` (complete)
Deploys the current working directory. Supports `-s KEY=VALUE` for persistent secret overrides.

### `toss remove <environment>` (complete)
Tears down non-production environments.

### `toss list` (new)
Shows all deployments for the current app. Usage:
```
toss list
```

**Output:**
```
ENVIRONMENT  PORT  STATUS   URL
----------------------------------------------
production   3000  running  https://myapp.com
pr-42        3001  running  https://pr-42.preview.myapp.com
pr-123       3002  stopped  https://pr-123.preview.myapp.com
```

**Key details:**
- Reads state from server (`/srv/<app>/.toss/state.json`)
- Constructs URLs using domain or sslip.io fallback (reuses `getDeploymentUrl` from caddy.ts)
- Gets live systemd service status for each deployment
- Sorts: production first, then alphabetically
- Shows helpful message when no deployments exist

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
    ├── list.ts              # List command (NEW)
    └── (other stubs)
```

## Scripts

- `bun run dev` - Run CLI in development
- `bun run test` - Run tests (211 passing)
- `bun run typecheck` - Type check
- `bun run build` - Build executables

## What's Next

1. **`toss status`** - config summary + deployments + lock status + secret override keys
2. **`toss logs`** - tail journalctl logs
3. **`toss ssh`** - interactive shell to deployment dir
4. **Environment name validation** - DNS-safe names (a-z, 0-9, -, start with letter, max 63 chars)
