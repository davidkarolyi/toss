import { loadConfig, parseServerString, extractHostFromServer } from "../config.ts";
import { remoteExists, removeRemote } from "../ssh.ts";
import { removeService, getServiceName } from "../systemd.ts";
import {
  readState,
  writeState,
  getEnvDirectory,
  getSecretsOverridesDirectory,
} from "../state.ts";
import { updateCaddyConfig } from "../caddy.ts";
import { validateEnvironmentNameOrThrow } from "../environment.ts";

/**
 * Parses command line arguments for the remove command.
 */
function parseRemoveArgs(args: string[]): { environment: string } {
  let environment: string | undefined;

  for (const arg of args) {
    if (arg === "-h" || arg === "--help") {
      printRemoveHelp();
      process.exit(0);
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    } else if (!environment) {
      environment = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!environment) {
    throw new Error(
      "Missing environment argument.\n\n" +
        "Usage: toss remove <environment>\n\n" +
        "Examples:\n" +
        "  toss remove pr-42\n" +
        "  toss remove staging"
    );
  }

  return { environment };
}

/**
 * Prints help for the remove command.
 */
function printRemoveHelp(): void {
  console.log(`toss remove - Remove an environment

Usage: toss remove <environment>

Arguments:
  environment       The environment to remove (e.g., pr-42, staging)

Options:
  -h, --help        Show this help message

Note: The prod environment cannot be removed as a safety measure.

Examples:
  toss remove pr-42
  toss remove staging
`);
}

/**
 * Main remove command handler.
 */
export async function removeCommand(args: string[]): Promise<void> {
  const { environment } = parseRemoveArgs(args);

  // Validate environment name
  validateEnvironmentNameOrThrow(environment);

  // Safety check: prevent removing prod
  if (environment === "prod") {
    throw new Error(
      "Cannot remove the prod environment.\n\n" +
        "The prod environment is protected from removal as a safety measure.\n" +
        "If you really need to tear down prod, you can:\n" +
        "  1. SSH into the server: toss ssh prod\n" +
        "  2. Manually stop the service and remove the files"
    );
  }

  // Load config
  const { config } = await loadConfig();
  const connection = parseServerString(config.server);
  const serverHost = extractHostFromServer(config.server);

  const envDir = getEnvDirectory(config.app, environment);
  const overridesDir = getSecretsOverridesDirectory(config.app);
  const overridePath = `${overridesDir}/${environment}.env`;
  const serviceName = getServiceName(config.app, environment);

  console.log(`\n→ Removing ${config.app} environment: ${environment}...\n`);

  // Check if the environment exists in state
  const state = await readState(connection, config.app);
  const deploymentExists = environment in state.deployments;

  if (!deploymentExists) {
    // Check if the directory exists on disk even without state entry
    const dirExists = await remoteExists(connection, envDir, {
      requiresSudo: true,
    });
    if (!dirExists) {
      throw new Error(
        `Environment "${environment}" not found.\n\n` +
          "Run 'toss list' to see deployed environments."
      );
    }
    // Directory exists but not in state - proceed with cleanup anyway
    console.log("  Note: Environment not found in state but directory exists. Cleaning up...");
  }

  // Track what we removed for the summary
  const removedItems: string[] = [];

  // 1. Stop and remove systemd service
  console.log("→ Stopping service...");
  await removeService(connection, config.app, environment);
  console.log(`  Removed service: ${serviceName}`);
  removedItems.push(`Systemd service: ${serviceName}`);

  // 2. Remove environment directory (includes releases/, preserve/, current)
  console.log("→ Removing environment directory...");
  if (await remoteExists(connection, envDir, { requiresSudo: true })) {
    await removeRemote(connection, envDir, true, { requiresSudo: true });
    console.log(`  Removed: ${envDir}`);
    removedItems.push(`Environment directory: ${envDir}`);
  } else {
    console.log("  Directory already removed");
  }

  // 3. Remove secret overrides if they exist
  console.log("→ Removing secret overrides...");
  if (await remoteExists(connection, overridePath, { requiresSudo: true })) {
    await removeRemote(connection, overridePath, false, { requiresSudo: true });
    console.log(`  Removed: ${overridePath}`);
    removedItems.push(`Secret overrides: ${overridePath}`);
  } else {
    console.log("  No overrides to remove");
  }

  // 4. Update state.json
  console.log("→ Updating state...");
  if (deploymentExists) {
    delete state.deployments[environment];
    await writeState(connection, config.app, state);
    console.log("  State updated");
  } else {
    console.log("  No state entry to remove");
  }

  // 5. Regenerate Caddy config
  console.log("→ Updating reverse proxy...");
  const caddyResult = await updateCaddyConfig(connection, state, {
    appName: config.app,
    serverHost,
    domain: config.domain,
    prodDomain: config.prodDomain,
    prodAliases: config.prodAliases,
    prodAliasRedirect: config.prodAliasRedirect,
  });

  if (!caddyResult.success) {
    console.log(`  ⚠ Warning: ${caddyResult.error}`);
    console.log("  The environment was removed but Caddy configuration may need manual attention.");
  } else {
    console.log("  Caddy configuration updated");
  }

  // 6. Print summary
  console.log("");
  console.log(`✓ Removed environment: ${environment}`);
  console.log("");
  console.log("What was removed:");
  for (const item of removedItems) {
    console.log(`  - ${item}`);
  }
}
