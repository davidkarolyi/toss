# Notepad

## Where We Are

CLI foundation is complete with all major commands implemented:
- **`toss deploy`** - full deploy flow with release-based directory structure + cleanup
- **`toss remove`** - environment teardown (updated for release structure)
- **`toss list`** - compact deployment table
- **`toss status`** - comprehensive project summary
- **`toss logs`** - tail journalctl logs with `-n` support
- **`toss ssh`** - interactive shell to deployment dir (updated for release structure)

**All commands with environment names have validation** (deploy, remove, logs, ssh).

## What Just Happened

Updated ssh and remove commands for the new release-based directory structure:

**`toss ssh <env>` changes:**
- Now lands in `/srv/<app>/<env>/current` (the active release symlink)
- Fallback to `/srv/<app>/<env>` for legacy deployments with a warning
- Updated help text to reference `current/`
- Checks if `current` symlink exists, falls back gracefully

**`toss remove <env>` changes:**
- Now uses `getEnvDirectory` instead of deprecated `getDeploymentDirectory`
- Removes the entire env directory (including `releases/`, `preserve/`, `current`)
- Updated logging to say "Environment directory" instead of "Deployment directory"

**Tests:** 328 passing (4 new tests added)

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
├── releases.ts              # Release management
├── *.test.ts                # Tests (328 passing)
└── commands/
    ├── init.ts              # Interactive setup wizard
    ├── secrets.ts           # Secrets push/pull
    ├── deploy.ts            # Deploy command
    ├── remove.ts            # Remove command (UPDATED)
    ├── list.ts              # List command
    ├── status.ts            # Status command
    ├── logs.ts              # Logs command
    └── ssh.ts               # SSH command (UPDATED)
```

## What's Next

One backlog item remaining:
1. **Update CLAUDE.md** - document new release structure, preserve/keepReleases config, TOSS_ENV_DIR variable
