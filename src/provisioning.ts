import type { ServerConnection } from "./config.ts";
import { exec, execSudo, mkdirRemote, writeRemoteFile, remoteExists } from "./ssh.ts";
import {
  getTossDirectory,
  getSecretsDirectory,
  getSecretsOverridesDirectory,
  getStatePath,
  createEmptyState,
  type TossState,
} from "./state.ts";
import { isCaddyInstalled } from "./caddy.ts";

/**
 * Result of a provisioning operation
 */
export interface ProvisioningResult {
  success: boolean;
  error?: string;
}

/**
 * Options for provisioning a server
 */
export interface ProvisioningOptions {
  appName: string;
  gitOrigin: string | null;
}

/**
 * Gets the app root directory on the server
 */
export function getAppDirectory(appName: string): string {
  return `/srv/${appName}`;
}

/**
 * Gets the path to the prod secrets file
 */
export function getProdSecretsPath(appName: string): string {
  return `${getSecretsDirectory(appName)}/prod.env`;
}

/**
 * Gets the path to the preview secrets file
 */
export function getPreviewSecretsPath(appName: string): string {
  return `${getSecretsDirectory(appName)}/preview.env`;
}

/**
 * Detects the git origin URL from the local repository.
 * Returns null if not in a git repository or no origin is configured.
 */
export async function detectGitOrigin(): Promise<string | null> {
  try {
    const process = Bun.spawn(["git", "config", "--get", "remote.origin.url"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await process.exited;

    if (exitCode !== 0) {
      return null;
    }

    const stdout = await new Response(process.stdout).text();
    const origin = stdout.trim();

    return origin || null;
  } catch {
    return null;
  }
}

/**
 * Installs Caddy on the server using the official install script.
 *
 * This follows the official Caddy installation method for Debian/Ubuntu systems.
 * Caddy is installed as a systemd service.
 */
export async function installCaddy(
  connection: ServerConnection
): Promise<ProvisioningResult> {
  // Install Caddy using the official apt repository method
  // This is the recommended way for Debian/Ubuntu systems
  const installCommands = [
    // Install prerequisites
    "apt-get update",
    "apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl",
    // Add Caddy GPG key
    "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg",
    // Add Caddy repository
    "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list",
    // Install Caddy
    "apt-get update",
    "apt-get install -y caddy",
  ];

  const fullCommand = installCommands.join(" && ");
  const result = await execSudo(connection, fullCommand, { stream: true });

  if (result.exitCode !== 0) {
    return {
      success: false,
      error: `Failed to install Caddy: ${result.stderr.trim() || result.stdout.trim()}`,
    };
  }

  return { success: true };
}

/**
 * Ensures Caddy is installed, installing it if necessary.
 */
export async function ensureCaddyInstalled(
  connection: ServerConnection
): Promise<ProvisioningResult> {
  const installed = await isCaddyInstalled(connection);

  if (installed) {
    return { success: true };
  }

  return installCaddy(connection);
}

/**
 * Creates the directory structure for a toss-managed app.
 *
 * Creates:
 * - /srv/<app>/
 * - /srv/<app>/.toss/
 * - /srv/<app>/.toss/secrets/
 * - /srv/<app>/.toss/secrets/overrides/
 */
export async function createAppDirectories(
  connection: ServerConnection,
  appName: string
): Promise<ProvisioningResult> {
  const directories = [
    getAppDirectory(appName),
    getTossDirectory(appName),
    getSecretsDirectory(appName),
    getSecretsOverridesDirectory(appName),
  ];

  for (const directory of directories) {
    try {
      await mkdirRemote(connection, directory, { requiresSudo: true });
    } catch (error) {
      return {
        success: false,
        error: `Failed to create directory ${directory}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  return { success: true };
}

/**
 * Creates empty secrets files if they don't exist.
 *
 * Creates:
 * - /srv/<app>/.toss/secrets/prod.env
 * - /srv/<app>/.toss/secrets/preview.env
 */
export async function createEmptySecretsFiles(
  connection: ServerConnection,
  appName: string
): Promise<ProvisioningResult> {
  const secretsFiles = [
    getProdSecretsPath(appName),
    getPreviewSecretsPath(appName),
  ];

  for (const filePath of secretsFiles) {
    try {
      const exists = await remoteExists(connection, filePath, {
        requiresSudo: true,
      });
      if (!exists) {
        // Create empty file with a comment header
        await writeRemoteFile(
          connection,
          filePath,
          "# Secrets managed by toss\n# Push secrets with: toss secrets push <prod|preview> --file .env.local\n",
          { requiresSudo: true }
        );
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to create secrets file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  return { success: true };
}

/**
 * Initializes state.json if it doesn't exist.
 *
 * Creates an empty state with:
 * - origin: the git remote origin URL (for collision detection)
 * - deployments: empty object
 * - appliedDependencies: empty array
 * - lock: null
 */
export async function initializeState(
  connection: ServerConnection,
  appName: string,
  gitOrigin: string | null
): Promise<ProvisioningResult> {
  const statePath = getStatePath(appName);

  try {
    const exists = await remoteExists(connection, statePath, {
      requiresSudo: true,
    });

    if (exists) {
      // State already exists - don't overwrite
      return { success: true };
    }

    const state: TossState = createEmptyState(gitOrigin);
    const content = JSON.stringify(state, null, 2);

    await writeRemoteFile(connection, statePath, content, {
      requiresSudo: true,
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Failed to initialize state.json: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Checks if the server has an existing toss installation for this app.
 */
export async function isAlreadyProvisioned(
  connection: ServerConnection,
  appName: string
): Promise<boolean> {
  const statePath = getStatePath(appName);
  return remoteExists(connection, statePath, { requiresSudo: true });
}

/**
 * Provisions a server for toss deployments.
 *
 * This is idempotent - running it multiple times is safe and
 * won't break anything. Each step checks if work is needed.
 *
 * Steps:
 * 1. Install Caddy (if not already installed)
 * 2. Create app directories
 * 3. Create empty secrets files (if they don't exist)
 * 4. Initialize state.json (if it doesn't exist)
 */
export async function provisionServer(
  connection: ServerConnection,
  options: ProvisioningOptions
): Promise<ProvisioningResult> {
  const { appName, gitOrigin } = options;

  // Step 1: Ensure Caddy is installed
  const caddyResult = await ensureCaddyInstalled(connection);
  if (!caddyResult.success) {
    return caddyResult;
  }

  // Step 2: Create directory structure
  const dirResult = await createAppDirectories(connection, appName);
  if (!dirResult.success) {
    return dirResult;
  }

  // Step 3: Create empty secrets files
  const secretsResult = await createEmptySecretsFiles(connection, appName);
  if (!secretsResult.success) {
    return secretsResult;
  }

  // Step 4: Initialize state.json
  const stateResult = await initializeState(connection, appName, gitOrigin);
  if (!stateResult.success) {
    return stateResult;
  }

  return { success: true };
}

/**
 * Verifies that the user has elevated access (root or passwordless sudo).
 * This is required for provisioning since we need to:
 * - Install packages (apt-get)
 * - Write to /srv/
 * - Manage systemd services
 * - Edit /etc/caddy/Caddyfile
 */
export async function verifyElevatedAccess(
  connection: ServerConnection
): Promise<ProvisioningResult> {
  // Check if we're root
  const whoamiResult = await exec(connection, "whoami");

  if (whoamiResult.exitCode !== 0) {
    return {
      success: false,
      error: "Failed to determine user identity",
    };
  }

  const username = whoamiResult.stdout.trim();

  if (username === "root") {
    return { success: true };
  }

  // Check for passwordless sudo
  const sudoResult = await exec(connection, "sudo -n true");

  if (sudoResult.exitCode === 0) {
    return { success: true };
  }

  return {
    success: false,
    error: `User '${username}' does not have root or passwordless sudo access.\n\n` +
      "Provisioning requires elevated access to:\n" +
      "  - Install packages (apt-get install caddy)\n" +
      "  - Create directories in /srv/\n" +
      "  - Manage systemd services\n" +
      "  - Edit /etc/caddy/Caddyfile\n\n" +
      "Either:\n" +
      "  1. Connect as root: root@your-server\n" +
      "  2. Or configure passwordless sudo for this user",
  };
}
