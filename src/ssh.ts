import { spawn } from "node:child_process";
import type { ServerConnection } from "./config.ts";

/**
 * Options for executing remote commands
 */
export interface RemoteExecOptions {
  /** Working directory on the remote server */
  cwd?: string;
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Whether to stream output to stdout/stderr (default: true) */
  stream?: boolean;
  /** Whether to allocate a pseudo-terminal (for interactive commands) */
  tty?: boolean;
}

/**
 * Result of a remote command execution
 */
export interface RemoteExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Builds the SSH command arguments for connecting to a server.
 */
export function buildSshArgs(connection: ServerConnection): string[] {
  const args: string[] = [];

  // Disable strict host key checking for non-interactive use
  // Users can override via their ~/.ssh/config
  args.push("-o", "BatchMode=yes");
  args.push("-o", "StrictHostKeyChecking=accept-new");

  // Connection timeout
  args.push("-o", "ConnectTimeout=10");

  // Custom port if not default
  if (connection.port !== 22) {
    args.push("-p", connection.port.toString());
  }

  // Target
  args.push(`${connection.user}@${connection.host}`);

  return args;
}

/**
 * Tests SSH connectivity to a server.
 *
 * @returns true if connection succeeds, throws with descriptive error otherwise
 */
export async function testConnection(
  connection: ServerConnection
): Promise<boolean> {
  const sshArgs = buildSshArgs(connection);
  sshArgs.push("echo", "ok");

  return new Promise((resolve, reject) => {
    const process = spawn("ssh", sshArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";

    process.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    process.on("error", (error) => {
      reject(
        new Error(
          `Failed to spawn ssh process: ${error.message}\n\n` +
            "Make sure 'ssh' is installed and available in your PATH."
        )
      );
    });

    process.on("close", (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        const errorMessage = formatConnectionError(connection, stderr);
        reject(new Error(errorMessage));
      }
    });
  });
}

/**
 * Formats a connection error with actionable troubleshooting steps.
 */
function formatConnectionError(
  connection: ServerConnection,
  stderr: string
): string {
  const target = `${connection.user}@${connection.host}`;
  const portInfo =
    connection.port !== 22 ? ` (port ${connection.port})` : "";

  let message = `SSH connection to ${target}${portInfo} failed.\n`;

  // Add the actual error
  if (stderr.trim()) {
    message += `\nError: ${stderr.trim()}\n`;
  }

  // Add troubleshooting steps
  message += "\nTroubleshooting:\n";
  message += `  1. Test manually: ssh ${target}${connection.port !== 22 ? ` -p ${connection.port}` : ""}\n`;
  message += `  2. If that fails, copy your key: ssh-copy-id ${target}${connection.port !== 22 ? ` -p ${connection.port}` : ""}\n`;
  message += "  3. Ensure the server is running and reachable\n";

  return message;
}

/**
 * Executes a command on the remote server.
 *
 * @param connection Server connection details
 * @param command The command to execute
 * @param options Execution options
 * @returns Promise resolving to the command result
 */
export async function exec(
  connection: ServerConnection,
  command: string,
  options: RemoteExecOptions = {}
): Promise<RemoteExecResult> {
  const { cwd, env, stream = false, tty = false } = options;

  const sshArgs = buildSshArgs(connection);

  if (tty) {
    sshArgs.push("-t");
  }

  // Build the remote command with optional cd and env
  let remoteCommand = command;

  if (cwd) {
    remoteCommand = `cd ${escapeShellArg(cwd)} && ${remoteCommand}`;
  }

  if (env && Object.keys(env).length > 0) {
    const envPrefix = Object.entries(env)
      .map(([key, value]) => `${key}=${escapeShellArg(value)}`)
      .join(" ");
    remoteCommand = `${envPrefix} ${remoteCommand}`;
  }

  sshArgs.push(remoteCommand);

  return new Promise((resolve, reject) => {
    const childProcess = spawn("ssh", sshArgs, {
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
          `Failed to spawn ssh process: ${error.message}\n\n` +
            "Make sure 'ssh' is installed and available in your PATH."
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
 * Executes a command and throws if it fails.
 * Useful for commands that must succeed.
 */
export async function execOrFail(
  connection: ServerConnection,
  command: string,
  options: RemoteExecOptions = {}
): Promise<RemoteExecResult> {
  const result = await exec(connection, command, options);

  if (result.exitCode !== 0) {
    const errorMessage =
      result.stderr.trim() || result.stdout.trim() || "Command failed";
    throw new Error(`Remote command failed: ${errorMessage}`);
  }

  return result;
}

/**
 * Opens an interactive SSH session.
 *
 * @param connection Server connection details
 * @param initialCommand Optional command to run after connecting (e.g., cd to a directory)
 */
export function openInteractiveSession(
  connection: ServerConnection,
  initialCommand?: string
): Promise<number> {
  const sshArgs: string[] = [];

  // Custom port if not default
  if (connection.port !== 22) {
    sshArgs.push("-p", connection.port.toString());
  }

  // Force TTY allocation for interactive use
  sshArgs.push("-t");

  // Target
  sshArgs.push(`${connection.user}@${connection.host}`);

  // Add initial command if provided
  if (initialCommand) {
    sshArgs.push(initialCommand);
  }

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
 * Escapes a string for safe use in a shell command.
 */
export function escapeShellArg(arg: string): string {
  // Use single quotes and escape any single quotes within
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Checks if a remote file or directory exists.
 */
export async function remoteExists(
  connection: ServerConnection,
  path: string
): Promise<boolean> {
  const result = await exec(connection, `test -e ${escapeShellArg(path)}`);
  return result.exitCode === 0;
}

/**
 * Reads the contents of a remote file.
 */
export async function readRemoteFile(
  connection: ServerConnection,
  path: string
): Promise<string> {
  const result = await exec(connection, `cat ${escapeShellArg(path)}`);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to read remote file ${path}: ${result.stderr}`);
  }

  return result.stdout;
}

/**
 * Writes content to a remote file.
 */
export async function writeRemoteFile(
  connection: ServerConnection,
  path: string,
  content: string
): Promise<void> {
  // Use a heredoc to write content, which handles special characters better
  const command = `cat > ${escapeShellArg(path)} << 'TOSS_EOF'\n${content}\nTOSS_EOF`;
  const result = await exec(connection, command);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to write remote file ${path}: ${result.stderr}`);
  }
}

/**
 * Creates a directory on the remote server (with parents).
 */
export async function mkdirRemote(
  connection: ServerConnection,
  path: string
): Promise<void> {
  const result = await exec(connection, `mkdir -p ${escapeShellArg(path)}`);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to create directory ${path}: ${result.stderr}`);
  }
}

/**
 * Removes a file or directory on the remote server.
 */
export async function removeRemote(
  connection: ServerConnection,
  path: string,
  recursive: boolean = false
): Promise<void> {
  const flags = recursive ? "-rf" : "-f";
  const result = await exec(connection, `rm ${flags} ${escapeShellArg(path)}`);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to remove ${path}: ${result.stderr}`);
  }
}
