[x] Set up a Bun + TypeScript CLI foundation. Create a simple entry point that parses arguments and routes to command handlers. Organize modules per command under a clear folder structure. Configure Bun's bundler to produce standalone executables for macOS and Linux. Don't add any external CLI framework since the command set is small and Bun can handle everything out of the box. Browse the bun docs if needed.

[x] Implement config loading. Every command except `init` needs to find and parse `toss.json` by searching the current directory and its parents. The directory containing `toss.json` is considered the repo root and will be the rsync source for deploys. Required fields are `app`, `server`, `startCommand`, and `deployScript`. Optional fields are `domain` and `dependencies`. The `server` field supports custom SSH ports (e.g., `root@host:2222`). The `deployScript` is stored as an array of strings. Keep `app` and `domain` completely independent—never derive one from the other. If no config is found, exit with a helpful error telling the user to run `toss init`.

[x] Build a reusable SSH and rsync module. Use the system's `ssh` binary and respect the user's existing SSH config and keys. Parse the server string to extract host, user, and optional port (format: `user@host` or `user@host:port`). Provide helpers for running remote commands and streaming their output back. Implement an rsync wrapper that excludes `node_modules`, `.git`, `.next`, `.DS_Store`, `.env*`, and gitignored files. For gitignore support, either use rsync's `--filter=':- .gitignore'` flag or build a utility that reads .gitignore files and generates exclude patterns—whichever is simpler and more reliable. Surface connection failures with clear, actionable error messages.

[ ] Build a systemd module for process management. Create service unit files at `/etc/systemd/system/toss-<app>-<env>.service`. The service name format is `toss-<app>-<env>` (systemd doesn't allow `::` in unit names). Implement start, restart, stop, enable, disable, and status operations. Generate unit files with: `Type=simple`, `WorkingDirectory` set to the deployment folder, `EnvironmentFile` pointing to the `.env` file, `ExecStart` from the `startCommand` config field, `Restart=always`, `RestartSec=5`, and `WantedBy=multi-user.target`. All systemd actions run over SSH via `systemctl` and should report errors clearly.

[ ] Implement Caddy config generation from state. Read `.toss/state.json` to get all deployments and their ports. When a custom domain is configured: production gets the bare domain, non-production environments get `<env>.preview.<domain>`. When no domain is configured: use sslip.io URLs in the format `<env>.<ip-with-dashes>.sslip.io` (e.g., `production.64-23-123-45.sslip.io`, `pr-42.64-23-123-45.sslip.io`). Extract the IP from the server config. Write to `/etc/caddy/Caddyfile` and reload Caddy after changes. Ensure Caddy is running before reloading (start it if needed). The entire Caddy management flow should be resilient—if Caddy reload fails, report the error clearly but don't crash.

[ ] Implement server provisioning. This runs during `toss init` on a fresh VPS. Install Caddy as the reverse proxy (systemd is already available on all modern Linux systems). Create the app directory at `/srv/<app>/` and the toss state directory at `/srv/<app>/.toss/` (including `.toss/secrets/` and `.toss/secrets/overrides/`). Create empty `production.env` and `preview.env` files in the secrets directory. Initialize `.toss/state.json` with: empty deployments, empty appliedDependencies, null lock, and the git origin URL from the local repo (for collision detection). Make sure provisioning is idempotent so running it twice doesn't break anything. Provisioning requires root or passwordless sudo—make this clear in the wizard and verify during SSH test.

[ ] Implement project origin tracking and collision detection. During init, store the git remote origin URL in `.toss/state.json` under an `origin` field. On every deploy, verify the local repo's origin matches the stored origin. If they don't match, abort with a clear error explaining that a different project with the same app name is already deployed. This prevents accidental overwrites when two repos use the same `app` name.

[ ] Implement server dependency tracking. The config may include a `dependencies` field, which is a map of names to install commands. These are for things like runtime installations that should only run once per server, not on every deploy. Track applied dependencies in `.toss/state.json` under `appliedDependencies`. Before each deploy, check for missing dependencies and run only those. Fail fast if any dependency command fails.

[ ] Implement deployment locking. Before any deploy operation, acquire a lock in `.toss/state.json`. The lock object contains: `environment` (which env is being deployed), `host` (hostname of the machine doing the deploy), `pid` (process ID), and `startedAt` (ISO timestamp). If a lock exists, check if it's stale: locks older than 30 minutes are considered stale and can be broken automatically. For fresher locks, attempt to verify if the locking process is still alive (if same host). If the lock is active and valid, abort with a clear message showing who holds it. Always release the lock after deploy completes (success or failure). Handle lock release in a finally block or signal handler to minimize orphaned locks.

[ ] Build the `init` command as an interactive wizard. Prompt for the server address first (format: `user@host` or `user@host:port`) and test the SSH connection before proceeding—verify both connectivity and elevated access (root or sudo). Ask for the app name and validate it doesn't conflict with an existing project on the server. Ask for an optional domain, the `startCommand` (how to start the app for systemd), and the `deployScript` commands. For deployScript, accept input as a single line with `&&` separators or multiple lines, then parse and store as an array. Ask whether to generate a GitHub Actions workflow. Then provision the server and write `toss.json` with all collected values. At the end, print DNS instructions only if a domain was provided (including the wildcard for previews), plus GitHub secrets instructions for CI setup. Each step should have an expressive description and instructions. In case of errors, give hints on how to fix them.

[ ] Implement `toss secrets push`. This command uploads a local environment file to the VPS. It takes a positional environment argument (`production` or `preview`) and a required `--file` flag for the local file path. Example: `toss secrets push production --file .env.local`. Upload the file to `/srv/<app>/.toss/secrets/<env>.env`, creating the directory if it doesn't exist. Remember that during deploys, production uses `production.env` and all non-production environments use `preview.env` as their base.

[ ] Implement `toss secrets pull`. This command downloads secrets from the VPS to a local file. It takes a positional environment argument (`production` or `preview`) and a required `--file` flag for the local destination path. Example: `toss secrets pull production --file .env`. Read `/srv/<app>/.toss/secrets/<env>.env` from the server and write it to the specified local path. Preserve file contents exactly and fail with a clear error if the secrets file doesn't exist.

[ ] Implement deterministic port assignment. Ports start at 3000 and increment. Read existing ports from `.toss/state.json` to find ports already assigned by toss. Additionally, check which ports are actually in use on the server using `ss -tlnp` (or `netstat -tlnp` as fallback). Assign the next available port that is both untracked in state.json AND not in use on the server. Always update `state.json` before touching systemd, so every deployment has a port recorded even if the service isn't running yet.

[ ] Implement `toss deploy`. This is the core command. It takes a required environment name (e.g., `production`, `pr-42`). No defaults—users must be explicit. Always deploys the current working directory. Use the repo root (directory containing `toss.json`) as the rsync source.

Supports `--secret` / `-s` flag for per-environment secret overrides:
- `toss deploy pr-42 -s DATABASE_URL=postgres://... -s DEBUG=true`
- Overrides are persistent: saved to `/srv/<app>/.toss/secrets/overrides/<env>.env`
- Setting a key to empty removes it: `-s DEBUG=`
- Overrides apply to all future deploys of that environment

The deploy flow is:
1. Acquire deployment lock (abort if locked by active process)
2. Verify project origin matches stored origin (abort if mismatch)
3. If `-s` flags provided, update the override file on server
4. Rsync files to `/srv/<app>/<env>/` with standard excludes
5. Apply any missing server dependencies (updating state.json, fail fast on error)
6. Merge secrets: read base secrets (production.env or preview.env) + environment overrides, write to `.env` in deployment directory. If base secrets file is empty/missing, warn but continue with empty .env
7. Resolve or assign a port, persist to state.json before starting service
8. Run `deployScript` commands in the deployment directory via SSH. Environment variables available: user secrets from .env plus `TOSS_ENV`, `TOSS_APP`, `TOSS_PORT`, `TOSS_RELEASE_DIR`, `TOSS_PROD_DIR`. Abort on first command failure.
9. Generate/update systemd unit file, daemon-reload, enable for auto-start
10. Start or restart the systemd service
11. Regenerate Caddy config (using domain or sslip.io) and reload
12. Release lock
13. Print the deployment URL

The command must be idempotent and resilient to interruptions. Re-running after a failure should recover gracefully.

[ ] Implement `toss remove`. This command tears down an environment. It takes the environment name as a required argument. Refuse to remove `production` as a safety measure—print a clear error explaining this protection. For non-production environments: stop and disable the systemd service `toss-<app>-<env>`, remove the unit file, daemon-reload. Remove the deployment directory at `/srv/<app>/<env>/`. Remove any per-environment secret overrides at `.toss/secrets/overrides/<env>.env`. Remove the environment entry from `.toss/state.json`. Regenerate the Caddy config and reload. Print a confirmation of what was removed.

[ ] Implement `toss list`. This command shows all deployments for the current app. Read `.toss/state.json` to get all deployments and their ports. Construct the URL: if domain is set, use `https://<domain>` for production and `https://<env>.preview.<domain>` for others; if no domain, use sslip.io URLs. Render a compact table showing environment name, port, URL, and optionally systemd service status.

[ ] Implement `toss status`. This command gives a quick summary of the current project. Show the resolved config values including app name, server, domain (or "sslip.io" if not set), etc. Check SSH connectivity to the server and report success/failure. Reuse the deployment scan from `toss list` to show what's deployed. Show the lock status if a deploy is in progress. For each deployment, show any secret overrides that are set (just the keys, not values).

[ ] Implement `toss logs`. This command tails logs for an environment. It takes a required environment name. Support a `-n` flag to show a specific number of lines; otherwise stream continuously. Under the hood, run `journalctl -u toss-<app>-<env>` over SSH and stream the output to the user's terminal. Use `-f` for continuous streaming when no `-n` flag, and `-n <count>` for line count.

[ ] Implement `toss ssh`. This command opens an interactive SSH session to the server. It takes a required environment name. Change directory to `/srv/<app>/<env>/` after connecting so the user lands in the deployment folder.

[ ] Implement environment name validation. Environment names must be lowercase, contain only `a-z`, `0-9`, and `-`, start with a letter, and be at most 63 characters (DNS label safe). The name `production` is reserved for the production environment. Validate early in every command that accepts an environment name and provide a clear error message with the rules if validation fails.

[ ] Implement GitHub Actions workflow generation. This happens during `toss init` when the user opts in. The workflow should deploy on pushes to main for production, deploy on pull requests for preview environments (using `pr-<number>` naming), and remove preview environments when PRs are closed. Always include the comment step for preview URLs—use the domain if configured, otherwise construct sslip.io URLs.
