# Notepad

## Where We Are

CLI foundation, config loading, SSH, rsync, and systemd modules are complete. The project has:

- **Entry point**: `src/index.ts` → `src/cli.ts`
- **Command handlers**: `src/commands/*.ts` (init, deploy, remove, list, status, logs, ssh, secrets)
- **Config module**: `src/config.ts` - loads and validates `toss.json`
- **SSH module**: `src/ssh.ts` - remote command execution, connection testing, file operations
- **Rsync module**: `src/rsync.ts` - file sync with gitignore support and standard excludes
- **Systemd module**: `src/systemd.ts` - service management for deployments
- **Build system**: `bun run build` produces standalone executables for macOS (arm64, x64) and Linux (x64, arm64)

All commands are placeholder stubs that print "not implemented yet".

## Structure

```
src/
├── index.ts         # Entry point
├── cli.ts           # Argument parsing and command routing
├── config.ts        # Config loading and validation
├── config.test.ts   # Tests for config module
├── ssh.ts           # SSH connection and remote execution
├── ssh.test.ts      # Tests for SSH module
├── rsync.ts         # File sync to remote server
├── rsync.test.ts    # Tests for rsync module
├── systemd.ts       # Systemd service management
├── systemd.test.ts  # Tests for systemd module
└── commands/        # One file per command
    ├── init.ts
    ├── deploy.ts
    ├── remove.ts
    ├── list.ts
    ├── status.ts
    ├── logs.ts
    ├── ssh.ts
    └── secrets.ts
```

## Systemd Module

`src/systemd.ts` provides:
- `getServiceName()` / `getUnitFilePath()` - naming utilities (format: `toss-<app>-<env>`)
- `generateUnitFile()` - creates unit file content
- `createOrUpdateService()` - writes unit file and reloads daemon
- `startService()` / `stopService()` / `restartService()` - lifecycle control
- `enableService()` / `disableService()` - boot-time configuration
- `getServiceStatus()` - detailed status with PID, memory, uptime
- `serviceExists()` - check if service unit file exists
- `removeService()` - full teardown (stop, disable, remove, reload)
- `startOrRestartService()` - smart restart for deployments
- `reloadDaemon()` - reload systemd after config changes

Key decisions:
- Service name format: `toss-<app>-<env>` (systemd doesn't allow `::`)
- Unit file path: `/etc/systemd/system/toss-<app>-<env>.service`
- Unit file includes: Type=simple, Restart=always, RestartSec=5, WantedBy=multi-user.target
- All operations use SSH via the existing ssh module
- Error messages include the service name for clarity

## Scripts

- `bun run dev` - Run CLI in development
- `bun run test` - Run tests (32 passing)
- `bun run typecheck` - Type check
- `bun run build` - Build all executables to `dist/`

## What's Next

The next logical tasks are:
1. **Caddy config generation** - for reverse proxy setup
2. **Server provisioning** - initial VPS setup during `toss init`
3. **State management** - reading/writing `.toss/state.json`

These build on the modules we have.
