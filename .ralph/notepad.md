# Notepad

## Where We Are

CLI foundation is complete with config loading, SSH, rsync, systemd, state management, Caddy config generation, server provisioning, origin verification, and now **dependency tracking** modules. All commands are placeholder stubs.

**Implemented modules:**
- `src/config.ts` - loads/validates `toss.json`, parses server strings
- `src/ssh.ts` - remote command execution, file operations
- `src/rsync.ts` - file sync with gitignore support
- `src/systemd.ts` - service management (toss-<app>-<env> naming)
- `src/state.ts` - reading/writing `.toss/state.json`, origin verification
- `src/caddy.ts` - Caddyfile generation and Caddy management
- `src/provisioning.ts` - server setup for `toss init`
- `src/dependencies.ts` - server dependency tracking (NEW)

## Dependency Tracking (`src/dependencies.ts`)

Handles one-time server installations (runtimes, etc.) that shouldn't re-run on every deploy.

**Key functions:**

- `getMissingDependencies(configDeps, appliedDeps)` - Returns list of dependency names in config but not yet applied
- `applyDependencies(connection, config, state, appName, options)` - Installs missing deps, updates state after each success
- `formatDependencyError(result)` - Formats user-friendly error messages

**Usage during deploy:**
```typescript
const result = await applyDependencies(connection, config, state, appName, {
  onProgress: (msg) => console.log(`→ ${msg}`)
});

if (!result.success) {
  const failedDep = result.applied.find(d => !d.success);
  console.error(formatDependencyError(failedDep));
  process.exit(1);
}
```

**Behavior:**
- Reads `dependencies` from toss.json (map of name → install command)
- Compares against `appliedDependencies` in state.json
- Runs missing dependencies in order with `stream: true` (output visible)
- Updates state.json after each successful install (crash-safe)
- Fails fast if any dependency fails

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
├── dependencies.ts          # Server dependencies (NEW)
├── *.test.ts                # Tests for each module
└── commands/                # Command handlers (stubs)
```

## Scripts

- `bun run dev` - Run CLI in development
- `bun run test` - Run tests (107 passing)
- `bun run typecheck` - Type check
- `bun run build` - Build executables

## What's Next

1. **Deployment locking** - prevent concurrent deploys
2. **Port assignment** - deterministic port allocation from 3000+
3. **`toss init` command** - interactive wizard using all the modules
4. **`toss deploy` command** - the core deploy flow
