# Notepad

## Where We Are

CLI foundation is complete with config loading, SSH, rsync, systemd, state management, Caddy config generation, and **server provisioning** modules. All commands are placeholder stubs.

**Implemented modules:**
- `src/config.ts` - loads/validates `toss.json`, parses server strings
- `src/ssh.ts` - remote command execution, file operations
- `src/rsync.ts` - file sync with gitignore support
- `src/systemd.ts` - service management (toss-<app>-<env> naming)
- `src/state.ts` - reading/writing `.toss/state.json` on server
- `src/caddy.ts` - Caddyfile generation and Caddy management
- `src/provisioning.ts` - server setup for `toss init` (NEW)

## Provisioning Module (`src/provisioning.ts`)

Handles server setup during `toss init`. All operations are idempotent.

**Path helpers:**
- `getAppDirectory(appName)` → `/srv/<app>`
- `getProductionSecretsPath(appName)` → `/srv/<app>/.toss/secrets/production.env`
- `getPreviewSecretsPath(appName)` → `/srv/<app>/.toss/secrets/preview.env`

**Key functions:**
- `detectGitOrigin()` - gets git remote origin from local repo
- `installCaddy()` - installs Caddy via official apt repository
- `ensureCaddyInstalled()` - checks first, installs only if needed
- `createAppDirectories()` - creates /srv/app/.toss/secrets/overrides structure
- `createEmptySecretsFiles()` - creates production.env and preview.env if missing
- `initializeState()` - creates state.json with origin (won't overwrite existing)
- `isAlreadyProvisioned()` - checks if state.json exists
- `provisionServer()` - orchestrates all provisioning steps
- `verifyElevatedAccess()` - checks for root or passwordless sudo

**Provisioning flow:**
1. Ensure Caddy is installed (via apt)
2. Create directory structure
3. Create empty secrets files
4. Initialize state.json with git origin

Uses `isCaddyInstalled` from caddy.ts to avoid duplication.

## Structure

```
src/
├── index.ts, cli.ts         # Entry + routing
├── config.ts                # Config loading
├── ssh.ts                   # SSH operations
├── rsync.ts                 # File sync
├── systemd.ts               # Process management
├── state.ts                 # Server state
├── caddy.ts                 # Reverse proxy
├── provisioning.ts          # Server setup (NEW)
├── *.test.ts                # Tests for each module
└── commands/                # Command handlers (stubs)
```

## Scripts

- `bun run dev` - Run CLI in development
- `bun run test` - Run tests (79 passing)
- `bun run typecheck` - Type check
- `bun run build` - Build executables

## What's Next

Provisioning module done. The next logical tasks are:
1. **Project origin tracking** - verify origin on deploy for collision detection
2. **Dependency tracking** - apply server dependencies from config
3. **Deployment locking** - prevent concurrent deploys
4. **`toss init` command** - interactive wizard using all the modules
5. **Port assignment** - deterministic port allocation from 3000+
