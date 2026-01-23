# Notepad

## Where We Are

CLI foundation is complete with config loading, SSH, rsync, systemd, state management, Caddy config generation, server provisioning, origin verification, dependency tracking, deployment locking, init command, and now **port assignment**.

**Implemented modules:**
- `src/config.ts` - loads/validates `toss.json`, parses server strings
- `src/ssh.ts` - remote command execution, file operations
- `src/rsync.ts` - file sync with gitignore support
- `src/systemd.ts` - service management (toss-<app>-<env> naming)
- `src/state.ts` - reading/writing `.toss/state.json`, origin verification
- `src/caddy.ts` - Caddyfile generation and Caddy management
- `src/provisioning.ts` - server setup for `toss init`
- `src/dependencies.ts` - server dependency tracking
- `src/lock.ts` - deployment locking
- `src/commands/init.ts` - interactive setup wizard
- `src/ports.ts` - deterministic port assignment (NEW)

## Port Assignment Module

`src/ports.ts` handles deterministic port allocation starting from 3000.

**Key functions:**
- `getUsedPorts(connection)` - queries server for actually listening ports via `ss -tlnp` (with `netstat` fallback)
- `parsePortListingOutput(output)` - parses ss/netstat output to extract port numbers
- `getTrackedPorts(state)` - extracts ports from state.json deployments
- `findNextAvailablePort(usedPorts, trackedPorts)` - finds next free port (not in either set)
- `resolvePort(connection, state, environment)` - main entry point: returns existing port if assigned, otherwise assigns new one

**How it works:**
1. If environment already has a port in state.json, use that
2. Otherwise, query server for ports in use (ss/netstat)
3. Combine with ports tracked in state.json
4. Find lowest available port starting from 3000
5. Returns `{ port, isNew }` so caller knows if state needs updating

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
├── lock.ts                  # Deployment locking
├── ports.ts                 # Port assignment (NEW)
├── *.test.ts                # Tests for each module
└── commands/
    └── init.ts              # Interactive setup wizard
    └── (other stubs)
```

## Scripts

- `bun run dev` - Run CLI in development
- `bun run test` - Run tests (154 passing)
- `bun run typecheck` - Type check
- `bun run build` - Build executables

## What's Next

1. **`toss secrets push/pull`** - secrets management commands
2. **`toss deploy`** - the core deploy flow (now unblocked by port assignment)
3. **`toss remove`** - tear down environments
