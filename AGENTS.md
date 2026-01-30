# toss

A minimal CLI for deploying apps to a VPS with automatic preview environments.

## Philosophy

- No Docker
- No Kubernetes
- No complex configuration
- Single VPS
- Git-based workflow
- Convention over configuration
- Runtime-agnostic

## Installation

```bash
curl -fsSL https://toss.dev/install.sh | sh
```

## Commands

```bash
toss init                              # interactive setup wizard (local + VPS)
toss deploy <env>                      # deploy to environment (e.g., production, pr-42)
toss deploy <env> -s KEY=VALUE         # deploy with per-environment secret override
toss remove <env>                      # remove an environment (production cannot be removed)
toss list                              # list running deployments
toss status                            # status summary (config + deployments + overrides)
toss logs <env>                        # tail logs for environment
toss logs <env> -n 100                 # show last 100 lines
toss ssh <env>                         # SSH into server, cd to environment directory
toss secrets push <env> --file <file>  # push secrets (env: production or preview)
toss secrets pull <env> --file <file>  # pull secrets from VPS
```

All commands require explicit arguments—no defaults. This keeps deployments predictable.

### Rollbacks

toss deploy always deploys your current working directory.
To roll back, check out the previous commit locally and deploy again:

```bash
git checkout abc123f
toss deploy production
```

## Config File

`toss.json` in repo root:

```json
{
  "app": "myapp",
  "server": "root@64.23.123.45",
  "domain": "myapp.com",
  "startCommand": "npm start",
  "deployScript": [
    "npm ci",
    "npm run build"
  ],
  "dependencies": {
    "nodejs": "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs",
    "bun": "curl -fsSL https://bun.sh/install | bash"
  }
}
```

Fields:
- `app` (required): app name (used for directories and service names)
- `server` (required): SSH target (e.g., `root@64.23.123.45`, `root@64.23.123.45:2222`, or IPv6 `root@[::1]:2222`)
- `domain` (optional): public domain; if omitted, toss uses sslip.io URLs (e.g., `production.64-23-123-45.sslip.io`)
- `startCommand` (required): command to start the app (used in systemd unit file)
- `deployScript` (required): array of commands run on every deploy
- `dependencies` (optional): named install commands that run once per server (toss tracks what was applied)

`app` and `domain` are independent; toss does not derive one from the other.
There is no local `.toss/` folder; all config lives in `toss.json`. Server state is stored in `/srv/<app>/.toss/`.

## Environment Naming Rules

- Lowercase letters, numbers, and hyphens only (`a-z`, `0-9`, `-`)
- Must start with a letter
- Max 63 characters (DNS label safe)
- `production` is reserved for the production environment

## Directory Structure on Server

```
/srv/myapp/
├── .toss/
│   ├── state.json          # ports, applied dependencies, lock, origin
│   └── secrets/
│       ├── production.env  # production secrets (base)
│       ├── preview.env     # preview secrets (base, shared by all non-production)
│       └── overrides/
│           ├── pr-42.env   # per-environment overrides (merged with base)
│           └── pr-123.env
├── production/             # production deployment
│   └── (app files)
├── pr-42/                  # preview deployment
│   └── (app files)
└── pr-123/                 # another preview
    └── (app files)
```

All toss-managed state lives in `.toss/`. Deployment directories contain only app files.

### State File

`.toss/state.json` tracks ports, dependencies, deployment lock, and project origin:

```json
{
  "origin": "git@github.com:user/myapp.git",
  "deployments": {
    "production": { "port": 3000 },
    "pr-42": { "port": 3001 }
  },
  "appliedDependencies": ["nodejs", "bun"],
  "lock": null
}
```

The `origin` field stores the git remote URL from the first init. On subsequent deploys, toss verifies the origin matches to prevent accidental overwrites from different projects with the same app name.

The `lock` field prevents concurrent deploys (see Deployment Locking).

## Deploy Commands (deployScript)

Commands that run on every deploy are stored in `toss.json` under `deployScript`.
They run after files are synced and secrets are copied.

```bash
npm ci
npm run build
# npm run db:migrate
# npm run db:seed
```

## Server Setup and Dependencies

The optional `dependencies` config field controls server-wide setup:

- `dependencies`: named install commands that run once per server, before deploys we make sure all dependencies are installed.

toss records which dependencies have already been applied on the server, so they
do not re-run on every deploy.

## Environment Variables

Available in `deployScript` commands (secrets are also injected):

| Variable           | Description                | Example                 |
| ------------------ | -------------------------- | ----------------------- |
| `TOSS_ENV`         | Environment name           | `production`, `pr-42`   |
| `TOSS_APP`         | App name from config       | `myapp`                 |
| `TOSS_PORT`        | Assigned port              | `3000`, `3001`          |
| `TOSS_RELEASE_DIR` | This release's directory   | `/srv/myapp/pr-42`      |
| `TOSS_PROD_DIR`    | Production directory       | `/srv/myapp/production` |

User secrets from the secrets file are also injected into the environment.

## Port Assignment

Ports are assigned dynamically starting from 3000:

1. On deploy, read `.toss/state.json` to find ports already assigned by toss
2. Check which ports are actually in use on the server (via `ss -tlnp`)
3. Assign the next available port that is both untracked and unused
4. Update `state.json` before starting systemd service

```
toss-myapp-production → 3000
toss-myapp-pr-42      → 3001
toss-myapp-pr-17      → 3002
```

This prevents collisions both within toss-managed deployments and with other services on the server.

## Deployment Locking

To prevent race conditions from concurrent deploys, toss uses a lock stored in `state.json`:

```json
{
  "lock": {
    "environment": "pr-42",
    "host": "user@laptop.local",
    "pid": 12345,
    "startedAt": "2024-01-23T10:00:00Z"
  }
}
```

### How It Works

1. Before deploying, toss attempts to acquire a lock
2. If locked by another process, toss checks if the lock is stale:
   - Lock older than 30 minutes → considered stale, can be broken
   - Lock holder process is dead → can be broken
3. If lock is active, deploy fails with a clear message showing who holds it
4. After deploy completes (success or failure), lock is released

### Recovery

If a deploy is interrupted (Ctrl+C, network failure, crash), the lock may remain. The next deploy will:
- Check if the lock is stale (>30 min old)
- Attempt to verify if the locking process is still alive
- Break stale locks automatically
- For fresh locks from a dead process, prompt for manual confirmation

```
⚠ Deploy locked by user@laptop.local (pid 12345) since 10:00:00
  Lock appears stale. Breaking lock and continuing...
```

## Service Names

systemd services are named using a prefix and delimiter:

`toss-<app>-<env>`

For example: `toss-myapp-production`, `toss-myapp-pr-42`

Service unit files are stored at `/etc/systemd/system/toss-<app>-<env>.service`.

### Example Unit File

```ini
[Unit]
Description=toss-myapp-production
After=network.target

[Service]
Type=simple
WorkingDirectory=/srv/myapp/production
EnvironmentFile=/srv/myapp/production/.env
ExecStart=npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

The `ExecStart` is derived from the `startCommand` in `toss.json`.

## Secrets Management

Secrets are stored on the VPS, not in the repository.

### Files on Server

```
/srv/myapp/.toss/secrets/
├── production.env    # base secrets for production
├── preview.env       # base secrets for all non-production environments
└── overrides/
    ├── pr-42.env     # overrides for pr-42 (merged with preview.env)
    └── staging.env   # overrides for staging (merged with preview.env)
```

### Commands

```bash
toss secrets push production --file .env.local   # push local file as production secrets
toss secrets push preview --file .env.local      # push local file as preview secrets
toss secrets pull production --file .env         # download production secrets to local file
```

### How It Works

1. Push base secrets once per type using `toss secrets push` (production or preview)
2. Base secrets are stored at `/srv/<app>/.toss/secrets/<type>.env`
3. On deploy, toss merges base secrets + environment overrides into `.env`
   - Production uses `production.env` + `overrides/production.env` (if exists)
   - Non-production uses `preview.env` + `overrides/<env>.env` (if exists)
   - Overrides take precedence over base secrets

### Per-Environment Overrides

Use the `--secret` / `-s` flag on deploy to set per-environment overrides:

```bash
toss deploy pr-42 --secret DATABASE_URL=postgres://db/pr_42_branch
toss deploy pr-42 -s DATABASE_URL=postgres://db/pr_42 -s DEBUG=true
```

Overrides are **persistent**—they're saved on the server and apply to all future deploys of that environment. To remove an override, set it to empty:

```bash
toss deploy pr-42 -s DEBUG=
```

### Use Case: Per-PR Databases

When each preview needs its own database:

```bash
# Shared preview secrets (API keys, etc.)
toss secrets push preview --file .env.preview

# First deploy of pr-42 with its own database
toss deploy pr-42 -s DATABASE_URL=postgres://db/pr_42_branch

# Subsequent deploys automatically use the saved override
toss deploy pr-42
```

### Team Workflow

1. One team member pushes initial base secrets
2. Other team members pull secrets if needed locally: `toss secrets pull`
3. Use `-s KEY=VALUE` on deploy for environment-specific overrides
4. To update base secrets: edit locally, then push again

### CI Setup

CI needs SSH access to the server. Secrets are already on the VPS, so no secret keys needed in CI environment variables.

### Empty Secrets

During init, toss creates empty `production.env` and `preview.env` files. If you deploy without pushing secrets, toss will warn you:

```
⚠ No secrets found. Your app will start with an empty .env file.
  Push secrets with: toss secrets push production --file .env.local
```

The deploy continues with an empty `.env` to avoid blocking CI pipelines.

## Init (Interactive Setup)

`toss init` handles everything — local config and VPS provisioning in one interactive flow.

```
$ toss init

┌─────────────────────────────────────┐
│  toss - deploy apps to your VPS    │
└─────────────────────────────────────┘

Server (user@host): root@64.23.123.45
Testing connection... ✓
App name: myapp

Domain (optional): myapp.com
Start command: npm start
Deploy commands (deployScript): npm ci && npm run build

Setup GitHub Actions? [y/n]: y

──────────────────────────────────────
Setting up VPS...
──────────────────────────────────────

→ Installing Caddy...
→ Creating directories...

──────────────────────────────────────
Creating local files...
──────────────────────────────────────

Created toss.json
Created .github/workflows/toss.yml

──────────────────────────────────────
Almost done!
──────────────────────────────────────

1. If you set a domain, add DNS records:
   A  myapp.com            → 64.23.123.45
   A  *.preview.myapp.com  → 64.23.123.45

2. Add GitHub secrets (Settings → Secrets → Actions):
   SSH_HOST     64.23.123.45
   SSH_USER     root
   SSH_KEY      (contents of ~/.ssh/id_ed25519)

3. Push your secrets:
   toss secrets push production --file .env.local
   toss secrets push preview --file .env.local

4. Deploy:
   toss deploy production
```

Note: VPS provisioning requires root or passwordless sudo access.

## Deploy Flow

```
$ toss deploy production

→ Acquiring lock...
→ Syncing files...
→ Applying dependencies...
→ Loading secrets...
→ Running deploy script
  $ npm ci
  $ npm run build
→ Starting service...
→ Configuring Caddy...
→ Releasing lock...

✓ https://myapp.com
```

Without a custom domain:
```
✓ https://production.64-23-123-45.sslip.io
```

### What Happens

1. Acquire deployment lock (prevents concurrent deploys)
2. `rsync` files to server (excluding node_modules, .git, gitignored files, etc.)
3. Apply any missing server dependencies
4. Merge secrets (base + overrides) into deployment directory as `.env`
5. Run `deployScript` commands in the deployment directory (aborts on first failure)
6. Generate/update systemd unit file, reload systemd, restart service
7. Regenerate Caddy config and reload
8. Release lock
9. Print URL

### Resiliency

The deploy flow is designed to be resilient to interruptions:
- Each step is idempotent (safe to retry)
- State is updated atomically where possible
- Locks have automatic timeout recovery
- Failed deploys leave clear error messages
- Re-running `toss deploy` after a failure will resume correctly

## Caddy Configuration

Auto-generated from deployments on disk.

### With Custom Domain

```
# /etc/caddy/Caddyfile

myapp.com {
    reverse_proxy localhost:3000
}

pr-42.preview.myapp.com {
    reverse_proxy localhost:3001
}

pr-123.preview.myapp.com {
    reverse_proxy localhost:3002
}
```

Caddy handles SSL automatically via Let's Encrypt.

### Without Custom Domain (sslip.io)

When no domain is configured, toss uses [sslip.io](https://sslip.io/) for automatic DNS:

```
# /etc/caddy/Caddyfile (server IP: 64.23.123.45)

production.64-23-123-45.sslip.io {
    reverse_proxy localhost:3000
}

pr-42.64-23-123-45.sslip.io {
    reverse_proxy localhost:3001
}
```

sslip.io provides wildcard DNS that maps any subdomain to the embedded IP address. This means:
- No DNS configuration required
- Works immediately after deploy
- Each environment gets a unique, shareable URL
- Caddy still handles SSL via Let's Encrypt

IPv6 is supported by replacing `:` with `-` and using only dashes:
```
production.--1.sslip.io
staging.2a01-4f8-c17-b8f--2.sslip.io
```

## GitHub Actions

Generated by `toss init`.

If a domain is configured, preview URLs use `pr-<number>.preview.<domain>`.
If no domain is configured, preview URLs use sslip.io (`pr-<number>.<ip>.sslip.io`).

`.github/workflows/toss.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  pull_request:
  pull_request_target:
    types: [closed]

jobs:
  deploy:
    if: github.event.action != 'closed'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.SSH_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          ssh-keyscan ${{ secrets.SSH_HOST }} >> ~/.ssh/known_hosts

      - name: Install toss
        run: curl -fsSL https://toss.dev/install.sh | sh

      - name: Deploy
        run: |
          if [ "${{ github.event_name }}" = "pull_request" ]; then
            toss deploy pr-${{ github.event.pull_request.number }}
          else
            toss deploy production
          fi

      - name: Comment preview URL
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '🚀 Preview: https://pr-${{ github.event.pull_request.number }}.preview.${{ vars.DOMAIN }}'
            })

  cleanup:
    if: github.event.action == 'closed'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.SSH_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          ssh-keyscan ${{ secrets.SSH_HOST }} >> ~/.ssh/known_hosts

      - name: Install toss
        run: curl -fsSL https://toss.dev/install.sh | sh

      - name: Remove preview
        run: toss remove pr-${{ github.event.pull_request.number }}
```

## SSH Authentication

toss uses your existing SSH keys. No key management.

- Locally: Uses `~/.ssh/id_ed25519` or `~/.ssh/id_rsa`
- CI: SSH key stored in GitHub secrets

### Elevated Access Required

All toss operations require root or passwordless sudo access because they need to:
- Write to `/srv/<app>/` (system directory)
- Manage systemd services (`systemctl`)
- Edit `/etc/caddy/Caddyfile` and reload Caddy
- Install packages during provisioning (`apt-get`)

If SSH fails:

```
$ toss init

Server (user@host): root@64.23.123.45
Testing connection... ✗ Connection refused

Troubleshooting:
  1. Can you run: ssh root@64.23.123.45
  2. If not, copy your key: ssh-copy-id root@64.23.123.45
  3. Then try again
```

## Stateless Design

State is derived from the server:

- What envs exist? → Look at `/srv/myapp/*/` (excluding `.toss/`)
- What ports? → Read `.toss/state.json`
- What dependencies applied? → Read `.toss/state.json`
- What should be routed? → Generate Caddyfile from state

## Ignore Defaults

rsync excludes:

```
node_modules
.next
.git
.env*
.DS_Store
```

## Full Example Workflow

### Initial Setup (once)

```bash
# 1. Init (sets up local files AND VPS)
toss init

# 2. Push your secrets
toss secrets push production --file .env.local
toss secrets push preview --file .env.local

# 3. Commit
git add toss.json .github/
git commit -m "Add toss"
git push
```

### Daily Development

```bash
# Push to main → auto deploys to production
git push origin main

# Open PR → auto deploys preview
# Preview URL commented on PR

# Merge/close PR → preview auto-removed
```

### Manual Deploy

```bash
toss deploy production
toss deploy pr-42
```

### Manage

```bash
toss list                                  # see what's running
toss status                                # status summary (includes overrides)
toss logs production                       # stream logs
toss logs pr-42 -n 100                     # last 100 lines
toss ssh production                        # SSH into deployment dir
toss remove pr-42                          # remove preview
toss deploy pr-42 -s DATABASE_URL=...      # deploy with override
```

## What toss Doesn't Do

Intentionally excluded:

- Docker
- Kubernetes
- Multi-server / load balancing
- Database management (use your deployScript commands)
- Build caching
- Zero-downtime deploys

Keep it simple. One server, one app, just works.

## Tech Stack on Server

- **systemd** - process manager, restarts on crash, survives reboot (already on all Linux systems)
- **Caddy** - reverse proxy, auto-SSL, zero config

toss is runtime-agnostic. Your `deployScript` commands and server dependencies handle whatever runtime your app needs (Node.js, Bun, Python, Go, etc.).

## Future Considerations

Maybe later, maybe never:

- `toss exec <command>` - run command on server
- `toss doctor` - diagnose issues
- Multiple apps per config
- Monorepo support (`"root": "apps/web"`)
- Custom domain per preview
