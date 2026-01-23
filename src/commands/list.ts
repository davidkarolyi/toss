import { loadConfig, parseServerString, extractHostFromServer } from "../config.ts";
import { readState, getDeployedEnvironments, getPortForEnvironment } from "../state.ts";
import { getDeploymentUrl } from "../caddy.ts";
import { getServiceStatus } from "../systemd.ts";
import type { ServerConnection } from "../config.ts";
import type { TossState } from "../state.ts";

/**
 * Information about a single deployment for display
 */
interface DeploymentInfo {
  environment: string;
  port: number;
  url: string;
  status: string;
}

/**
 * Gathers information about all deployments
 */
async function gatherDeployments(
  connection: ServerConnection,
  state: TossState,
  serverHost: string,
  appName: string,
  domain?: string
): Promise<DeploymentInfo[]> {
  const environments = getDeployedEnvironments(state);
  const deployments: DeploymentInfo[] = [];

  for (const environment of environments) {
    const port = getPortForEnvironment(state, environment);
    if (port === undefined) continue;

    const url = getDeploymentUrl(environment, serverHost, domain);

    // Get service status
    let status = "unknown";
    try {
      const serviceStatus = await getServiceStatus(connection, appName, environment);
      status = serviceStatus.status;
    } catch {
      status = "error";
    }

    deployments.push({
      environment,
      port,
      url,
      status,
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
 * Formats a status string with optional color indicator
 */
function formatStatus(status: string): string {
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
 * Renders the deployments as a compact table
 */
function renderTable(deployments: DeploymentInfo[]): void {
  if (deployments.length === 0) {
    console.log("No deployments found.");
    console.log("");
    console.log("Deploy with:");
    console.log("  toss deploy production");
    return;
  }

  // Calculate column widths
  const envHeader = "ENVIRONMENT";
  const portHeader = "PORT";
  const statusHeader = "STATUS";
  const urlHeader = "URL";

  const maxEnvWidth = Math.max(
    envHeader.length,
    ...deployments.map((deployment) => deployment.environment.length)
  );
  const maxPortWidth = Math.max(
    portHeader.length,
    ...deployments.map((deployment) => deployment.port.toString().length)
  );
  const maxStatusWidth = Math.max(
    statusHeader.length,
    ...deployments.map((deployment) => formatStatus(deployment.status).length)
  );

  // Print header
  const header = [
    envHeader.padEnd(maxEnvWidth),
    portHeader.padEnd(maxPortWidth),
    statusHeader.padEnd(maxStatusWidth),
    urlHeader,
  ].join("  ");

  console.log(header);
  console.log("-".repeat(header.length));

  // Print rows
  for (const deployment of deployments) {
    const row = [
      deployment.environment.padEnd(maxEnvWidth),
      deployment.port.toString().padEnd(maxPortWidth),
      formatStatus(deployment.status).padEnd(maxStatusWidth),
      deployment.url,
    ].join("  ");

    console.log(row);
  }
}

/**
 * toss list - Show all deployments for the current app
 *
 * Usage: toss list
 *
 * Reads state from the server and displays a table of all deployments
 * with their environment name, port, status, and URL.
 */
export async function listCommand(args: string[]): Promise<void> {
  // Check for help flag
  if (args.includes("-h") || args.includes("--help")) {
    console.log(`Usage: toss list

Show all deployments for the current app.

Displays a table with:
  - Environment name (e.g., production, pr-42)
  - Port number
  - Service status (running, stopped, failed)
  - Public URL

Examples:
  toss list
`);
    return;
  }

  // Load config
  const { config } = await loadConfig();
  const connection = parseServerString(config.server);
  const serverHost = extractHostFromServer(config.server);

  // Read state from server
  const state = await readState(connection, config.app);

  // Gather deployment info
  const deployments = await gatherDeployments(
    connection,
    state,
    serverHost,
    config.app,
    config.domain
  );

  // Render the table
  renderTable(deployments);
}
