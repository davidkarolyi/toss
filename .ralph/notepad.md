# Notepad

## Where We Are

CLI foundation is complete with all core modules plus **`toss deploy` is now fully implemented**.

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
- `src/ports.ts` - deterministic port assignment
- `src/commands/init.ts` - interactive setup wizard
- `src/commands/secrets.ts` - secrets push/pull commands
- `src/commands/deploy.ts` - **COMPLETE** - the core deploy flow

## Deploy Command

`src/commands/deploy.ts` is the core feature. Usage:
```
toss deploy <environment>
toss deploy pr-42 -s DATABASE_URL=postgres://...
toss deploy pr-42 -s KEY1=val1 -s KEY2=val2
toss deploy pr-42 -s DEBUG=      # Remove override
```

**Deploy flow (all 13 steps):**
1. Acquire deployment lock (abort if locked)
2. Verify project origin matches stored origin
3. Update override file if `-s` flags provided
4. Rsync files to `/srv/<app>/<env>/`
5. Apply missing server dependencies
6. Merge secrets (base + overrides) → write `.env`
7. Resolve/assign port, persist to state.json
8. Run deployScript commands with TOSS_* env vars
9. Generate/update systemd unit, daemon-reload, enable
10. Start or restart service
11. Regenerate Caddy config and reload
12. Release lock
13. Print deployment URL

**Key implementation details:**
- Uses `withLock()` for automatic lock acquisition/release
- Secret overrides are persistent (saved to `overrides/<env>.env`)
- Empty value removes an override: `-s KEY=`
- Warning shown if no secrets found (deploy continues)
- Caddy errors are warnings, not fatal (app still runs)
- Helper functions `parseEnvFile()` and `formatEnvFile()` are exported for testing

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
├── ports.ts                 # Port assignment
├── *.test.ts                # Tests for each module
└── commands/
    ├── init.ts              # Interactive setup wizard
    ├── secrets.ts           # Secrets push/pull
    ├── deploy.ts            # Deploy command (COMPLETE)
    └── (other stubs)
```

## Scripts

- `bun run dev` - Run CLI in development
- `bun run test` - Run tests (195 passing)
- `bun run typecheck` - Type check
- `bun run build` - Build executables

## What's Next

1. **`toss remove`** - tear down environments (stop service, remove files, update state)
2. **`toss list`** - show deployments with URLs
3. **`toss status`** - config summary + deployments + lock status
4. **`toss logs`** - tail journalctl logs
5. **`toss ssh`** - interactive shell to deployment dir
6. **Environment name validation** - DNS-safe names (a-z, 0-9, -, start with letter, max 63 chars)
