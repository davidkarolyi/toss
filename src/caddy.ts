import type { ServerConnection } from "./config.ts";
import type { TossState } from "./state.ts";
import { exec, execSudo, writeRemoteFile, removeRemote, escapeShellArg } from "./ssh.ts";

const CADDYFILE_PATH = "/etc/caddy/Caddyfile";
const CADDYFILE_TEMP_PATH = "/etc/caddy/Caddyfile.toss.tmp";

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
 *   - production: https://myapp.com
 *   - pr-42: https://pr-42.preview.myapp.com
 *
 * Without domain (sslip.io):
 *   - production: https://production.64-23-123-45.sslip.io
 *   - pr-42: https://pr-42.64-23-123-45.sslip.io
 */
export function getDeploymentUrl(
  environment: string,
  serverHost: string,
  domain?: string
): string {
  const hostname = getDeploymentHostname(environment, serverHost, domain);
  return `https://${hostname}`;
}

/**
 * Constructs the hostname for a deployment (without protocol).
 */
export function getDeploymentHostname(
  environment: string,
  serverHost: string,
  domain?: string
): string {
  if (domain) {
    if (environment === "production") {
      return domain;
    }
    return `${environment}.preview.${domain}`;
  }

  // Use sslip.io
  const sslipHost = formatIpForSslip(serverHost);
  return `${environment}.${sslipHost}.sslip.io`;
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

  // Sort environments: production first, then alphabetically
  const sortedEntries = deploymentEntries.sort(([envA], [envB]) => {
    if (envA === "production") return -1;
    if (envB === "production") return 1;
    return envA.localeCompare(envB);
  });

  for (const [environment, entry] of sortedEntries) {
    const hostname = getDeploymentHostname(environment, serverHost, domain);
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
 * Writes the Caddyfile to the server.
 */
async function writeCaddyfileTemp(connection: ServerConnection, content: string): Promise<void> {
  await writeRemoteFile(connection, CADDYFILE_TEMP_PATH, content, {
    requiresSudo: true,
  });
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
 * Updates the Caddyfile with the current state and reloads Caddy.
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

  // Generate and write the new config to a temp file
  const caddyfileContent = generateCaddyfile(state, config);
  await writeCaddyfileTemp(connection, caddyfileContent);

  // Validate temp config before promoting
  const validationResult = await validateCaddyConfig(connection, CADDYFILE_TEMP_PATH);
  if (!validationResult.success) {
    try {
      await removeRemote(connection, CADDYFILE_TEMP_PATH, false, {
        requiresSudo: true,
      });
    } catch {
      // Best effort cleanup
    }
    return validationResult;
  }

  // Promote temp config atomically
  const moveResult = await execSudo(
    connection,
    `mv ${escapeShellArg(CADDYFILE_TEMP_PATH)} ${escapeShellArg(CADDYFILE_PATH)}`
  );
  if (moveResult.exitCode !== 0) {
    return {
      success: false,
      error: `Failed to update Caddyfile: ${moveResult.stderr.trim() || moveResult.stdout.trim()}`,
    };
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
