# Notepad

## Where We Are

CLI foundation is complete with core modules plus **`toss deploy`** and **`toss remove`** are fully implemented.

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
- `src/commands/remove.ts` - **NEW** - environment teardown

## Commands Implemented

### `toss deploy <environment>` (complete)
Deploys the current working directory. Supports `-s KEY=VALUE` for persistent secret overrides.

### `toss remove <environment>` (new)
Tears down non-production environments. Usage:
```
toss remove pr-42
toss remove staging
```

**Remove flow:**
1. Validates environment (refuses to remove `production`)
2. Checks if environment exists (in state or as directory)
3. Stops and removes systemd service
4. Removes deployment directory (`/srv/<app>/<env>/`)
5. Removes secret overrides (`/srv/<app>/.toss/secrets/overrides/<env>.env`)
6. Updates state.json (removes entry)
7. Regenerates Caddy config and reloads
8. Prints summary of what was removed

**Key details:**
- Production protected as safety measure (suggests SSH workaround for manual teardown)
- Handles orphaned directories (not in state but on disk)
- Caddy errors are warnings, not fatal
- Uses `removeService()` from systemd module for clean service removal

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
    ├── remove.ts            # Remove command (NEW)
    └── (other stubs)
```

## Scripts

- `bun run dev` - Run CLI in development
- `bun run test` - Run tests (211 passing)
- `bun run typecheck` - Type check
- `bun run build` - Build executables

## What's Next

1. **`toss list`** - show deployments with URLs
2. **`toss status`** - config summary + deployments + lock status
3. **`toss logs`** - tail journalctl logs
4. **`toss ssh`** - interactive shell to deployment dir
5. **Environment name validation** - DNS-safe names (a-z, 0-9, -, start with letter, max 63 chars)
