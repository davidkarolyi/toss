# Notepad

## Where We Are

CLI foundation is complete with config loading, SSH, rsync, systemd, **state management**, and **Caddy config generation** modules. All commands are placeholder stubs.

**Implemented modules:**
- `src/config.ts` - loads/validates `toss.json`, parses server strings
- `src/ssh.ts` - remote command execution, file operations
- `src/rsync.ts` - file sync with gitignore support
- `src/systemd.ts` - service management (toss-<app>-<env> naming)
- `src/state.ts` - reading/writing `.toss/state.json` on server
- `src/caddy.ts` - Caddyfile generation and Caddy management

## State Module (`src/state.ts`)

Manages `.toss/state.json` on the server. Provides:

**Path helpers:**
- `getTossDirectory(appName)` → `/srv/<app>/.toss`
- `getStatePath(appName)` → `/srv/<app>/.toss/state.json`
- `getSecretsDirectory(appName)` → `/srv/<app>/.toss/secrets`
- `getSecretsOverridesDirectory(appName)` → `/srv/<app>/.toss/secrets/overrides`
- `getDeploymentDirectory(appName, env)` → `/srv/<app>/<env>`

**State operations:**
- `readState()` / `writeState()` - read/write state.json over SSH
- `updateDeployment()` / `removeDeployment()` - modify deployment entries
- `createEmptyState()` - new state with null origin, empty deployments
- `getDeployedEnvironments()` / `getPortForEnvironment()` - query helpers

**State structure:**
```typescript
interface TossState {
  origin: string | null;
  deployments: Record<string, { port: number }>;
  appliedDependencies: string[];
  lock: DeploymentLock | null;
}
```

## Caddy Module (`src/caddy.ts`)

Generates Caddyfile and manages Caddy lifecycle. Provides:

**URL generation:**
- `getDeploymentUrl(env, serverHost, domain?)` → `https://...`
- `getDeploymentHostname(env, serverHost, domain?)` → hostname without protocol
- With domain: production → `domain`, others → `<env>.preview.<domain>`
- Without domain: `<env>.<ip-dashed>.sslip.io`

**Caddyfile generation:**
- `generateCaddyfile(state, config)` - creates complete Caddyfile
- Production listed first, then alphabetically by environment
- Each site block: `hostname { reverse_proxy localhost:<port> }`

**Caddy operations:**
- `isCaddyInstalled()` / `isCaddyRunning()` - status checks
- `startCaddy()` / `enableCaddy()` / `reloadCaddy()` - lifecycle
- `validateCaddyConfig()` - syntax check before reload
- `updateCaddyConfig()` - main function: generate, write, validate, ensure running, reload

## Structure

```
src/
├── index.ts, cli.ts         # Entry + routing
├── config.ts                # Config loading
├── ssh.ts                   # SSH operations
├── rsync.ts                 # File sync
├── systemd.ts               # Process management
├── state.ts                 # Server state (NEW)
├── caddy.ts                 # Reverse proxy (NEW)
├── *.test.ts                # Tests for each module
└── commands/                # Command handlers (stubs)
```

## Scripts

- `bun run dev` - Run CLI in development
- `bun run test` - Run tests (68 passing)
- `bun run typecheck` - Type check
- `bun run build` - Build executables

## What's Next

With state and Caddy modules done, the next logical tasks are:
1. **Server provisioning** - `toss init` VPS setup (install Caddy, create directories, init state.json)
2. **Port assignment** - deterministic port allocation from 3000+
3. **`toss deploy`** - core deployment logic using all modules
