# toss

A minimal CLI for deploying apps to a VPS with automatic preview environments.

---

## Philosophy

- No Docker
- No Kubernetes
- No complex configuration
- Single VPS
- Git-based workflow
- Encrypted secrets in repo
- Convention over configuration

---

## Installation

```bash
curl -fsSL https://toss.dev/install.sh | sh
```

## Built With

- **Bun** - bundled as a single executable
- **TypeScript** - type-safe CLI

---

## Commands

```bash
toss init                       # interactive setup wizard (local + VPS)
toss deploy [env] [commit]      # deploy (default: production, latest commit)
toss remove <env>               # remove an environment
toss list                       # list running deployments
toss logs [env]                 # tail logs
toss ssh [env]                  # SSH into server (optionally cd to env dir)
toss secrets edit <env>         # edit secrets for an environment
```

### Rollbacks

Deploy a specific commit:

```bash
toss deploy production abc123f
```

This makes rollbacks trivial — just deploy the previous commit.

---

## Config File

`toss.json` in repo root:

```json
{
  "server": "root@64.23.123.45",
  "domain": "myapp.com"
}
```

That's it. Everything else is convention.

---

## Directory Structure on Server

```
/srv/myapp/
├── production/           # production deployment
│   └── (app files)
├── pr-42/                # preview deployment
│   └── (app files)
└── pr-123/               # another preview
    └── (app files)
```

No separate data directories. Everything lives inside the release folder.

---

## Deploy Script

Single script that runs on every deploy: `.toss/deploy`

Takes raw synced files → running app.

```bash
#!/bin/bash
set -e

npm ci
npm run build

# ─────────────────────────────────────────────────────────────
# Examples (uncomment as needed)
# ─────────────────────────────────────────────────────────────

# Run database migrations
# npm run db:migrate

# Copy production database to preview environments
# if [ "$TOSS_ENV" != "production" ]; then
#   cp $TOSS_PROD_DIR/app.db $TOSS_RELEASE_DIR/app.db
# fi

# Seed preview with test data
# if [ "$TOSS_ENV" != "production" ]; then
#   npm run db:seed
# fi

# Generate prisma client
# npx prisma generate

# ─────────────────────────────────────────────────────────────
# Available environment variables:
#   TOSS_ENV         - environment name (production, pr-42, etc)
#   TOSS_APP         - app name from config
#   TOSS_PORT        - assigned port
#   TOSS_RELEASE_DIR - this release's directory
#   TOSS_PROD_DIR    - production release directory
# ─────────────────────────────────────────────────────────────
```

### Default Behavior

If `.toss/deploy` doesn't exist, toss runs:

```bash
npm ci
npm run build
```

---

## Environment Variables

Available in `.toss/deploy` script:

| Variable | Description | Example |
|----------|-------------|---------|
| `TOSS_ENV` | Environment name | `production`, `pr-42` |
| `TOSS_APP` | App name from config | `myapp` |
| `TOSS_PORT` | Assigned port | `3000`, `3001` |
| `TOSS_RELEASE_DIR` | This release's directory | `/srv/myapp/pr-42` |
| `TOSS_PROD_DIR` | Production directory | `/srv/myapp/production` |

---

## Port Assignment

Ports are assigned dynamically starting from 3000:

1. On deploy, scan existing deployments to find used ports
2. Assign next available port
3. Store port with the deployment

```
myapp-production → 3000
myapp-pr-42     → 3001  
myapp-pr-17     → 3002
```

No calculation, no collisions. Ports are discovered, not computed.

---

## Secrets Management

Custom encryption built into toss. Simple, no external dependencies.

### Files in Repo

```
.env.production   # encrypted, safe to commit
.env.preview      # encrypted, safe to commit (shared by all previews)
.env.keys         # private keys, gitignored
```

### Commands

```bash
toss secrets edit production    # decrypt → $EDITOR → re-encrypt
toss secrets edit preview       # same
```

### How It Works

1. `toss secrets edit production` decrypts `.env.production`, opens in your editor, re-encrypts on save
2. Encrypted files are committed to git
3. Team members get `.env.keys` file once (via 1Password, Slack, etc.)
4. CI has private keys as secrets

### Encryption

- AES-256-GCM for encryption
- Unique key per environment
- Public key embedded in encrypted file (safe to commit)
- Private key in `.env.keys` (never commit)

### File Format

`.env.production` (encrypted, committed):
```
#encrypted
PUBLIC_KEY=abc123...
DATA=<base64 encrypted blob>
```

`.env.keys` (gitignored):
```
TOSS_PRIVATE_KEY_PRODUCTION=xyz789...
TOSS_PRIVATE_KEY_PREVIEW=def456...
```

### Deploy Flow

```bash
toss deploy production
# Under the hood:
# 1. Read TOSS_PRIVATE_KEY_PRODUCTION from env or .env.keys
# 2. Decrypt .env.production
# 3. Inject variables into .toss/deploy
```

### CI Secrets Required

- `TOSS_PRIVATE_KEY_PRODUCTION` - for production deploys
- `TOSS_PRIVATE_KEY_PREVIEW` - for all preview deploys

---

## Init (Interactive Setup)

`toss init` handles everything — local config and VPS provisioning in one interactive flow.

```
$ toss init

┌─────────────────────────────────────┐
│  toss - deploy apps to your VPS    │
└─────────────────────────────────────┘

Server (user@host): root@64.23.123.45
Testing connection... ✓

Domain (optional): myapp.com

Setup GitHub Actions? [y/n]: y

──────────────────────────────────────
Setting up VPS...
──────────────────────────────────────

→ Installing Node.js 20...
→ Installing PM2...
→ Installing Caddy...
→ Creating directories...

──────────────────────────────────────
Creating local files...
──────────────────────────────────────

Created toss.json
Created .toss/deploy
Created .env.production (encrypted)
Created .env.preview (encrypted)
Created .env.keys (add to .gitignore)
Created .github/workflows/toss.yml

──────────────────────────────────────
Almost done!
──────────────────────────────────────

1. Add DNS records:
   A  myapp.com            → 64.23.123.45
   A  *.preview.myapp.com  → 64.23.123.45

2. Add GitHub secrets (Settings → Secrets → Actions):
   SSH_HOST                    64.23.123.45
   SSH_USER                    root
   SSH_KEY                     (contents of ~/.ssh/id_ed25519)
   TOSS_PRIVATE_KEY_PRODUCTION (from .env.keys)
   TOSS_PRIVATE_KEY_PREVIEW    (from .env.keys)

3. Edit secrets:
   toss secrets edit production

4. Deploy:
   toss deploy production

```

---

## Deploy Flow

```
$ toss deploy production

→ Syncing files...
→ Loading secrets...
→ Running .toss/deploy...
→ Starting app...
→ Configuring Caddy...

✓ https://myapp.com
```

### What Happens

1. `rsync` files to server (excluding node_modules, .git, .env.keys)
2. Decrypt secrets and inject into environment
3. SSH and run `.toss/deploy`
4. PM2 restart/start the app
5. Caddy config updated (if new environment)
6. Print URL

---

## Caddy Configuration

Auto-generated from running deployments:

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

---

## GitHub Actions

Generated by `toss init`:

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
        env:
          TOSS_PRIVATE_KEY_PRODUCTION: ${{ secrets.TOSS_PRIVATE_KEY_PRODUCTION }}
          TOSS_PRIVATE_KEY_PREVIEW: ${{ secrets.TOSS_PRIVATE_KEY_PREVIEW }}
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

---

## SSH Authentication

toss uses your existing SSH keys. No key management.

- Locally: Uses `~/.ssh/id_ed25519` or `~/.ssh/id_rsa`
- CI: SSH key stored in GitHub secrets

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

---

## Stateless Design

No state file. State is derived from reality:

- What's running? → Ask PM2
- What ports? → Read from PM2 process config
- What envs exist? → Look at `/srv/myapp/*/`

---

## Ignore Defaults

rsync excludes:

```
node_modules
.next
.git
.env.keys
.env*.local
.DS_Store
```

---

## Full Example Workflow

### Initial Setup (once)

```bash
# 1. Init (sets up local files AND VPS)
toss init

# 2. Add your secrets
toss secrets edit production
toss secrets edit preview

# 3. Commit
git add toss.json .toss/ .env.production .env.preview .github/
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
toss list                       # see what's running
toss logs production            # tail logs
toss logs pr-42 -n 100          # last 100 lines
toss ssh production             # SSH into server
toss remove pr-42               # remove preview
```

---

## What toss Doesn't Do

Intentionally excluded:

- Docker
- Kubernetes
- Multi-server / load balancing
- Database management (use your deploy script)
- Build caching
- Zero-downtime deploys

Keep it simple. One server, one app, just works.

---

## Tech Stack on Server

- **Node.js** (via nvm) - runtime
- **PM2** - process manager, restarts on crash, survives reboot
- **Caddy** - reverse proxy, auto-SSL, zero config

---

## Future Considerations

Maybe later, maybe never:

- `toss exec <command>` - run command on server
- `toss doctor` - diagnose issues
- Multiple apps per config
- Monorepo support (`"root": "apps/web"`)
- Custom domain per preview
