# Notepad

## Where We Are

CLI foundation is complete with all major commands implemented:
- **`toss deploy`** - full deploy flow with release-based directory structure
- **`toss remove`** - environment teardown
- **`toss list`** - compact deployment table
- **`toss status`** - comprehensive project summary
- **`toss logs`** - tail journalctl logs with `-n` support
- **`toss ssh`** - interactive shell to deployment dir

**All commands with environment names have validation** (deploy, remove, logs, ssh).

## What Just Happened

Refactored the deploy command to use a release-based directory structure:

**New directory structure:**
```
/srv/<app>/<env>/
├── releases/
│   ├── 20260130_143022/    # timestamped release directories
│   └── 20260130_153045/
├── preserve/               # persistent files across releases
│   ├── uploads/
│   └── data.sqlite
└── current → releases/20260130_153045  # symlink to active release
```

**Key changes:**
1. Created `src/releases.ts` module with:
   - `generateReleaseTimestamp()` - generates `YYYYMMDD_HHMMSS` format
   - `getReleaseDirectory()` - path helper
   - `ensureReleaseDirectories()` - creates `releases/` and `preserve/`
   - `linkPreservedItems()` - creates symlinks for preserved files
   - `switchCurrentSymlink()` - atomic symlink swap with `ln -sfn`
   - `getCurrentReleaseTarget()` - reads current symlink target
   - `listReleases()` - lists all releases (sorted)

2. Added helper functions to `src/state.ts`:
   - `getEnvDirectory()` - `/srv/<app>/<env>`
   - `getReleasesDirectory()` - `/srv/<app>/<env>/releases`
   - `getPreserveDirectory()` - `/srv/<app>/<env>/preserve`
   - `getCurrentSymlinkPath()` - `/srv/<app>/<env>/current`
   - `getCurrentWorkingDirectory()` - same as symlink path

3. Updated `src/commands/deploy.ts`:
   - Rsync to timestamped release directory instead of env dir
   - Link preserved items after rsync
   - Atomic symlink swap to activate release
   - systemd working directory points to `current/`
   - New env vars: `TOSS_ENV_DIR`, updated `TOSS_PROD_DIR` to point to `current/`
   - Shows release timestamp in success output

**Environment variables during deployScript:**
- `TOSS_ENV` - environment name
- `TOSS_APP` - app name
- `TOSS_PORT` - assigned port
- `TOSS_RELEASE_DIR` - full path to timestamped release
- `TOSS_ENV_DIR` - `/srv/<app>/<env>`
- `TOSS_PROD_DIR` - `/srv/<app>/production/current`

**Tests:** 323 passing

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
├── releases.ts              # Release management (NEW)
├── *.test.ts                # Tests (323 passing)
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

Next backlog items:
1. **Release cleanup** - delete old releases (keepReleases for production, only current for previews)
2. **Update ssh/remove commands** - land in `current/`, remove whole env dir
3. **Update CLAUDE.md** - document new structure
