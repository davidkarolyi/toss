import { spawn } from "node:child_process";
import type { ServerConnection } from "./config.ts";
import { buildSshOptions } from "./ssh.ts";

/**
 * Options for rsync operations
 */
export interface RsyncOptions {
  /** Whether to stream output to stdout/stderr (default: true) */
  stream?: boolean;
  /** Additional exclude patterns beyond the defaults */
  extraExcludes?: string[];
  /** Whether to delete files on destination that don't exist in source (default: false) */
  delete?: boolean;
  /** Dry run mode - show what would be transferred without actually doing it */
  dryRun?: boolean;
  /** Whether rsync requires sudo on the remote server */
  requiresSudo?: boolean;
}

/**
 * Result of an rsync operation
 */
export interface RsyncResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Default exclude patterns for rsync.
 * These are files/directories that should never be synced to the server.
 */
const DEFAULT_EXCLUDES = [
  "node_modules",
  ".git",
  ".next",
  ".DS_Store",
  ".env*",
];

/**
 * Syncs a local directory to a remote server using rsync.
 *
 * Features:
 * - Uses the system's rsync binary
 * - Respects .gitignore files automatically
 * - Excludes common patterns (node_modules, .git, .env*, etc.)
 * - Supports custom SSH ports
 *
 * @param localPath Local directory to sync (should end without a slash to sync the directory itself)
 * @param connection Server connection details
 * @param remotePath Remote destination path
 * @param options Rsync options
 */
export async function syncToRemote(
  localPath: string,
  connection: ServerConnection,
  remotePath: string,
  options: RsyncOptions = {}
): Promise<RsyncResult> {
  const {
    stream = true,
    extraExcludes = [],
    delete: deleteFiles = false,
    dryRun = false,
    requiresSudo = false,
  } = options;

  const rsyncArgs = buildRsyncArgs(
    localPath,
    connection,
    remotePath,
    extraExcludes,
    deleteFiles,
    dryRun,
    requiresSudo
  );

  return executeRsync(rsyncArgs, stream);
}

/**
 * Builds the rsync command arguments.
 */
function buildRsyncArgs(
  localPath: string,
  connection: ServerConnection,
  remotePath: string,
  extraExcludes: string[],
  deleteFiles: boolean,
  dryRun: boolean,
  requiresSudo: boolean
): string[] {
  const args: string[] = [];

  // Archive mode (preserves permissions, timestamps, etc.) + verbose + compress
  args.push("-avz");

  // Show progress
  args.push("--progress");

  // Delete extraneous files on receiver (optional)
  if (deleteFiles) {
    args.push("--delete");
  }

  // Dry run mode
  if (dryRun) {
    args.push("--dry-run");
  }

  // SSH options aligned with the main SSH module
  const sshOptions = buildSshOptions(connection).join(" ");
  args.push("-e", `ssh ${sshOptions}`);

  // Run rsync as sudo on the remote host when needed
  if (requiresSudo && connection.user !== "root") {
    args.push("--rsync-path", "sudo -n rsync");
  }

  // Apply gitignore rules from the source directory
  // This tells rsync to read .gitignore files and exclude matching patterns
  args.push("--filter", ":- .gitignore");

  // Add default excludes
  for (const pattern of DEFAULT_EXCLUDES) {
    args.push("--exclude", pattern);
  }

  // Add extra excludes
  for (const pattern of extraExcludes) {
    args.push("--exclude", pattern);
  }

  // Ensure local path ends with / to sync contents, not the directory itself
  const sourcePath = localPath.endsWith("/") ? localPath : `${localPath}/`;

  // Source
  args.push(sourcePath);

  // Destination
  args.push(`${connection.user}@${connection.host}:${remotePath}`);

  return args;
}

/**
 * Executes rsync with the given arguments.
 */
function executeRsync(
  args: string[],
  stream: boolean
): Promise<RsyncResult> {
  return new Promise((resolve, reject) => {
    const childProcess = spawn("rsync", args, {
      stdio: ["inherit", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    childProcess.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      if (stream) {
        process.stdout.write(chunk);
      }
    });

    childProcess.stderr.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      if (stream) {
        process.stderr.write(chunk);
      }
    });

    childProcess.on("error", (error) => {
      reject(
        new Error(
          `Failed to spawn rsync process: ${error.message}\n\n` +
            "Make sure 'rsync' is installed and available in your PATH.\n" +
            "On macOS, rsync is installed by default.\n" +
            "On Ubuntu/Debian: sudo apt-get install rsync\n" +
            "On RHEL/CentOS: sudo yum install rsync"
        )
      );
    });

    childProcess.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

/**
 * Syncs files to remote and throws if it fails.
 * Includes actionable error messages for common failure cases.
 */
export async function syncToRemoteOrFail(
  localPath: string,
  connection: ServerConnection,
  remotePath: string,
  options: RsyncOptions = {}
): Promise<RsyncResult> {
  const result = await syncToRemote(localPath, connection, remotePath, options);

  if (result.exitCode !== 0) {
    const errorMessage = formatRsyncError(result, connection);
    throw new Error(errorMessage);
  }

  return result;
}

/**
 * Formats an rsync error with actionable guidance.
 */
function formatRsyncError(result: RsyncResult, connection: ServerConnection): string {
  const target = `${connection.user}@${connection.host}`;
  let message = "File sync failed.\n";

  if (result.stderr.trim()) {
    message += `\nError: ${result.stderr.trim()}\n`;
  }

  // Provide specific guidance based on common error codes
  switch (result.exitCode) {
    case 1:
      message += "\nThis usually indicates a syntax or usage error.";
      break;
    case 2:
      message += "\nProtocol incompatibility. Try updating rsync on both ends.";
      break;
    case 3:
      message += "\nFile selection error. Check that the source directory exists.";
      break;
    case 5:
      message += "\nError starting client-server protocol. Check SSH connectivity.";
      break;
    case 10:
      message += "\nError in socket I/O. Check network connectivity.";
      break;
    case 11:
      message += "\nError in file I/O. Check disk space and permissions.";
      break;
    case 12:
      message += "\nError in rsync protocol data stream.";
      break;
    case 23:
      message += "\nPartial transfer due to errors. Some files may have been skipped.";
      break;
    case 24:
      message += "\nPartial transfer due to vanished source files.";
      break;
    case 255:
      message += "\nSSH connection failed. Verify you can connect manually:";
      message += `\n  ssh ${target}${connection.port !== 22 ? ` -p ${connection.port}` : ""}`;
      break;
    default:
      message += `\nExit code: ${result.exitCode}`;
  }

  return message;
}
