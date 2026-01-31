import { loadConfig, parseServerString } from "../config.ts";
import { openInteractiveSession, remoteExists } from "../ssh.ts";
import { validateEnvironmentNameOrThrow } from "../environment.ts";
import { getEnvDirectory, getCurrentSymlinkPath } from "../state.ts";

/**
 * Parses the command line arguments for the ssh command.
 *
 * @returns Parsed arguments with environment name
 */
function parseArgs(args: string[]): {
  environment: string | null;
  showHelp: boolean;
} {
  let environment: string | null = null;
  let showHelp = false;

  for (const arg of args) {
    if (arg === "-h" || arg === "--help") {
      showHelp = true;
      continue;
    }

    // If it starts with - but isn't a known flag, error
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    // First positional argument is the environment
    if (environment === null) {
      environment = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  return { environment, showHelp };
}

/**
 * toss ssh - Open an interactive SSH session to a deployment
 *
 * Usage: toss ssh <env>
 *
 * Opens an SSH session to the server and changes to the deployment directory.
 * This lets you inspect files, run commands, or debug issues directly on the server.
 */
export async function sshCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.showHelp) {
    console.log(`Usage: toss ssh <env>

Open an interactive SSH session to a deployment.

Arguments:
  env                 Environment name (e.g., prod, pr-42)

Options:
  -h, --help          Show this help message

The session starts in the current release directory (/srv/<app>/<env>/current/).

Examples:
  toss ssh prod          SSH into prod deployment
  toss ssh pr-42         SSH into pr-42 preview deployment
`);
    return;
  }

  if (!parsed.environment) {
    console.error("Error: Environment name is required.");
    console.error("");
    console.error("Usage: toss ssh <env>");
    console.error("");
    console.error("Examples:");
    console.error("  toss ssh prod");
    console.error("  toss ssh pr-42");
    process.exit(1);
  }

  // Validate environment name
  validateEnvironmentNameOrThrow(parsed.environment);

  const { config } = await loadConfig();
  const connection = parseServerString(config.server);

  // Prefer the current symlink (release-based structure), fallback to env dir for legacy deployments
  const envDir = getEnvDirectory(config.app, parsed.environment);
  const currentPath = getCurrentSymlinkPath(config.app, parsed.environment);

  // Check if the current symlink exists (indicates release-based structure)
  const currentExists = await remoteExists(connection, currentPath, {
    requiresSudo: true,
  });

  let targetDir: string;
  if (currentExists) {
    targetDir = currentPath;
  } else {
    // Fallback to env directory for legacy deployments
    const envDirExists = await remoteExists(connection, envDir, {
      requiresSudo: true,
    });
    if (envDirExists) {
      console.log(
        `⚠ Warning: No current symlink found. Using legacy directory structure.`
      );
      targetDir = envDir;
    } else {
      console.error(
        `Error: Environment "${parsed.environment}" not found on server.`
      );
      console.error("");
      console.error("Run 'toss list' to see deployed environments.");
      process.exit(1);
    }
  }

  // Build the initial command to cd to the deployment directory and start a shell
  // We use 'cd <dir> && exec $SHELL' to start an interactive shell in the right directory
  const initialCommand = `cd ${targetDir} && exec $SHELL -l`;

  console.log(`Connecting to ${parsed.environment} at ${targetDir}...`);

  const exitCode = await openInteractiveSession(connection, initialCommand);

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
