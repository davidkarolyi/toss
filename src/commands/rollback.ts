import * as readline from "node:readline";
import { loadConfig, parseServerString } from "../config.ts";
import {
  getCurrentReleaseTarget,
  getReleaseDirectory,
  listReleases,
  switchCurrentSymlink,
} from "../releases.ts";
import { restartService, getServiceName } from "../systemd.ts";
import { validateEnvironmentNameOrThrow } from "../environment.ts";
import { withLock, formatLockInfo } from "../lock.ts";

const RELEASE_NAME_PATTERN = /^\d{8}_\d{6}$/;

/**
 * Creates a readline interface for interactive input
 */
function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Parses command line arguments for the rollback command.
 */
function parseRollbackArgs(args: string[]): { environment: string; release?: string } {
  let environment: string | undefined;
  let release: string | undefined;

  for (const arg of args) {
    if (arg === "-h" || arg === "--help") {
      printRollbackHelp();
      process.exit(0);
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    } else if (!environment) {
      environment = arg;
    } else if (!release) {
      release = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!environment) {
    throw new Error(
      "Missing environment argument.\n\n" +
        "Usage: toss rollback <environment> [release]\n\n" +
        "Examples:\n" +
        "  toss rollback prod\n" +
        "  toss rollback prod 20260130_120000"
    );
  }

  if (release) {
    validateReleaseNameOrThrow(release);
  }

  return { environment, release };
}

/**
 * Validates release name format.
 */
function validateReleaseNameOrThrow(release: string): void {
  if (!RELEASE_NAME_PATTERN.test(release)) {
    throw new Error(
      `Invalid release name: "${release}"\n\n` +
        "Expected format: YYYYMMDD_HHMMSS\n" +
        "Example: 20260130_143022"
    );
  }
}

/**
 * Prints help for the rollback command.
 */
function printRollbackHelp(): void {
  console.log(`toss rollback - Roll back to a previous release

Usage: toss rollback <environment> [release]

Arguments:
  environment       The environment to roll back (e.g., prod, pr-42)
  release           Optional release timestamp (YYYYMMDD_HHMMSS)
                    If omitted, you will be prompted to select a release

Options:
  -h, --help        Show this help message

Examples:
  toss rollback prod
  toss rollback prod 20260130_120000
  toss rollback pr-42 20260130_150000

Notes:
  - Prod keeps multiple releases (default 3) to allow quick rollbacks
  - Previews keep only the current release by default
`);
}

function formatReleaseList(releases: string[]): string {
  return releases.map((release) => `  - ${release}`).join("\n");
}

async function promptForRelease(releases: string[], currentRelease: string): Promise<string> {
  const candidates = releases.filter((release) => release !== currentRelease);

  if (candidates.length === 0) {
    throw new Error(
      "No previous releases available to roll back to.\n\n" +
        "Prod keeps multiple releases by default; previews keep only the current release.\n" +
        "If this is prod, you may need to deploy again or increase keepReleases."
    );
  }

  const orderedCandidates = [...candidates].reverse();
  const defaultIndex = 1;

  console.log(`Current release: ${currentRelease}`);
  console.log("Select release to roll back to:");
  orderedCandidates.forEach((release, index) => {
    console.log(`  ${index + 1}) ${release}`);
  });

  const rl = createReadlineInterface();

  try {
    return await new Promise((resolve) => {
      const ask = (): void => {
        rl.question(`Select [${defaultIndex}]: `, (answer) => {
          const trimmed = answer.trim();
          if (!trimmed) {
            resolve(orderedCandidates[defaultIndex - 1]);
            return;
          }

          const selected = Number.parseInt(trimmed, 10);
          if (Number.isNaN(selected) || selected < 1 || selected > orderedCandidates.length) {
            console.log("  Invalid selection. Enter a number from the list.");
            ask();
            return;
          }

          resolve(orderedCandidates[selected - 1]);
        });
      };

      ask();
    });
  } finally {
    rl.close();
  }
}

/**
 * Main rollback command handler.
 */
export async function rollbackCommand(args: string[]): Promise<void> {
  const { environment, release } = parseRollbackArgs(args);

  // Validate environment name
  validateEnvironmentNameOrThrow(environment);

  // Load config
  const { config } = await loadConfig();
  const connection = parseServerString(config.server);

  console.log(`\n-> Rolling back ${config.app} (${environment})...\n`);

  await withLock(
    connection,
    config.app,
    environment,
    async () => {
      console.log("-> Checking releases...");
      const releases = await listReleases(connection, config.app, environment);

      if (releases.length === 0) {
        throw new Error(
          `No releases found for "${environment}".\n\n` +
            `Deploy the environment first with:\n` +
            `  toss deploy ${environment}`
        );
      }

      const currentTarget = await getCurrentReleaseTarget(
        connection,
        config.app,
        environment
      );

      if (!currentTarget) {
        throw new Error(
          `Current release symlink not found for "${environment}".\n\n` +
            "This environment may predate release-based deploys.\n" +
            `Redeploy to enable rollbacks:\n` +
            `  toss deploy ${environment}`
        );
      }

      const currentReleaseName = currentTarget.split("/").pop();
      if (!currentReleaseName) {
        throw new Error(`Failed to determine current release for "${environment}".`);
      }

      let targetReleaseName: string;

      if (release) {
        if (!releases.includes(release)) {
          throw new Error(
            `Release "${release}" not found for "${environment}".\n\n` +
              "Available releases:\n" +
              formatReleaseList(releases)
          );
        }

        if (release === currentReleaseName) {
          throw new Error(
            `Release "${release}" is already active for "${environment}".`
          );
        }

        targetReleaseName = release;
      } else {
        if (!process.stdin.isTTY) {
          throw new Error(
            "No TTY available to prompt for a release.\n\n" +
              "Provide the release explicitly:\n" +
              `  toss rollback ${environment} <release>`
          );
        }

        if (!releases.includes(currentReleaseName)) {
          throw new Error(
            `Current release "${currentReleaseName}" not found in releases directory.\n\n` +
              "Available releases:\n" +
              formatReleaseList(releases)
          );
        }

        targetReleaseName = await promptForRelease(releases, currentReleaseName);
      }

      const targetReleaseDir = getReleaseDirectory(
        config.app,
        environment,
        targetReleaseName
      );

      console.log(`-> Switching to release ${targetReleaseName}...`);
      await switchCurrentSymlink(
        connection,
        config.app,
        environment,
        targetReleaseDir
      );

      console.log("-> Restarting service...");
      await restartService(connection, config.app, environment);

      const serviceName = getServiceName(config.app, environment);

      console.log("");
      console.log(`OK Rolled back ${environment} to ${targetReleaseName}`);
      console.log(`  Release: ${targetReleaseName}`);
      console.log("");
      console.log("Useful commands:");
      console.log(`  toss logs ${environment}      View logs`);
      console.log(`  toss ssh ${environment}       SSH into deployment`);
      console.log(`  systemctl status ${serviceName}   Check service status`);
    },
    {
      onLockAcquired: (result) => {
        if (result.reason && result.existingLock) {
          const formatted = formatLockInfo(result.existingLock)
            .split("\n")
            .map((line) => `  ${line}`)
            .join("\n");
          console.log(`-> Lock recovery: ${result.reason}`);
          console.log(formatted);
        } else if (result.reason) {
          console.log(`  Note: ${result.reason}`);
        }
      },
    }
  );
}
