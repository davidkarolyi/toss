import type { ServerConnection } from "./config.ts";
import type { TossState } from "./state.ts";
import { exec } from "./ssh.ts";

/**
 * Starting port for toss-managed services
 */
const BASE_PORT = 3000;

/**
 * Maximum port to check before giving up
 */
const MAX_PORT = 65535;

/**
 * Result of port assignment
 */
export interface PortAssignmentResult {
  port: number;
  isNew: boolean; // true if a new port was assigned, false if existing
}

/**
 * Gets all ports currently in use on the server.
 *
 * Uses `ss -tlnp` to list listening TCP ports. Falls back to `netstat -tlnp`
 * if ss is not available.
 */
export async function getUsedPorts(connection: ServerConnection): Promise<Set<number>> {
  // Try ss first (more modern, usually available)
  let result = await exec(connection, "ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null");

  if (result.exitCode !== 0) {
    // If both commands fail, return empty set and rely on state.json only
    return new Set();
  }

  return parsePortListingOutput(result.stdout);
}

/**
 * Parses the output of ss or netstat to extract port numbers.
 *
 * ss output format:
 * LISTEN 0      128          0.0.0.0:22        0.0.0.0:*
 * LISTEN 0      128             [::]:22           [::]:*
 *
 * netstat output format:
 * tcp    0   0 0.0.0.0:22      0.0.0.0:*       LISTEN
 * tcp6   0   0 :::22           :::*            LISTEN
 */
export function parsePortListingOutput(output: string): Set<number> {
  const ports = new Set<number>();

  const lines = output.split("\n");

  for (const line of lines) {
    // Skip header lines and empty lines
    if (!line.trim() || line.includes("State") || line.includes("Proto")) {
      continue;
    }

    // Look for patterns like:
    // - "0.0.0.0:3000"
    // - "[::]:3000"
    // - "*:3000"
    // - ":::3000"
    // - "127.0.0.1:3000"
    const portMatches = line.match(/(?:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|[\[\]:*]+|\*):(\d+)/g);

    if (portMatches) {
      for (const match of portMatches) {
        const colonIndex = match.lastIndexOf(":");
        const portString = match.slice(colonIndex + 1);
        const port = parseInt(portString, 10);

        if (!isNaN(port) && port > 0 && port <= 65535) {
          ports.add(port);
        }
      }
    }
  }

  return ports;
}

/**
 * Gets all ports currently tracked in state.json
 */
export function getTrackedPorts(state: TossState): Set<number> {
  const ports = new Set<number>();

  for (const deployment of Object.values(state.deployments)) {
    if (deployment.port) {
      ports.add(deployment.port);
    }
  }

  return ports;
}

/**
 * Finds the next available port starting from BASE_PORT.
 *
 * A port is considered available if it's:
 * - Not in the usedPorts set (ports actually listening on the server)
 * - Not in the trackedPorts set (ports assigned in state.json)
 */
export function findNextAvailablePort(
  usedPorts: Set<number>,
  trackedPorts: Set<number>
): number {
  for (let port = BASE_PORT; port <= MAX_PORT; port++) {
    if (!usedPorts.has(port) && !trackedPorts.has(port)) {
      return port;
    }
  }

  throw new Error(
    `No available ports found between ${BASE_PORT} and ${MAX_PORT}. ` +
    "This is highly unusual - please check your server's port usage."
  );
}

/**
 * Resolves or assigns a port for an environment.
 *
 * If the environment already has a port in state.json, returns that port.
 * Otherwise, finds the next available port that is:
 * - Not already assigned in state.json
 * - Not currently in use on the server
 *
 * @param connection Server connection for checking used ports
 * @param state Current state from state.json
 * @param environment The environment to get/assign a port for
 * @returns The port number and whether it was newly assigned
 */
export async function resolvePort(
  connection: ServerConnection,
  state: TossState,
  environment: string
): Promise<PortAssignmentResult> {
  // Check if this environment already has a port assigned
  const existingPort = state.deployments[environment]?.port;
  if (existingPort !== undefined) {
    return {
      port: existingPort,
      isNew: false,
    };
  }

  // Need to assign a new port
  const usedPorts = await getUsedPorts(connection);
  const trackedPorts = getTrackedPorts(state);

  const port = findNextAvailablePort(usedPorts, trackedPorts);

  return {
    port,
    isNew: true,
  };
}
