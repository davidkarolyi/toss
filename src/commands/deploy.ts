import { loadConfig, parseServerString, extractHostFromServer } from "../config.ts";
import { exec, readRemoteFile, writeRemoteFile, mkdirRemote, remoteExists } from "../ssh.ts";
import { syncToRemoteOrFail } from "../rsync.ts";
import {
  createOrUpdateService,
  startOrRestartService,
  enableService,
  getServiceName,
} from "../systemd.ts";
import {
  readState,
  writeState,
  getDeploymentDirectory,
  getSecretsDirectory,
  getSecretsOverridesDirectory,
  verifyOrigin,
} from "../state.ts";
import { updateCaddyConfig, getDeploymentUrl } from "../caddy.ts";
import { applyDependencies, formatDependencyError } from "../dependencies.ts";
import { withLock } from "../lock.ts";
import { resolvePort } from "../ports.ts";
import { detectGitOrigin } from "../provisioning.ts";

/**
 * Parsed secret override from command line
 */
interface SecretOverride {
  key: string;
  value: string;
}

/**
 * Parses command line arguments for the deploy command.
 */
function parseDeployArgs(args: string[]): {
  environment: string;
  secretOverrides: SecretOverride[];
} {
  let environment: string | undefined;
  const secretOverrides: SecretOverride[] = [];
  let skipNext = false;

  for (const [index, arg] of args.entries()) {
    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (arg === "--secret" || arg === "-s") {
      const nextArg = args[index + 1];
      if (!nextArg || nextArg.startsWith("-")) {
        throw new Error(
          `The ${arg} flag requires a KEY=VALUE argument.\n\n` +
            "Example: toss deploy pr-42 -s DATABASE_URL=postgres://..."
        );
      }
      const parsed = parseSecretOverride(nextArg);
      secretOverrides.push(parsed);
      skipNext = true;
    } else if (arg.startsWith("--secret=")) {
      const valuePart = arg.slice("--secret=".length);
      const parsed = parseSecretOverride(valuePart);
      secretOverrides.push(parsed);
    } else if (arg.startsWith("-s=")) {
      const valuePart = arg.slice("-s=".length);
      const parsed = parseSecretOverride(valuePart);
      secretOverrides.push(parsed);
    } else if (arg === "-h" || arg === "--help") {
      printDeployHelp();
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
        "Usage: toss deploy <environment>\n\n" +
        "Examples:\n" +
        "  toss deploy production\n" +
        "  toss deploy pr-42\n" +
        "  toss deploy pr-42 -s DATABASE_URL=postgres://..."
    );
  }

  return { environment, secretOverrides };
}

/**
 * Parses a KEY=VALUE secret override string.
 */
function parseSecretOverride(input: string): SecretOverride {
  const equalsIndex = input.indexOf("=");

  if (equalsIndex === -1) {
    throw new Error(
      `Invalid secret format: "${input}"\n\n` +
        "Expected format: KEY=VALUE\n" +
        "Example: DATABASE_URL=postgres://localhost/mydb"
    );
  }

  const key = input.slice(0, equalsIndex);
  const value = input.slice(equalsIndex + 1);

  if (!key) {
    throw new Error(
      `Invalid secret format: "${input}"\n\n` +
        "Secret key cannot be empty."
    );
  }

  // Validate key format (should be a valid env var name)
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(
      `Invalid secret key: "${key}"\n\n` +
        "Secret keys must start with a letter or underscore, " +
        "and contain only letters, numbers, and underscores."
    );
  }

  return { key, value };
}

/**
 * Prints help for the deploy command.
 */
function printDeployHelp(): void {
  console.log(`toss deploy - Deploy to an environment

Usage: toss deploy <environment> [options]

Arguments:
  environment       The environment to deploy to (e.g., production, pr-42)

Options:
  -s, --secret KEY=VALUE    Set a per-environment secret override
                            Can be used multiple times
                            Setting KEY= (empty value) removes the override
  -h, --help                Show this help message

Examples:
  toss deploy production
  toss deploy pr-42
  toss deploy pr-42 -s DATABASE_URL=postgres://db/pr_42
  toss deploy pr-42 -s DATABASE_URL=postgres://db/pr_42 -s DEBUG=true
  toss deploy pr-42 -s DEBUG=      # Remove the DEBUG override

Overrides are persistent and apply to all future deploys of the environment.
`);
}

/**
 * Updates the override file for an environment with new secret overrides.
 */
async function updateSecretOverrides(
  connection: ReturnType<typeof parseServerString>,
  appName: string,
  environment: string,
  overrides: SecretOverride[]
): Promise<void> {
  if (overrides.length === 0) {
    return;
  }

  const overridesDir = getSecretsOverridesDirectory(appName);
  const overridePath = `${overridesDir}/${environment}.env`;

  // Ensure overrides directory exists
  await mkdirRemote(connection, overridesDir);

  // Read existing overrides
  let existingOverrides: Record<string, string> = {};
  if (await remoteExists(connection, overridePath)) {
    const content = await readRemoteFile(connection, overridePath);
    existingOverrides = parseEnvFile(content);
  }

  // Apply new overrides
  for (const override of overrides) {
    if (override.value === "") {
      // Empty value means remove the override
      delete existingOverrides[override.key];
    } else {
      existingOverrides[override.key] = override.value;
    }
  }

  // Write back
  const content = formatEnvFile(existingOverrides);
  await writeRemoteFile(connection, overridePath, content);
}

/**
 * Merges base secrets with environment overrides and writes to .env in the deployment directory.
 */
async function mergeAndWriteSecrets(
  connection: ReturnType<typeof parseServerString>,
  appName: string,
  environment: string,
  deploymentDir: string
): Promise<boolean> {
  const secretsDir = getSecretsDirectory(appName);
  const overridesDir = getSecretsOverridesDirectory(appName);

  // Determine base secrets file
  const baseSecretsFile =
    environment === "production"
      ? `${secretsDir}/production.env`
      : `${secretsDir}/preview.env`;

  const overrideFile = `${overridesDir}/${environment}.env`;

  // Read base secrets
  let baseSecrets: Record<string, string> = {};
  let hasBaseSecrets = false;
  if (await remoteExists(connection, baseSecretsFile)) {
    const content = await readRemoteFile(connection, baseSecretsFile);
    baseSecrets = parseEnvFile(content);
    // Check if there are actual secrets (not just comments)
    hasBaseSecrets = Object.keys(baseSecrets).length > 0;
  }

  // Read overrides
  let overrideSecrets: Record<string, string> = {};
  if (await remoteExists(connection, overrideFile)) {
    const content = await readRemoteFile(connection, overrideFile);
    overrideSecrets = parseEnvFile(content);
  }

  // Merge: overrides take precedence
  const merged = { ...baseSecrets, ...overrideSecrets };

  // Write to deployment directory
  const envFilePath = `${deploymentDir}/.env`;
  const content = formatEnvFile(merged);
  await writeRemoteFile(connection, envFilePath, content);

  // Return whether we had actual secrets
  return hasBaseSecrets || Object.keys(overrideSecrets).length > 0;
}

/**
 * Parses an env file into a key-value object.
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex);
    let value = trimmed.slice(equalsIndex + 1);

    // Handle quoted values
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Formats a key-value object as an env file.
 */
export function formatEnvFile(secrets: Record<string, string>): string {
  const lines: string[] = [];

  // Sort keys for consistency
  const sortedKeys = Object.keys(secrets).sort();

  for (const key of sortedKeys) {
    const value = secrets[key];
    if (value === undefined) {
      continue;
    }
    // Quote values that contain spaces, newlines, or special characters
    if (/[\s#"'$`\\]/.test(value)) {
      // Escape any double quotes in the value
      const escaped = value.replace(/"/g, '\\"');
      lines.push(`${key}="${escaped}"`);
    } else {
      lines.push(`${key}=${value}`);
    }
  }

  // Return empty string if no secrets
  if (lines.length === 0) {
    return "";
  }

  return lines.join("\n") + "\n";
}

/**
 * Runs the deploy script commands in the deployment directory.
 */
async function runDeployScript(
  connection: ReturnType<typeof parseServerString>,
  deploymentDir: string,
  deployScript: string[],
  envVars: Record<string, string>
): Promise<void> {
  for (const command of deployScript) {
    console.log(`  $ ${command}`);

    const result = await exec(connection, command, {
      cwd: deploymentDir,
      env: envVars,
      stream: true,
    });

    if (result.exitCode !== 0) {
      throw new Error(
        `Deploy script command failed: ${command}\n\n` +
          `Exit code: ${result.exitCode}\n` +
          (result.stderr ? `Error: ${result.stderr.trim()}` : "")
      );
    }
  }
}

/**
 * Main deploy command handler.
 */
export async function deployCommand(args: string[]): Promise<void> {
  const { environment, secretOverrides } = parseDeployArgs(args);

  // Load config
  const { config, repoRoot } = await loadConfig();
  const connection = parseServerString(config.server);
  const serverHost = extractHostFromServer(config.server);

  // Paths
  const deploymentDir = getDeploymentDirectory(config.app, environment);
  const envFilePath = `${deploymentDir}/.env`;

  console.log(`\n→ Deploying ${config.app} to ${environment}...\n`);

  // Execute deploy within lock
  await withLock(
    connection,
    config.app,
    environment,
    async () => {
      // 1. Verify project origin
      console.log("→ Verifying project origin...");
      const state = await readState(connection, config.app);
      const localOrigin = await detectGitOrigin();
      const originResult = verifyOrigin(state.origin, localOrigin);

      if (!originResult.valid) {
        throw new Error(originResult.error);
      }

      // 2. Update secret overrides if provided
      if (secretOverrides.length > 0) {
        console.log("→ Updating secret overrides...");
        await updateSecretOverrides(
          connection,
          config.app,
          environment,
          secretOverrides
        );
      }

      // 3. Rsync files
      console.log("→ Syncing files...");
      await syncToRemoteOrFail(repoRoot, connection, deploymentDir, {
        stream: false,
      });

      // 4. Apply dependencies
      console.log("→ Checking dependencies...");
      const depsResult = await applyDependencies(
        connection,
        config,
        state,
        config.app,
        {
          onProgress: (message) => console.log(`  ${message}`),
        }
      );

      if (!depsResult.success) {
        const failedDep = depsResult.applied.find((dep) => !dep.success);
        if (failedDep) {
          throw new Error(formatDependencyError(failedDep));
        }
      }

      // 5. Merge and write secrets
      console.log("→ Loading secrets...");
      const hasSecrets = await mergeAndWriteSecrets(
        connection,
        config.app,
        environment,
        deploymentDir
      );

      if (!hasSecrets) {
        console.log(
          "  ⚠ No secrets found. Your app will start with an empty .env file."
        );
        console.log(
          `  Push secrets with: toss secrets push ${environment === "production" ? "production" : "preview"} --file .env.local`
        );
      }

      // 6. Resolve/assign port
      console.log("→ Assigning port...");
      const portResult = await resolvePort(connection, state, environment);

      if (portResult.isNew) {
        // Update state with new port before starting service
        state.deployments[environment] = { port: portResult.port };
        await writeState(connection, config.app, state);
      }

      console.log(`  Using port ${portResult.port}`);

      // 7. Run deploy script
      console.log("→ Running deploy script...");
      const tossEnvVars: Record<string, string> = {
        TOSS_ENV: environment,
        TOSS_APP: config.app,
        TOSS_PORT: portResult.port.toString(),
        TOSS_RELEASE_DIR: deploymentDir,
        TOSS_PROD_DIR: getDeploymentDirectory(config.app, "production"),
      };

      await runDeployScript(
        connection,
        deploymentDir,
        config.deployScript,
        tossEnvVars
      );

      // 8. Create/update systemd service
      console.log("→ Configuring service...");
      await createOrUpdateService(connection, {
        appName: config.app,
        environment,
        workingDirectory: deploymentDir,
        startCommand: config.startCommand,
        envFilePath,
      });

      // Enable for auto-start on boot
      await enableService(connection, config.app, environment);

      // 9. Start or restart service
      console.log("→ Starting service...");
      await startOrRestartService(connection, config.app, environment);

      // 10. Update Caddy config
      console.log("→ Configuring reverse proxy...");

      // Re-read state to ensure we have latest deployments
      const updatedState = await readState(connection, config.app);

      const caddyResult = await updateCaddyConfig(connection, updatedState, {
        appName: config.app,
        serverHost,
        domain: config.domain,
      });

      if (!caddyResult.success) {
        console.log(`  ⚠ Warning: ${caddyResult.error}`);
        console.log("  The app is running but may not be publicly accessible.");
      }

      // 11. Print success
      const url = getDeploymentUrl(environment, serverHost, config.domain);
      const serviceName = getServiceName(config.app, environment);

      console.log("");
      console.log(`✓ Deployed to ${url}`);
      console.log("");
      console.log("Useful commands:");
      console.log(`  toss logs ${environment}      View logs`);
      console.log(`  toss ssh ${environment}       SSH into deployment`);
      console.log(`  systemctl status ${serviceName}   Check service status`);
    },
    {
      onLockAcquired: (result) => {
        if (result.reason) {
          console.log(`  Note: ${result.reason}`);
        }
      },
    }
  );
}
