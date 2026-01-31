import type { ServerConnection } from "./config.ts";
import type { TossState } from "./state.ts";
import {
  exec,
  execSudo,
  writeRemoteFile,
  removeRemote,
  escapeShellArg,
  readRemoteFile,
  remoteExists,
  mkdirRemote,
} from "./ssh.ts";

const CADDYFILE_PATH = "/etc/caddy/Caddyfile";
const CADDY_CONFIG_DIR = "/etc/caddy/caddy.d";
const CADDYFILE_MARKER = "# Managed by toss";

/**
 * Configuration for generating Caddy config
 */
export interface CaddyGeneratorConfig {
  appName: string;
  serverHost: string;
  domain?: string;
}

/**
 * Result of a Caddy operation
 */
export interface CaddyOperationResult {
  success: boolean;
  error?: string;
}

/**
 * Converts an IP address to sslip.io format.
 * Replaces dots with dashes: 64.23.123.45 → 64-23-123-45
 */
export function formatIpForSslip(ip: string): string {
  if (ip.includes(":")) {
    return ip.toLowerCase().replace(/:/g, "-");
  }
  return ip.replace(/\./g, "-");
}

/**
 * Constructs the public URL for a deployment.
 *
 * With domain:
 *   - prod: https://prod.myapp.example.com
 *   - pr-42: https://pr-42.myapp.example.com
 *
 * Without domain (sslip.io):
 *   - prod: https://prod.myapp.64-23-123-45.sslip.io
 *   - pr-42: https://pr-42.myapp.64-23-123-45.sslip.io
 */
export function getDeploymentUrl(
  environment: string,
  appName: string,
  serverHost: string,
  domain?: string
): string {
  const hostname = getDeploymentHostname(environment, appName, serverHost, domain);
  return `https://${hostname}`;
}

/**
 * Constructs the hostname for a deployment (without protocol).
 */
export function getDeploymentHostname(
  environment: string,
  appName: string,
  serverHost: string,
  domain?: string
): string {
  if (domain) {
    return `${environment}.${appName}.${domain}`;
  }

  // Use sslip.io
  const sslipHost = formatIpForSslip(serverHost);
  return `${environment}.${appName}.${sslipHost}.sslip.io`;
}

/**
 * Generates a single Caddy site block for a deployment.
 */
function generateSiteBlock(hostname: string, port: number): string {
  return `${hostname} {
    reverse_proxy localhost:${port}
}`;
}

/**
 * Generates the complete Caddyfile content from state.
 *
 * Creates a reverse proxy block for each deployment, mapping
 * the hostname to the assigned port.
 */
export function generateCaddyfile(
  state: TossState,
  config: CaddyGeneratorConfig
): string {
  const { appName, serverHost, domain } = config;

  const deploymentEntries = Object.entries(state.deployments);

  if (deploymentEntries.length === 0) {
    // Empty Caddyfile with a comment
    return `# Managed by toss for ${appName}\n# No deployments yet\n`;
  }

  const siteBlocks: string[] = [];

  // Sort environments: prod first, then alphabetically
  const sortedEntries = deploymentEntries.sort(([envA], [envB]) => {
    if (envA === "prod") return -1;
    if (envB === "prod") return 1;
    return envA.localeCompare(envB);
  });

  for (const [environment, entry] of sortedEntries) {
    const hostname = getDeploymentHostname(environment, appName, serverHost, domain);
    siteBlocks.push(generateSiteBlock(hostname, entry.port));
  }

  return `# Managed by toss for ${appName}\n\n${siteBlocks.join("\n\n")}\n`;
}

/**
 * Checks if Caddy is installed on the server.
 */
export async function isCaddyInstalled(connection: ServerConnection): Promise<boolean> {
  const result = await exec(connection, "which caddy");
  return result.exitCode === 0;
}

/**
 * Checks if the Caddy service is running.
 */
export async function isCaddyRunning(connection: ServerConnection): Promise<boolean> {
  const result = await execSudo(connection, "systemctl is-active caddy");
  return result.exitCode === 0 && result.stdout.trim() === "active";
}

/**
 * Starts the Caddy service.
 */
export async function startCaddy(connection: ServerConnection): Promise<CaddyOperationResult> {
  const result = await execSudo(connection, "systemctl start caddy");

  if (result.exitCode !== 0) {
    return {
      success: false,
      error: `Failed to start Caddy: ${result.stderr.trim() || result.stdout.trim()}`,
    };
  }

  return { success: true };
}

/**
 * Enables the Caddy service to start on boot.
 */
export async function enableCaddy(connection: ServerConnection): Promise<CaddyOperationResult> {
  const result = await execSudo(connection, "systemctl enable caddy");

  if (result.exitCode !== 0) {
    return {
      success: false,
      error: `Failed to enable Caddy: ${result.stderr.trim() || result.stdout.trim()}`,
    };
  }

  return { success: true };
}

/**
 * Reloads the Caddy configuration.
 *
 * Uses `caddy reload` which gracefully reloads config without dropping connections.
 * Falls back to `systemctl reload caddy` if the direct command fails.
 */
export async function reloadCaddy(connection: ServerConnection): Promise<CaddyOperationResult> {
  // Try the preferred reload method first
  const reloadResult = await execSudo(
    connection,
    `caddy reload --config ${escapeShellArg(CADDYFILE_PATH)}`
  );

  if (reloadResult.exitCode === 0) {
    return { success: true };
  }

  // Fall back to systemctl reload
  const systemctlResult = await execSudo(connection, "systemctl reload caddy");

  if (systemctlResult.exitCode !== 0) {
    return {
      success: false,
      error: `Failed to reload Caddy: ${reloadResult.stderr.trim() || systemctlResult.stderr.trim()}`,
    };
  }

  return { success: true };
}

/**
 * Validates Caddy configuration syntax without applying it.
 */
export async function validateCaddyConfig(
  connection: ServerConnection,
  configPath: string = CADDYFILE_PATH
): Promise<CaddyOperationResult> {
  const result = await execSudo(
    connection,
    `caddy validate --config ${escapeShellArg(configPath)}`
  );

  if (result.exitCode !== 0) {
    return {
      success: false,
      error: `Invalid Caddyfile: ${result.stderr.trim() || result.stdout.trim()}`,
    };
  }

  return { success: true };
}

/**
 * Ensures the main Caddyfile imports app configs from the toss directory.
 */
async function ensureCaddyMainConfig(
  connection: ServerConnection
): Promise<CaddyOperationResult> {
  await mkdirRemote(connection, CADDY_CONFIG_DIR, { requiresSudo: true });

  const exists = await remoteExists(connection, CADDYFILE_PATH, {
    requiresSudo: true,
  });

  const requiredImport = `import ${CADDY_CONFIG_DIR}/*.caddy`;
  const mainContent = `${CADDYFILE_MARKER}\n${requiredImport}\n`;

  if (!exists) {
    await writeRemoteFile(connection, CADDYFILE_PATH, mainContent, {
      requiresSudo: true,
    });
    return { success: true };
  }

  const existingContent = await readRemoteFile(connection, CADDYFILE_PATH, {
    requiresSudo: true,
  });

  if (existingContent.includes(requiredImport)) {
    return { success: true };
  }

  if (existingContent.includes(CADDYFILE_MARKER)) {
    await writeRemoteFile(connection, CADDYFILE_PATH, mainContent, {
      requiresSudo: true,
    });
    return { success: true };
  }

  return {
    success: false,
    error:
      "Caddyfile does not import toss app configs.\n\n" +
      `Add this line to ${CADDYFILE_PATH}:\n  ${requiredImport}`,
  };
}

/**
 * Ensures Caddy is running, starting it if necessary.
 */
export async function ensureCaddyRunning(connection: ServerConnection): Promise<CaddyOperationResult> {
  const running = await isCaddyRunning(connection);

  if (running) {
    return { success: true };
  }

  // Try to start Caddy
  const startResult = await startCaddy(connection);

  if (!startResult.success) {
    return startResult;
  }

  // Enable on boot
  const enableResult = await enableCaddy(connection);
  if (!enableResult.success) {
    // Non-fatal: Caddy is running but won't auto-start on reboot
    console.warn(`Warning: Caddy started but could not be enabled for boot: ${enableResult.error}`);
  }

  return { success: true };
}

/**
 * Updates the app-specific Caddy config with the current state and reloads Caddy.
 *
 * This is the main function to call after deployment changes.
 * It handles:
 * 1. Generating the new Caddyfile from state
 * 2. Writing the Caddyfile to the server
 * 3. Validating the configuration
 * 4. Ensuring Caddy is running
 * 5. Reloading the configuration
 *
 * Returns success even if Caddy isn't installed (for fresh servers
 * that haven't been provisioned yet).
 */
export async function updateCaddyConfig(
  connection: ServerConnection,
  state: TossState,
  config: CaddyGeneratorConfig
): Promise<CaddyOperationResult> {
  // Check if Caddy is installed
  const installed = await isCaddyInstalled(connection);
  if (!installed) {
    return {
      success: false,
      error: "Caddy is not installed. Run 'toss init' to provision the server.",
    };
  }

  const ensureResult = await ensureCaddyMainConfig(connection);
  if (!ensureResult.success) {
    return ensureResult;
  }

  // Generate and write the new app config
  const caddyfileContent = generateCaddyfile(state, config);
  const appConfigPath = `${CADDY_CONFIG_DIR}/${config.appName}.caddy`;
  const hadPrevious = await remoteExists(connection, appConfigPath, {
    requiresSudo: true,
  });
  const previousContent = hadPrevious
    ? await readRemoteFile(connection, appConfigPath, { requiresSudo: true })
    : null;

  await writeRemoteFile(connection, appConfigPath, caddyfileContent, {
    requiresSudo: true,
  });

  // Validate full config before reloading
  const validationResult = await validateCaddyConfig(connection, CADDYFILE_PATH);
  if (!validationResult.success) {
    try {
      if (previousContent !== null) {
        await writeRemoteFile(connection, appConfigPath, previousContent, {
          requiresSudo: true,
        });
      } else {
        await removeRemote(connection, appConfigPath, false, {
          requiresSudo: true,
        });
      }
    } catch {
      // Best effort rollback
    }
    return validationResult;
  }

  // Ensure Caddy is running
  const runningResult = await ensureCaddyRunning(connection);
  if (!runningResult.success) {
    return runningResult;
  }

  // Reload the configuration
  const reloadResult = await reloadCaddy(connection);
  if (!reloadResult.success) {
    return reloadResult;
  }

  return { success: true };
}
