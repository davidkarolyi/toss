import { spawn } from "node:child_process";
import { loadConfig, parseServerString } from "../config.ts";
import { getServiceName } from "../systemd.ts";
import { buildSshArgs } from "../ssh.ts";
import type { ServerConnection } from "../config.ts";
import { validateEnvironmentNameOrThrow } from "../environment.ts";

/**
 * Parses the command line arguments for the logs command.
 *
 * @returns Parsed arguments with environment and optional line count
 */
function parseArgs(args: string[]): {
  environment: string | null;
  lineCount: number | null;
  showHelp: boolean;
} {
  let environment: string | null = null;
  let lineCount: number | null = null;
  let showHelp = false;
  let skipNext = false;

  for (let index = 0; index < args.length; index++) {
    if (skipNext) {
      skipNext = false;
      continue;
    }

    const arg = args[index];
    if (arg === undefined) continue;

    if (arg === "-h" || arg === "--help") {
      showHelp = true;
      continue;
    }

    if (arg === "-n") {
      const nextArg = args[index + 1];
      if (nextArg === undefined) {
        throw new Error("The -n flag requires a number argument");
      }

      const parsed = parseInt(nextArg, 10);
      if (isNaN(parsed) || parsed < 1) {
        throw new Error(`Invalid line count: ${nextArg}. Must be a positive number.`);
      }

      lineCount = parsed;
      skipNext = true;
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

  return { environment, lineCount, showHelp };
}

/**
 * Streams logs from a remote service via SSH.
 *
 * @param connection Server connection details
 * @param serviceName The systemd service name
 * @param lineCount If provided, show this many lines and exit. Otherwise stream continuously.
 * @returns Promise that resolves when streaming ends
 */
function streamLogs(
  connection: ServerConnection,
  serviceName: string,
  lineCount: number | null
): Promise<number> {
  const sshArgs = buildSshArgs(connection);

  // Build the journalctl command
  let journalCommand = `journalctl -u ${serviceName} --no-pager`;

  if (lineCount !== null) {
    // Show last N lines
    journalCommand += ` -n ${lineCount}`;
  } else {
    // Stream continuously (follow mode)
    journalCommand += " -f";
  }

  sshArgs.push(journalCommand);

  return new Promise((resolve, reject) => {
    const childProcess = spawn("ssh", sshArgs, {
      stdio: "inherit",
    });

    childProcess.on("error", (error) => {
      reject(
        new Error(
          `Failed to spawn ssh process: ${error.message}\n\n` +
            "Make sure 'ssh' is installed and available in your PATH."
        )
      );
    });

    childProcess.on("close", (code) => {
      resolve(code ?? 0);
    });
  });
}

/**
 * toss logs - Tail logs for an environment
 *
 * Usage: toss logs <env> [-n <lines>]
 *
 * Streams journalctl logs for the specified environment's systemd service.
 * Without -n, streams continuously (follow mode). Press Ctrl+C to stop.
 * With -n, shows the last N lines and exits.
 */
export async function logsCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.showHelp) {
    console.log(`Usage: toss logs <env> [-n <lines>]

Tail logs for an environment.

Arguments:
  env                 Environment name (e.g., production, pr-42)

Options:
  -n <lines>          Show last N lines and exit (default: stream continuously)
  -h, --help          Show this help message

Examples:
  toss logs production         Stream production logs continuously
  toss logs pr-42              Stream pr-42 logs continuously
  toss logs production -n 100  Show last 100 lines of production logs
`);
    return;
  }

  if (!parsed.environment) {
    console.error("Error: Environment name is required.");
    console.error("");
    console.error("Usage: toss logs <env> [-n <lines>]");
    console.error("");
    console.error("Examples:");
    console.error("  toss logs production");
    console.error("  toss logs pr-42 -n 100");
    process.exit(1);
  }

  // Validate environment name
  validateEnvironmentNameOrThrow(parsed.environment);

  const { config } = await loadConfig();
  const connection = parseServerString(config.server);
  const serviceName = getServiceName(config.app, parsed.environment);

  if (parsed.lineCount === null) {
    console.log(`Streaming logs for ${parsed.environment}... (Ctrl+C to stop)`);
  }

  const exitCode = await streamLogs(connection, serviceName, parsed.lineCount);

  if (exitCode !== 0 && exitCode !== 130) {
    // Exit code 130 is SIGINT (Ctrl+C), which is expected for streaming
    process.exit(exitCode);
  }
}
