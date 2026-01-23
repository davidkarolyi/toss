# Notepad

## Where We Are

CLI foundation is complete with config loading, SSH, rsync, systemd, state management, Caddy config generation, server provisioning, origin verification, dependency tracking, deployment locking, and now the **`init` command**.

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
- `src/commands/init.ts` - interactive setup wizard (NEW)

## `toss init` Command

Interactive wizard that sets up both local config and VPS. Implemented in `src/commands/init.ts`.

**Flow:**
1. Check for existing `toss.json`, ask to overwrite if found
2. Prompt for server address (validates format, tests SSH connection, verifies elevated access)
3. Prompt for app name (validates format, checks for conflicts on server)
4. Prompt for optional domain (validates format)
5. Prompt for start command (for systemd)
6. Prompt for deploy commands (parses `&&` separated input into array)
7. Ask about GitHub Actions workflow generation
8. Run server provisioning (Caddy, directories, state.json, empty secrets files)
9. Write `toss.json`
10. Write `.github/workflows/toss.yml` if requested
11. Print final instructions (DNS if domain set, GitHub secrets if workflow set, secrets push, deploy)

**GitHub Actions workflow** (generated in init):
- Deploys `production` on push to main
- Deploys `pr-<number>` on pull requests
- Comments preview URL on PRs
- Removes preview environments when PRs close
- Uses sslip.io URLs if no domain configured

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
├── *.test.ts                # Tests for each module
└── commands/
    └── init.ts              # Interactive setup wizard (IMPLEMENTED)
    └── (other stubs)
```

## Scripts

- `bun run dev` - Run CLI in development
- `bun run test` - Run tests (137 passing)
- `bun run typecheck` - Type check
- `bun run build` - Build executables

## What's Next

1. **Port assignment** - deterministic port allocation from 3000+
2. **`toss secrets push/pull`** - secrets management commands
3. **`toss deploy`** - the core deploy flow
