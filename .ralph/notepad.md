# Notepad

## Where We Are

CLI foundation is complete with config loading, SSH, rsync, systemd, state management, Caddy config generation, server provisioning, and **origin verification** modules. All commands are placeholder stubs.

**Implemented modules:**
- `src/config.ts` - loads/validates `toss.json`, parses server strings
- `src/ssh.ts` - remote command execution, file operations
- `src/rsync.ts` - file sync with gitignore support
- `src/systemd.ts` - service management (toss-<app>-<env> naming)
- `src/state.ts` - reading/writing `.toss/state.json`, **origin verification**
- `src/caddy.ts` - Caddyfile generation and Caddy management
- `src/provisioning.ts` - server setup for `toss init`

## Origin Verification (`src/state.ts`)

Prevents accidental overwrites when two different repos use the same app name.

**Key function: `verifyOrigin(storedOrigin, localOrigin)`**

Returns `OriginVerificationResult`:
- `valid: boolean` - whether deploy should proceed
- `error?: string` - detailed error message if invalid
- `storedOrigin?: string` - origin stored on server
- `localOrigin?: string` - origin from local git repo

**Behavior:**
- Allow if either origin is null (first deploy, or not a git repo)
- Allow if origins match (after normalization)
- Block if both exist but don't match

**Normalization** (via `normalizeGitOrigin`):
- SSH `git@github.com:user/repo` → `github.com/user/repo`
- HTTPS `https://github.com/user/repo` → `github.com/user/repo`
- Removes `.git` suffix, trailing slashes
- Case insensitive

**Usage during deploy:**
1. Read state from server: `readState(connection, appName)`
2. Detect local origin: `detectGitOrigin()` (from provisioning.ts)
3. Verify: `verifyOrigin(state.origin, localOrigin)`
4. If `!result.valid`, abort with `result.error`

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
├── *.test.ts                # Tests for each module
└── commands/                # Command handlers (stubs)
```

## Scripts

- `bun run dev` - Run CLI in development
- `bun run test` - Run tests (94 passing)
- `bun run typecheck` - Type check
- `bun run build` - Build executables

## What's Next

1. **Dependency tracking** - apply server dependencies from config
2. **Deployment locking** - prevent concurrent deploys
3. **Port assignment** - deterministic port allocation from 3000+
4. **`toss init` command** - interactive wizard using all the modules
5. **`toss deploy` command** - the core deploy flow
