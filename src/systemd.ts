import type { ServerConnection } from "./config.ts";
import {
  execSudo,
  writeRemoteFile,
  removeRemote,
  escapeShellArg,
  remoteExists,
} from "./ssh.ts";

/**
 * Configuration for generating a systemd service unit file
 */
export interface ServiceConfig {
  appName: string;
  environment: string;
  workingDirectory: string;
  startCommand: string;
  envFilePath: string;
}

/**
 * Status information for a systemd service
 */
export interface ServiceStatus {
  active: boolean;
  running: boolean;
  enabled: boolean;
  status: string;
  pid?: number;
  memory?: string;
  uptime?: string;
}

/**
 * Constructs the systemd service name for a toss deployment.
 * Format: toss-<app>-<env>
 */
export function getServiceName(appName: string, environment: string): string {
  return `toss-${appName}-${environment}`;
}

/**
 * Constructs the path to the systemd unit file for a service.
 */
export function getUnitFilePath(appName: string, environment: string): string {
  const serviceName = getServiceName(appName, environment);
  return `/etc/systemd/system/${serviceName}.service`;
}

/**
 * Generates the content for a systemd service unit file.
 */
export function generateUnitFile(config: ServiceConfig): string {
  const serviceName = getServiceName(config.appName, config.environment);

  return `[Unit]
Description=${serviceName}
After=network.target

[Service]
Type=simple
WorkingDirectory=${config.workingDirectory}
EnvironmentFile=${config.envFilePath}
ExecStart=${config.startCommand}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
}

/**
 * Creates or updates the systemd unit file for a deployment.
 */
export async function createOrUpdateService(
  connection: ServerConnection,
  config: ServiceConfig
): Promise<void> {
  const unitFilePath = getUnitFilePath(config.appName, config.environment);
  const unitContent = generateUnitFile(config);

  await writeRemoteFile(connection, unitFilePath, unitContent, {
    requiresSudo: true,
  });

  // Reload systemd daemon to pick up the new/updated unit file
  await reloadDaemon(connection);
}

/**
 * Reloads the systemd daemon to pick up configuration changes.
 */
export async function reloadDaemon(connection: ServerConnection): Promise<void> {
  const result = await execSudo(connection, "systemctl daemon-reload");

  if (result.exitCode !== 0) {
    throw new Error(`Failed to reload systemd daemon: ${result.stderr}`);
  }
}

/**
 * Starts a systemd service.
 */
export async function startService(
  connection: ServerConnection,
  appName: string,
  environment: string
): Promise<void> {
  const serviceName = getServiceName(appName, environment);
  const result = await execSudo(
    connection,
    `systemctl start ${escapeShellArg(serviceName)}`
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to start service ${serviceName}: ${result.stderr}`);
  }
}

/**
 * Stops a systemd service.
 */
export async function stopService(
  connection: ServerConnection,
  appName: string,
  environment: string
): Promise<void> {
  const serviceName = getServiceName(appName, environment);
  const result = await execSudo(
    connection,
    `systemctl stop ${escapeShellArg(serviceName)}`
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to stop service ${serviceName}: ${result.stderr}`);
  }
}

/**
 * Restarts a systemd service.
 */
export async function restartService(
  connection: ServerConnection,
  appName: string,
  environment: string
): Promise<void> {
  const serviceName = getServiceName(appName, environment);
  const result = await execSudo(
    connection,
    `systemctl restart ${escapeShellArg(serviceName)}`
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to restart service ${serviceName}: ${result.stderr}`);
  }
}

/**
 * Enables a systemd service to start on boot.
 */
export async function enableService(
  connection: ServerConnection,
  appName: string,
  environment: string
): Promise<void> {
  const serviceName = getServiceName(appName, environment);
  const result = await execSudo(
    connection,
    `systemctl enable ${escapeShellArg(serviceName)}`
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to enable service ${serviceName}: ${result.stderr}`);
  }
}

/**
 * Disables a systemd service from starting on boot.
 */
export async function disableService(
  connection: ServerConnection,
  appName: string,
  environment: string
): Promise<void> {
  const serviceName = getServiceName(appName, environment);
  const result = await execSudo(
    connection,
    `systemctl disable ${escapeShellArg(serviceName)}`
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to disable service ${serviceName}: ${result.stderr}`);
  }
}

/**
 * Gets the status of a systemd service.
 */
export async function getServiceStatus(
  connection: ServerConnection,
  appName: string,
  environment: string
): Promise<ServiceStatus> {
  const serviceName = getServiceName(appName, environment);

  // Check if the service is active/running
  const isActiveResult = await execSudo(
    connection,
    `systemctl is-active ${escapeShellArg(serviceName)}`
  );
  const activeState = isActiveResult.stdout.trim();
  const active = isActiveResult.exitCode === 0;
  const running = activeState === "active";

  // Check if enabled
  const isEnabledResult = await execSudo(
    connection,
    `systemctl is-enabled ${escapeShellArg(serviceName)}`
  );
  const enabled = isEnabledResult.exitCode === 0;

  // Get detailed status for additional info
  const statusResult = await execSudo(
    connection,
    `systemctl show ${escapeShellArg(serviceName)} --property=MainPID,MemoryCurrent,ActiveEnterTimestamp --no-pager`
  );

  let pid: number | undefined;
  let memory: string | undefined;
  let uptime: string | undefined;

  if (statusResult.exitCode === 0) {
    const lines = statusResult.stdout.split("\n");
    for (const line of lines) {
      const [key, value] = line.split("=", 2);
      if (key === "MainPID" && value && value !== "0") {
        pid = parseInt(value, 10);
        if (isNaN(pid)) pid = undefined;
      } else if (key === "MemoryCurrent" && value && value !== "[not set]") {
        const bytes = parseInt(value, 10);
        if (!isNaN(bytes) && bytes > 0) {
          memory = formatBytes(bytes);
        }
      } else if (key === "ActiveEnterTimestamp" && value && running) {
        uptime = value;
      }
    }
  }

  return {
    active,
    running,
    enabled,
    status: activeState,
    pid,
    memory,
    uptime,
  };
}

/**
 * Checks if a systemd service exists.
 */
export async function serviceExists(
  connection: ServerConnection,
  appName: string,
  environment: string
): Promise<boolean> {
  const unitFilePath = getUnitFilePath(appName, environment);
  return remoteExists(connection, unitFilePath);
}

/**
 * Removes a systemd service completely.
 * Stops the service, disables it, removes the unit file, and reloads the daemon.
 */
export async function removeService(
  connection: ServerConnection,
  appName: string,
  environment: string
): Promise<void> {
  const serviceName = getServiceName(appName, environment);
  const unitFilePath = getUnitFilePath(appName, environment);

  // Check if service exists
  const exists = await serviceExists(connection, appName, environment);
  if (!exists) {
    return; // Nothing to remove
  }

  // Stop the service (ignore errors if not running)
  await execSudo(connection, `systemctl stop ${escapeShellArg(serviceName)}`);

  // Disable the service (ignore errors if not enabled)
  await execSudo(connection, `systemctl disable ${escapeShellArg(serviceName)}`);

  // Remove the unit file
  await removeRemote(connection, unitFilePath, false, { requiresSudo: true });

  // Reload daemon
  await reloadDaemon(connection);
}

/**
 * Starts or restarts a service based on whether it's currently running.
 * Useful for deployments where we want to ensure the service is running with the latest code.
 */
export async function startOrRestartService(
  connection: ServerConnection,
  appName: string,
  environment: string
): Promise<void> {
  const status = await getServiceStatus(connection, appName, environment);

  if (status.running) {
    await restartService(connection, appName, environment);
  } else {
    await startService(connection, appName, environment);
  }
}

/**
 * Formats bytes into a human-readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const base = 1024;
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(base));
  const value = bytes / Math.pow(base, unitIndex);

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
