# Notepad

## Where We Are

CLI foundation is complete with all major commands implemented:
- **`toss deploy`** - full deploy flow with release-based directory structure + cleanup
- **`toss remove`** - environment teardown
- **`toss list`** - compact deployment table
- **`toss status`** - comprehensive project summary
- **`toss logs`** - tail journalctl logs with `-n` support
- **`toss ssh`** - interactive shell to deployment dir

**All commands with environment names have validation** (deploy, remove, logs, ssh).

## What Just Happened

Implemented release cleanup after successful deploys:

**New code in `src/releases.ts`:**
- `DEFAULT_KEEP_RELEASES = 3` constant
- `CleanupResult` interface for tracking what was deleted
- `cleanupOldReleases()` function that:
  - For production: keeps N releases (configurable via `keepReleases` config)
  - For previews: keeps only 1 release (current)
  - Never deletes the current active release (safety check)
  - Deletes oldest releases first (timestamps sort chronologically)

**Updated `src/commands/deploy.ts`:**
- Added cleanup step after Caddy config, before success message
- Uses `config.keepReleases ?? DEFAULT_KEEP_RELEASES`
- Logs how many releases were removed

**Tests:** 324 passing

## Structure

```
src/
├── index.ts, cli.ts         # Entry + routing
├── config.ts                # Config loading + preserve/keepReleases validation
├── ssh.ts                   # SSH operations
├── rsync.ts                 # File sync
├── systemd.ts               # Process management
├── state.ts                 # Server state + directory helpers
├── caddy.ts                 # Reverse proxy
├── provisioning.ts          # Server setup
├── dependencies.ts          # Server dependencies
├── lock.ts                  # Deployment locking
├── ports.ts                 # Port assignment
├── environment.ts           # Environment name validation
├── releases.ts              # Release management (UPDATED)
├── *.test.ts                # Tests (324 passing)
└── commands/
    ├── init.ts              # Interactive setup wizard
    ├── secrets.ts           # Secrets push/pull
    ├── deploy.ts            # Deploy command (UPDATED)
    ├── remove.ts            # Remove command
    ├── list.ts              # List command
    ├── status.ts            # Status command
    ├── logs.ts              # Logs command
    └── ssh.ts               # SSH command
```

## What's Next

Remaining backlog items:
1. **Update ssh/remove commands** - land in `current/`, remove whole env dir
2. **Update CLAUDE.md** - document new structure
