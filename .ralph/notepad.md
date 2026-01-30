# Notepad

## Where We Are

**All backlog items complete!** The CLI is fully implemented with release-based deployments.

### Commands
- **`toss init`** - interactive setup wizard
- **`toss deploy`** - full deploy flow with release-based structure + cleanup
- **`toss remove`** - environment teardown
- **`toss list`** - compact deployment table
- **`toss status`** - comprehensive project summary
- **`toss logs`** - tail journalctl logs with `-n` support
- **`toss ssh`** - interactive shell to `current/` directory
- **`toss secrets push/pull`** - secrets management

### Release-Based Structure
Each environment now has:
- `releases/` - timestamped directories (e.g., `20260130_143022`)
- `current` - symlink to active release (atomically swapped)
- `preserve/` - persistent files across releases

### Config Fields
- `preserve` - array of paths to persist across releases
- `keepReleases` - number of old releases to keep (default 3, production only)

### Environment Variables
- `TOSS_RELEASE_DIR` = timestamped release dir being deployed
- `TOSS_ENV_DIR` = environment base dir (`/srv/<app>/<env>`)
- `TOSS_PROD_DIR` = production's current dir (`/srv/<app>/production/current`)

## What Just Happened

Updated CLAUDE.md to document the release-based deployment structure:
- Added `preserve` and `keepReleases` config fields with descriptions
- Updated directory structure diagram to show `releases/`, `current`, `preserve/`
- Added new sections: "Preserved Files" and "Release Cleanup"
- Updated environment variables table with new `TOSS_ENV_DIR` and corrected paths
- Updated systemd example to show `current/` in WorkingDirectory
- Expanded rollback section to explain quick rollback via symlink switching
- Updated "What Happens" deploy flow with release-based steps
- Various comment updates for accuracy

**Tests:** 328 passing

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
├── releases.ts              # Release management + cleanup
├── *.test.ts                # Tests (328 passing)
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

## What's Next

Backlog is empty. Project is feature-complete for initial release. Possible future work:
- `toss exec <command>` - run command on server
- `toss doctor` - diagnose issues
- Multiple apps per config
- Monorepo support
