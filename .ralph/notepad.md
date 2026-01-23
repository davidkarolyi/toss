# Notepad

## Where We Are

CLI foundation is complete with all major commands implemented:
- **`toss deploy`** - full deploy flow with secret overrides
- **`toss remove`** - environment teardown
- **`toss list`** - compact deployment table
- **`toss status`** - comprehensive project summary
- **`toss logs`** - tail journalctl logs with `-n` support
- **`toss ssh`** - interactive shell to deployment dir

**All commands with environment names now have validation** (deploy, remove, logs, ssh).

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
- `src/environment.ts` - **NEW** - environment name validation (DNS-safe)
- `src/commands/init.ts` - interactive setup wizard
- `src/commands/secrets.ts` - secrets push/pull commands
- `src/commands/deploy.ts` - core deploy flow
- `src/commands/remove.ts` - environment teardown
- `src/commands/list.ts` - deployment listing
- `src/commands/status.ts` - project status summary
- `src/commands/logs.ts` - log tailing
- `src/commands/ssh.ts` - interactive SSH sessions

## What Just Happened

Implemented environment name validation:
- Created `src/environment.ts` with validation functions
- Rules: lowercase, a-z/0-9/- only, start with letter, max 63 chars (DNS-safe)
- Added `validateEnvironmentNameOrThrow()` to deploy, remove, logs, ssh commands
- 31 new tests for validation edge cases
- Tests now at 287 passing

**Validation provides helpful error messages:**
- Suggests lowercase alternative for uppercase names
- Shows which invalid characters were found
- Includes rules and examples in error output

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
├── environment.ts           # Environment name validation (NEW)
├── *.test.ts                # Tests (287 passing)
└── commands/
    ├── init.ts              # Interactive setup wizard
    ├── secrets.ts           # Secrets push/pull
    ├── deploy.ts            # Deploy command
    ├── remove.ts            # Remove command
    ├── list.ts              # List command
    ├── status.ts            # Status command
    ├── logs.ts              # Logs command
    └── ssh.ts               # SSH command
```

## Scripts

- `bun run dev` - Run CLI in development
- `bun run test` - Run tests (287 passing)
- `bun run typecheck` - Type check
- `bun run build` - Build executables

## What's Next

All backlog items are complete! The CLI is feature-complete per the spec.
