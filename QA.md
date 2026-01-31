# QA Log

Date: 2026-01-30
Target VPS: root@46.224.227.195

## Summary
- Performed end-to-end QA on a clean VPS with two separate apps (`qaapp-one`, `qaapp-two`).
- Verified init, deploy/redeploy, preview environments, secrets, overrides, status/list/logs/ssh/remove, release cleanup, and persistence.
- Found and fixed two issues (see Bugs fixed).
- Noted a multi-app conflict in Caddy/sslip.io routing (see Known issues).

## Bugs fixed
1) **Runtime env missing PORT/TOSS_PORT in `.env`**
   - Impact: apps couldn’t reliably bind to the dynamically assigned port.
   - Fix: add runtime vars to `.env` during deploy and include `PORT` in deploy-script env.
   - Files: `src/commands/deploy.ts`

2) **Deploy-script env vars not applied when `cwd` is set**
   - Cause: env prefix applied before `cd`, so vars were scoped to `cd` only.
   - Fix: export env vars inside the same shell after `cd` so they apply to deploy commands.
   - Files: `src/ssh.ts`

## App 1: qaapp-one (Node)
- **Init**: `toss init` completed (no domain, no GitHub Actions).
- **Provisioning**: Caddy installed, directories and state created.
- **Dependencies**: nodejs installed on first deploy; skipped on subsequent deploys.
- **Secrets**: `toss secrets push production/preview` works; `toss secrets pull` verified.
- **Deploy production**: success, URL `https://production.46-224-227-195.sslip.io`.
- **Preview deploy**: `toss deploy pr-1 -s MESSAGE=hello-pr1` worked; overrides applied.
- **Override removal**: `toss deploy pr-1 -s MESSAGE=` removed override; preview reverted to base secrets.
- **Redeploy production**: succeeded; persistence verified via counter increment.
- **Persistence**: `persistentDirs: ["data"]` preserved `counter.txt` across releases.
- **Release cleanup**: keepReleases=2 → production had 2 releases; preview kept 1.
- **Commands**:
  - `toss list` shows environments, ports, and URLs.
  - `toss status` shows config, lock, deployments, and overrides.
  - `toss logs production -n 5` shows service output.
  - `toss ssh production` opens shell in `current/`.
  - `toss remove pr-1` removed preview and updated Caddy.
  - `toss remove production` correctly blocked.

## App 2: qaapp-two (Python)
- **Init**: `toss init` completed with GitHub Actions output generated.
- **No secrets pushed**: deploy showed warning and ran with empty `.env` (expected).
- **Deploy production**: success, URL `https://production.46-224-227-195.sslip.io`.
- **Deploy preview**: `toss deploy pr-2` succeeded.
- **Port assignment**: production used 3001 (3000 already in use); preview used 3002.
- **Deploy-script env**: confirmed `printenv PORT` writes `deploy-port.txt` with correct port after fix.
- **Commands**:
  - `toss list` / `toss status` show correct deployments and status.
  - `toss logs pr-2 -n 2` works.
  - `toss remove pr-2` removed preview cleanly.

## Server verification
- `/srv/qaapp-one` and `/srv/qaapp-two` directory structures match expected layout.
- `.toss/state.json` updated with deployments and ports per app.
- `.env` files in current releases include `PORT` and `TOSS_PORT`.
- Caddy config updated on deploy/remove; URLs reachable over HTTPS.

## Known issues / limitations found
- **Multiple apps on same VPS with sslip.io conflict in Caddy**: deploying a second app overwrites `/etc/caddy/Caddyfile`, so `production.<ip>.sslip.io` only points to the last deployed app. Both systemd services stay up, but only one is reachable via Caddy unless custom domains or a merged Caddy config are used.

## Remaining QA ideas (optional)
- Simulate stale lock recovery by leaving a lock in place and retrying deploy.
- Domain add-on test (user requested next).
- Restart VPS and verify services auto-start (user planned).

## Post-QA changes (not revalidated on VPS yet)
- Renamed production environment to `prod` everywhere.
- Added per-app Caddy config includes and app-scoped hostnames (sslip and custom domains).

Date: 2026-01-31
Target VPS: root@46.224.227.195
Scope: Post-change QA for `prod` naming + multi-app Caddy/app-scoped hostnames

## Summary
- Reset VPS state (removed prior QA apps under `/srv/qaapp-one` and `/srv/qaapp-two`).
- Stopped and removed leftover `toss-*-production` systemd services from earlier QA (they were still bound to ports 3000/3001).
- Verified `prod` environment naming end-to-end (init, deploy, remove protections).
- Verified per-app Caddy config (`/etc/caddy/Caddyfile` import + `/etc/caddy/caddy.d/<app>.caddy`) and app-scoped sslip hostnames.
- Exercised deploy/redeploy, previews, secrets, overrides, list/status/logs/ssh/remove, lock recovery, persistence, release cleanup, and port assignment.
- Verified deploy-script env injection (`TOSS_ENV`, `PORT`) and runtime `.env` includes `PORT`/`TOSS_PORT`.
- Could not run `toss secrets pull` locally due to exec policy; validated secrets on server instead.

## App 1: qaapp-one (Node)
- **Init**: `toss init` completed (no domain, no GitHub Actions). Caddy already installed; state initialized.
- **Config**: Added `dependencies.nodejs`, `persistentDirs: ["data"]`, `keepReleases: 2`.
- **Secrets**: `toss secrets push prod/preview` succeeded.
- **Deploy prod**: success, URL `https://prod.qaapp-one.46-224-227-195.sslip.io`.
- **Preview deploy**: `toss deploy pr-1 -s MESSAGE=override-pr1` worked; override applied.
- **Override removal**: `toss deploy pr-1 -s MESSAGE=` removed override; preview reverted to base secrets.
- **Redeploy prod**: succeeded; counter persisted (`/counter` from 1 → 2).
- **Deploy-script env**: `deploy-env.txt` = `prod`, `deploy-port.txt` = `3002`, `deploy-message.txt` = `hello-prod-one`.
- **Release cleanup**: `keepReleases=2` → prod kept 2 releases; preview kept 1.
- **Lock recovery**: injected stale lock in `/srv/qaapp-one/.toss/state.json`; deploy logged `Previous lock was stale` and continued.
- **Commands**:
  - `toss list` shows prod + preview URLs.
  - `toss status` shows overrides for preview.
  - `toss logs prod -n 5` works.
  - `toss ssh prod` lands in `/srv/qaapp-one/prod/current`.
  - `toss remove pr-1` removed preview and overrides; `toss remove prod` blocked as expected.

## App 2: qaapp-two (Python)
- **Init**: `toss init` completed with GitHub Actions file created.
- **Config**: `persistentDirs: ["data"]`, `keepReleases: 2`.
- **Secrets**: `toss secrets push prod/preview` succeeded.
- **Deploy prod**: success, URL `https://prod.qaapp-two.46-224-227-195.sslip.io`.
- **Deploy preview**: `toss deploy pr-2` worked; then removed with `toss remove pr-2`.
- **Redeploy prod**: succeeded; counter persisted (`/counter` from 1 → 2).
- **Commands**:
  - `toss list` / `toss status` show prod deployment.
  - `toss logs pr-2 -n 3` works.

## Multi-app Caddy routing
- Main `/etc/caddy/Caddyfile`:
  - `# Managed by toss` + `import /etc/caddy/caddy.d/*.caddy`.
- Per-app configs:
  - `/etc/caddy/caddy.d/qaapp-one.caddy` routes `prod.qaapp-one.<ip>.sslip.io` → port 3002.
  - `/etc/caddy/caddy.d/qaapp-two.caddy` routes `prod.qaapp-two.<ip>.sslip.io` → port 3004.
- Verified both apps reachable concurrently via curl over HTTPS.

## Server verification
- `/srv/<app>` structure matches expected layout (releases/current/preserve + `.toss/`).
- `.toss/state.json` contains correct ports, origin, dependencies; lock cleared after deploy.
- `ss -tlnp` shows Node and Python bound on assigned ports.

## Limitations / notes
- `toss secrets pull` could not be executed locally due to exec policy restrictions. Verified secrets content directly on server (`/srv/<app>/.toss/secrets/*.env`).
- `TOSS_ENV` is not present in runtime `.env` (expected based on docs; only `PORT`/`TOSS_PORT` injected for runtime, full env available in deploy script).

## Current state on VPS
- Running:
  - `toss-qaapp-one-prod` on port 3002 → `https://prod.qaapp-one.46-224-227-195.sslip.io`
  - `toss-qaapp-two-prod` on port 3004 → `https://prod.qaapp-two.46-224-227-195.sslip.io`
- Preview envs removed.

Date: 2026-01-31
Target VPS: root@46.224.227.195
Scope: Post-restart verification

## Restart verification
- Confirmed services auto-started after reboot:
  - `toss-qaapp-one-prod` active (PID 764).
  - `toss-qaapp-two-prod` active (PID 765).
  - `caddy` active.
- Confirmed HTTPS routing works after reboot:
  - `https://prod.qaapp-one.46-224-227-195.sslip.io/env`
  - `https://prod.qaapp-two.46-224-227-195.sslip.io/env`
- Confirmed persistence across reboot:
  - `qaapp-one /counter` advanced to 3.
  - `qaapp-two /counter` advanced to 3.

Date: 2026-01-31
Scope: Domain switch to infrajs.com

## Domain update
- Updated `toss.json` for both QA apps to use `domain: "infrajs.com"`.
- Redeployed prod to refresh Caddy configs.
- New prod URLs:
  - `https://prod.qaapp-one.infrajs.com`
  - `https://prod.qaapp-two.infrajs.com`

## DNS records required (Cloudflare)
- `A` record: `*.qaapp-one.infrajs.com` → `46.224.227.195` (DNS only / gray cloud)
- `A` record: `*.qaapp-two.infrajs.com` → `46.224.227.195` (DNS only / gray cloud)

Date: 2026-01-31
Scope: Domain QA (infrajs.com) continued

## DNS + HTTPS verification
- `dig` resolution confirmed:
  - `prod.qaapp-one.infrajs.com` → `46.224.227.195`
  - `prod.qaapp-two.infrajs.com` → `46.224.227.195`
- HTTPS confirmed:
  - `https://prod.qaapp-one.infrajs.com/env`
  - `https://prod.qaapp-two.infrajs.com/env`

## Preview under custom domain
- Deployed `pr-5` for qaapp-one with override `MESSAGE=domain-pr5`.
- Verified `https://pr-5.qaapp-one.infrajs.com/env` returns expected message and port.
- Removed `pr-5`; subsequent HTTPS request fails (no host configured), as expected.

Date: 2026-01-31
Scope: Interrupted deploy + retry

## Interrupted deploy handling
- Temporarily added `sleep 30` to qaapp-one `deployScript` to create an interrupt window.
- Started `toss deploy pr-9` and interrupted during `sleep 30` (Ctrl+C).
- Observed on server:
  - `state.json` retained lock for `pr-9` with host/pid.
  - `pr-9` directory created with `releases/` and `preserve/`, but no `current` symlink.
- Retried `toss deploy pr-9` immediately:
  - CLI reported `Previous lock holder process is no longer running` and continued.
  - Deploy completed successfully and `current` was set.
- Removed `pr-9` after verification.
- Restored original `deployScript` (removed sleep).

Date: 2026-01-31
Scope: Interrupted rsync + concurrent deploys

## Network drop (rsync killed)
- Created a 1GB file locally to ensure rsync ran long enough.
- Started `toss deploy pr-11` and force‑killed the local `rsync` process mid‑sync.
- Deploy failed with `File sync failed.` (expected).
- Verified:
  - Lock was released (`state.json` shows `lock: null`).
  - `pr-11` env dir existed with `releases/` + `preserve/`, but no `current`.
- Retried `toss deploy pr-11` immediately → succeeded with port 3001.
- Removed `pr-11` afterward.

## Concurrent deploys (lock contention)
- Temporarily added `sleep 20` to `deployScript` for qaapp-one to hold the lock.
- Started `toss deploy pr-12`; while sleeping, ran a second deploy to `pr-12`.
- Second deploy failed with a clear lock error showing host/pid and age.
- First deploy finished successfully; removed `pr-12` afterward.
- Restored original `deployScript` (removed sleep).

## Cleanup
- Removed preview envs `pr-10`, `pr-11`, `pr-12`.
- Deleted the large local test file used to slow rsync.

Date: 2026-01-31
Scope: DX features smoke test

## Status expected URLs
- `toss status` now shows expected prod + preview URL patterns in the Configuration section.

## Logs flags
- `toss logs prod --since "1 hour ago" -n 2` works (note: `1h` is not accepted by journalctl on this host).
- `toss logs prod -n 2 --follow` streams last 2 lines then follows (Ctrl+C to exit).

## Secrets pull default
- `toss secrets pull prod` saves to `.env.prod` by default and prints the chosen path.
