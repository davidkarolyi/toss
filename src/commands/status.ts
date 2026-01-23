import {
  loadConfig,
  parseServerString,
  extractHostFromServer,
} from "../config.ts";
import { testConnection, remoteExists, readRemoteFile } from "../ssh.ts";
import {
  readState,
  getDeployedEnvironments,
  getPortForEnvironment,
  getSecretsOverridesDirectory,
} from "../state.ts";
import { getDeploymentUrl } from "../caddy.ts";
import { getServiceStatus } from "../systemd.ts";
import { formatLockInfo, isLockStale } from "../lock.ts";
import { parseEnvFile } from "./deploy.ts";
import type { ServerConnection } from "../config.ts";
import type { TossState, DeploymentLock } from "../state.ts";

/**
 * Information about a single deployment for display
 */
interface DeploymentStatusInfo {
  environment: string;
  port: number;
  url: string;
  status: string;
  overrideKeys: string[];
}

/**
 * Gathers information about all deployments including override keys
 */
async function gatherDeploymentStatus(
  connection: ServerConnection,
  state: TossState,
  serverHost: string,
  appName: string,
  domain?: string
): Promise<DeploymentStatusInfo[]> {
  const environments = getDeployedEnvironments(state);
  const deployments: DeploymentStatusInfo[] = [];
  const overridesDir = getSecretsOverridesDirectory(appName);

  for (const environment of environments) {
    const port = getPortForEnvironment(state, environment);
    if (port === undefined) continue;

    const url = getDeploymentUrl(environment, serverHost, domain);

    // Get service status
    let status = "unknown";
    try {
      const serviceStatus = await getServiceStatus(
        connection,
        appName,
        environment
      );
      status = serviceStatus.status;
    } catch {
      status = "error";
    }

    // Get override keys
    const overrideKeys: string[] = [];
    const overridePath = `${overridesDir}/${environment}.env`;
    try {
      if (await remoteExists(connection, overridePath, { requiresSudo: true })) {
        const content = await readRemoteFile(connection, overridePath, {
          requiresSudo: true,
        });
        const overrides = parseEnvFile(content);
        overrideKeys.push(...Object.keys(overrides).sort());
      }
    } catch {
      // Ignore errors reading overrides
    }

    deployments.push({
      environment,
      port,
      url,
      status,
      overrideKeys,
    });
  }

  // Sort: production first, then alphabetically
  deployments.sort((deploymentA, deploymentB) => {
    if (deploymentA.environment === "production") return -1;
    if (deploymentB.environment === "production") return 1;
    return deploymentA.environment.localeCompare(deploymentB.environment);
  });

  return deployments;
}

/**
 * Formats a status string for display
 */
function formatServiceStatus(status: string): string {
  switch (status) {
    case "active":
      return "running";
    case "inactive":
      return "stopped";
    case "failed":
      return "failed";
    case "activating":
      return "starting";
    case "deactivating":
      return "stopping";
    default:
      return status;
  }
}

/**
 * Renders the configuration section
 */
function renderConfig(
  appName: string,
  server: string,
  domain: string | undefined,
  startCommand: string,
  deployScript: string[]
): void {
  console.log("Configuration");
  console.log("─".repeat(50));
  console.log(`  App:           ${appName}`);
  console.log(`  Server:        ${server}`);
  console.log(`  Domain:        ${domain || "(sslip.io)"}`);
  console.log(`  Start:         ${startCommand}`);
  console.log(`  Deploy script: ${deployScript.length} command(s)`);
}

/**
 * Renders the connection status section
 */
function renderConnectionStatus(connected: boolean): void {
  console.log("");
  console.log("Server Connection");
  console.log("─".repeat(50));
  if (connected) {
    console.log("  Status: connected");
  } else {
    console.log("  Status: disconnected (SSH failed)");
  }
}

/**
 * Renders the lock status section
 */
function renderLockStatus(lock: DeploymentLock | null): void {
  console.log("");
  console.log("Deploy Lock");
  console.log("─".repeat(50));

  if (!lock) {
    console.log("  Status: unlocked");
    return;
  }

  const stale = isLockStale(lock);
  console.log(`  Status: locked${stale ? " (stale)" : ""}`);
  console.log(`  ${formatLockInfo(lock).split("\n").join("\n  ")}`);
}

/**
 * Renders the deployments section
 */
function renderDeployments(deployments: DeploymentStatusInfo[]): void {
  console.log("");
  console.log("Deployments");
  console.log("─".repeat(50));

  if (deployments.length === 0) {
    console.log("  No deployments found.");
    console.log("");
    console.log("  Deploy with:");
    console.log("    toss deploy production");
    return;
  }

  for (const deployment of deployments) {
    console.log("");
    console.log(`  ${deployment.environment}`);
    console.log(`    URL:      ${deployment.url}`);
    console.log(`    Port:     ${deployment.port}`);
    console.log(`    Status:   ${formatServiceStatus(deployment.status)}`);

    if (deployment.overrideKeys.length > 0) {
      console.log(`    Overrides: ${deployment.overrideKeys.join(", ")}`);
    }
  }
}

/**
 * toss status - Show a summary of the current project
 *
 * Usage: toss status
 *
 * Displays:
 * - Configuration values from toss.json
 * - SSH connectivity status
 * - Lock status (if any deploy is in progress)
 * - Deployments with their status and any secret overrides
 */
export async function statusCommand(args: string[]): Promise<void> {
  // Check for help flag
  if (args.includes("-h") || args.includes("--help")) {
    console.log(`Usage: toss status

Show a summary of the current project.

Displays:
  - Configuration from toss.json
  - SSH connectivity to the server
  - Deploy lock status (if any)
  - All deployments with status and secret overrides

Examples:
  toss status
`);
    return;
  }

  // Load config
  const { config } = await loadConfig();
  const connection = parseServerString(config.server);
  const serverHost = extractHostFromServer(config.server);

  // Render config section
  console.log("");
  renderConfig(
    config.app,
    config.server,
    config.domain,
    config.startCommand,
    config.deployScript
  );

  // Test connection
  let connected = false;
  try {
    await testConnection(connection);
    connected = true;
  } catch {
    connected = false;
  }

  renderConnectionStatus(connected);

  // If not connected, we can't show server state
  if (!connected) {
    console.log("");
    console.log("Cannot retrieve server state - SSH connection failed.");
    console.log("");
    console.log("Troubleshooting:");
    console.log(`  1. Test manually: ssh ${config.server}`);
    console.log(`  2. Check your SSH keys`);
    console.log(`  3. Ensure the server is running`);
    return;
  }

  // Read state from server
  const state = await readState(connection, config.app);

  // Render lock status
  renderLockStatus(state.lock);

  // Gather and render deployments
  const deployments = await gatherDeploymentStatus(
    connection,
    state,
    serverHost,
    config.app,
    config.domain
  );

  renderDeployments(deployments);

  console.log("");
}
