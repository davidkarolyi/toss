# Notepad

## Where We Are

CLI foundation is complete with config loading, SSH, rsync, systemd, state management, Caddy config generation, server provisioning, origin verification, dependency tracking, and now **deployment locking** modules. All commands are placeholder stubs.

**Implemented modules:**
- `src/config.ts` - loads/validates `toss.json`, parses server strings
- `src/ssh.ts` - remote command execution, file operations
- `src/rsync.ts` - file sync with gitignore support
- `src/systemd.ts` - service management (toss-<app>-<env> naming)
- `src/state.ts` - reading/writing `.toss/state.json`, origin verification
- `src/caddy.ts` - Caddyfile generation and Caddy management
- `src/provisioning.ts` - server setup for `toss init`
- `src/dependencies.ts` - server dependency tracking
- `src/lock.ts` - deployment locking (NEW)

## Deployment Locking (`src/lock.ts`)

Prevents concurrent deploys to the same server by acquiring a lock in `.toss/state.json`.

**Key functions:**

- `createLock(environment)` - Creates lock object with hostname, PID, timestamp
- `isLockStale(lock)` - Returns true if lock is older than 30 minutes
- `isOwnLock(lock)` - Returns true if current process owns the lock
- `isDeadProcessLock(lock)` - Detects dead process locks on same host
- `acquireLock(connection, appName, environment)` - Attempt to acquire lock
- `releaseLock(connection, appName)` - Release lock if owned by current process
- `withLock(connection, appName, environment, fn, options)` - Execute function with lock
- `LockError` - Custom error class for lock failures

**Usage during deploy:**
```typescript
await withLock(connection, appName, environment, async () => {
  // Deploy logic here - lock is held for entire duration
  await syncFiles();
  await runDeployScript();
  await restartService();
}, {
  onLockAcquired: (result) => {
    if (result.existingLock) {
      console.log(`→ Breaking stale lock: ${result.reason}`);
    }
    console.log(`→ Lock acquired`);
  },
  onLockReleased: () => console.log(`→ Lock released`)
});
```

**Lock acquisition rules:**
1. If no lock exists → acquire
2. If lock owned by this process → allow (re-entrant)
3. If lock is stale (>30 min) → break and acquire
4. If lock from dead process on same host → break and acquire
5. Otherwise → fail with `LockError`

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
├── lock.ts                  # Deployment locking (NEW)
├── *.test.ts                # Tests for each module
└── commands/                # Command handlers (stubs)
```

## Scripts

- `bun run dev` - Run CLI in development
- `bun run test` - Run tests (137 passing)
- `bun run typecheck` - Type check
- `bun run build` - Build executables

## What's Next

1. **Port assignment** - deterministic port allocation from 3000+
2. **`toss init` command** - interactive wizard using all the modules
3. **`toss deploy` command** - the core deploy flow
