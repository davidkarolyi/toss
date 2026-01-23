# Notepad

## Where We Are

CLI foundation is complete. The project now has:

- **Entry point**: `src/index.ts` → `src/cli.ts`
- **Command handlers**: `src/commands/*.ts` (init, deploy, remove, list, status, logs, ssh, secrets)
- **Build system**: `bun run build` produces standalone executables for macOS (arm64, x64) and Linux (x64, arm64)

All commands are placeholder stubs that print "not implemented yet".

## Structure

```
src/
├── index.ts        # Entry point
├── cli.ts          # Argument parsing and command routing
└── commands/       # One file per command
    ├── init.ts
    ├── deploy.ts
    ├── remove.ts
    ├── list.ts
    ├── status.ts
    ├── logs.ts
    ├── ssh.ts
    └── secrets.ts
```

## Scripts

- `bun run dev` - Run CLI in development
- `bun run typecheck` - Type check
- `bun run build` - Build all executables to `dist/`

## What's Next

The next logical task is **config loading** - almost every command needs to find and parse `toss.json`. This unblocks deploy, list, status, secrets, logs, ssh, and remove commands.

After config loading, **SSH/rsync module** would be next since deploy and many other commands need it.
