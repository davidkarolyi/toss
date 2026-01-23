# Notepad

## Where We Are

CLI foundation is complete with config loading, SSH, rsync, systemd, state management, Caddy config generation, server provisioning, origin verification, dependency tracking, deployment locking, init command, port assignment, and now **secrets management**.

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
- `src/commands/secrets.ts` - secrets push/pull commands (NEW)

## Secrets Management Module

`src/commands/secrets.ts` handles pushing and pulling secrets to/from the VPS.

**Commands:**
- `toss secrets push <env> --file <path>` - uploads local file to `/srv/<app>/.toss/secrets/<env>.env`
- `toss secrets pull <env> --file <path>` - downloads secrets to local file

**Key points:**
- Environment must be `production` or `preview` (not arbitrary env names like `pr-42`)
- Production secrets are base for production deployments
- Preview secrets are base for ALL non-production deployments
- Per-environment overrides are handled separately via deploy `-s` flag
- Supports `--file`, `-f`, and `--file=path` syntax
- Creates secrets directory if it doesn't exist (for push)
- Clear error messages with usage examples

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
    ├── secrets.ts           # Secrets push/pull (NEW)
    └── (other stubs)
```

## Scripts

- `bun run dev` - Run CLI in development
- `bun run test` - Run tests (172 passing)
- `bun run typecheck` - Type check
- `bun run build` - Build executables

## What's Next

1. **`toss deploy`** - the core deploy flow (main feature, all dependencies ready)
2. **`toss remove`** - tear down environments
3. **`toss list`** / **`toss status`** / **`toss logs`** / **`toss ssh`** - management commands
4. **Environment name validation** - needed by all commands accepting env names
