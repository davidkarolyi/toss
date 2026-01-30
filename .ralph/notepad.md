# Notepad

## Where We Are

CLI foundation is complete with all major commands implemented:
- **`toss deploy`** - full deploy flow with secret overrides
- **`toss remove`** - environment teardown
- **`toss list`** - compact deployment table
- **`toss status`** - comprehensive project summary
- **`toss logs`** - tail journalctl logs with `-n` support
- **`toss ssh`** - interactive shell to deployment dir

**All commands with environment names have validation** (deploy, remove, logs, ssh).

**Implemented modules:**
- `src/config.ts` - loads/validates `toss.json`, parses server strings, **now with `preserve` and `keepReleases` validation**
- `src/ssh.ts` - remote command execution, file operations, interactive sessions
- `src/rsync.ts` - file sync with gitignore support
- `src/systemd.ts` - service management (toss-<app>-<env> naming)
- `src/state.ts` - reading/writing `.toss/state.json`, origin verification
- `src/caddy.ts` - Caddyfile generation and Caddy management
- `src/provisioning.ts` - server setup for `toss init`
- `src/dependencies.ts` - server dependency tracking
- `src/lock.ts` - deployment locking
- `src/ports.ts` - deterministic port assignment
- `src/environment.ts` - environment name validation (DNS-safe)
- `src/commands/init.ts` - interactive setup wizard
- `src/commands/secrets.ts` - secrets push/pull commands
- `src/commands/deploy.ts` - core deploy flow
- `src/commands/remove.ts` - environment teardown
- `src/commands/list.ts` - deployment listing
- `src/commands/status.ts` - project status summary
- `src/commands/logs.ts` - log tailing
- `src/commands/ssh.ts` - interactive SSH sessions

## What Just Happened

Added two new optional config fields for release-based deployments:
- **`preserve`**: array of paths to persist across releases (e.g., `["uploads", "data.sqlite"]`)
- **`keepReleases`**: positive integer for how many releases to keep (defaults to 3 for production)

**Implementation details:**
- Added `PreservePathValidation` interface and `validatePreservePath()` helper
- Added `isValidKeepReleases()` type guard function
- Validation rules for `preserve`:
  - Must be array of non-empty strings
  - No absolute paths (starting with `/`)
  - No `..` segments (prevents directory traversal)
  - Simple relative paths like `uploads`, `data/db.sqlite` are allowed
- Validation rules for `keepReleases`:
  - Must be positive integer (>= 1)
- Added 25 new tests for the validation functions
- Tests now at 312 passing

## Structure

```
src/
├── index.ts, cli.ts         # Entry + routing
├── config.ts                # Config loading + preserve/keepReleases validation
├── ssh.ts                   # SSH operations
├── rsync.ts                 # File sync
├── systemd.ts               # Process management
├── state.ts                 # Server state + origin verification
├── caddy.ts                 # Reverse proxy
├── provisioning.ts          # Server setup
├── dependencies.ts          # Server dependencies
├── lock.ts                  # Deployment locking
├── ports.ts                 # Port assignment
├── environment.ts           # Environment name validation
├── *.test.ts                # Tests (312 passing)
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
- `bun run test` - Run tests (312 passing)
- `bun run typecheck` - Type check
- `bun run build` - Build executables

## What's Next

Next backlog item: Refactor the deploy command to use release-based directory structure with:
- `/srv/<app>/<env>/releases/<timestamp>/` for each release
- `/srv/<app>/<env>/current` symlink to active release
- `/srv/<app>/<env>/preserve/` for persistent files

This will involve significant changes to:
- `src/commands/deploy.ts` - rsync to releases dir, create symlinks for preserved items, atomic symlink swap
- `src/systemd.ts` - working directory should point to `current/`
- Environment variables need updating (`TOSS_RELEASE_DIR`, `TOSS_ENV_DIR`, `TOSS_PROD_DIR`)
