import type { ServerConnection } from "./config.ts";
import { readRemoteFile, writeRemoteFile, remoteExists, mkdirRemote } from "./ssh.ts";

/**
 * Deployment lock information
 */
export interface DeploymentLock {
  environment: string;
  host: string;
  pid: number;
  startedAt: string;
}

/**
 * Deployment entry in state
 */
export interface DeploymentEntry {
  port: number;
}

/**
 * Complete state structure stored in .toss/state.json
 */
export interface TossState {
  origin: string | null;
  deployments: Record<string, DeploymentEntry>;
  appliedDependencies: string[];
  lock: DeploymentLock | null;
}

/**
 * Gets the path to the .toss directory for an app
 */
export function getTossDirectory(appName: string): string {
  return `/srv/${appName}/.toss`;
}

/**
 * Gets the path to the state.json file for an app
 */
export function getStatePath(appName: string): string {
  return `${getTossDirectory(appName)}/state.json`;
}

/**
 * Gets the path to the secrets directory for an app
 */
export function getSecretsDirectory(appName: string): string {
  return `${getTossDirectory(appName)}/secrets`;
}

/**
 * Gets the path to the secrets overrides directory
 */
export function getSecretsOverridesDirectory(appName: string): string {
  return `${getSecretsDirectory(appName)}/overrides`;
}

/**
 * Gets the deployment directory for a specific environment
 */
export function getDeploymentDirectory(appName: string, environment: string): string {
  return `/srv/${appName}/${environment}`;
}

/**
 * Creates an empty state object
 */
export function createEmptyState(origin: string | null = null): TossState {
  return {
    origin,
    deployments: {},
    appliedDependencies: [],
    lock: null,
  };
}

/**
 * Reads the state.json from the server.
 * Returns an empty state if the file doesn't exist.
 */
export async function readState(
  connection: ServerConnection,
  appName: string
): Promise<TossState> {
  const statePath = getStatePath(appName);

  const exists = await remoteExists(connection, statePath);
  if (!exists) {
    return createEmptyState();
  }

  try {
    const content = await readRemoteFile(connection, statePath);
    const parsed = JSON.parse(content);
    return validateState(parsed);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Corrupted state.json at ${statePath}: invalid JSON`);
    }
    throw error;
  }
}

/**
 * Writes the state.json to the server.
 * Creates the .toss directory if it doesn't exist.
 */
export async function writeState(
  connection: ServerConnection,
  appName: string,
  state: TossState
): Promise<void> {
  const tossDirectory = getTossDirectory(appName);
  const statePath = getStatePath(appName);

  // Ensure .toss directory exists
  await mkdirRemote(connection, tossDirectory);

  const content = JSON.stringify(state, null, 2);
  await writeRemoteFile(connection, statePath, content);
}

/**
 * Validates and normalizes state from JSON.
 * Provides defaults for missing fields to handle older state file formats.
 */
function validateState(rawState: unknown): TossState {
  if (typeof rawState !== "object" || rawState === null) {
    throw new Error("state.json must be a JSON object");
  }

  const state = rawState as Record<string, unknown>;

  // Validate and normalize deployments
  let deployments: Record<string, DeploymentEntry> = {};
  if (state.deployments && typeof state.deployments === "object") {
    const rawDeployments = state.deployments as Record<string, unknown>;
    for (const [environment, entry] of Object.entries(rawDeployments)) {
      if (typeof entry === "object" && entry !== null) {
        const typedEntry = entry as Record<string, unknown>;
        if (typeof typedEntry.port === "number") {
          deployments[environment] = { port: typedEntry.port };
        }
      }
    }
  }

  // Validate appliedDependencies
  let appliedDependencies: string[] = [];
  if (Array.isArray(state.appliedDependencies)) {
    appliedDependencies = state.appliedDependencies.filter(
      (item): item is string => typeof item === "string"
    );
  }

  // Validate lock
  let lock: DeploymentLock | null = null;
  if (state.lock && typeof state.lock === "object") {
    const rawLock = state.lock as Record<string, unknown>;
    if (
      typeof rawLock.environment === "string" &&
      typeof rawLock.host === "string" &&
      typeof rawLock.pid === "number" &&
      typeof rawLock.startedAt === "string"
    ) {
      lock = {
        environment: rawLock.environment,
        host: rawLock.host,
        pid: rawLock.pid,
        startedAt: rawLock.startedAt,
      };
    }
  }

  // Validate origin
  const origin = typeof state.origin === "string" ? state.origin : null;

  return {
    origin,
    deployments,
    appliedDependencies,
    lock,
  };
}

/**
 * Updates a specific deployment entry in state.
 * Creates the entry if it doesn't exist.
 */
export async function updateDeployment(
  connection: ServerConnection,
  appName: string,
  environment: string,
  entry: DeploymentEntry
): Promise<TossState> {
  const state = await readState(connection, appName);
  state.deployments[environment] = entry;
  await writeState(connection, appName, state);
  return state;
}

/**
 * Removes a deployment entry from state.
 */
export async function removeDeployment(
  connection: ServerConnection,
  appName: string,
  environment: string
): Promise<TossState> {
  const state = await readState(connection, appName);
  delete state.deployments[environment];
  await writeState(connection, appName, state);
  return state;
}

/**
 * Gets a list of all environment names that have deployments.
 */
export function getDeployedEnvironments(state: TossState): string[] {
  return Object.keys(state.deployments);
}

/**
 * Gets the port for a specific environment, or undefined if not deployed.
 */
export function getPortForEnvironment(state: TossState, environment: string): number | undefined {
  return state.deployments[environment]?.port;
}

/**
 * Result of origin verification
 */
export interface OriginVerificationResult {
  valid: boolean;
  error?: string;
  storedOrigin?: string;
  localOrigin?: string;
}

/**
 * Verifies that the local git origin matches the stored origin in state.
 *
 * This prevents accidental overwrites when two different repos use the same
 * app name. The check is performed during deploy.
 *
 * Returns valid=true if:
 * - Origins match exactly
 * - Server has no stored origin (first deploy or state was created without origin)
 * - Local repo has no origin (not a git repo or no remote configured)
 *
 * Returns valid=false if:
 * - Both origins exist but don't match
 */
export function verifyOrigin(
  storedOrigin: string | null,
  localOrigin: string | null
): OriginVerificationResult {
  // If server has no stored origin, allow deploy (first deploy scenario or legacy state)
  if (storedOrigin === null) {
    return { valid: true };
  }

  // If local repo has no origin, allow deploy (not using git or no remote)
  if (localOrigin === null) {
    return { valid: true };
  }

  // Both origins exist - they must match
  if (normalizeGitOrigin(storedOrigin) !== normalizeGitOrigin(localOrigin)) {
    return {
      valid: false,
      storedOrigin,
      localOrigin,
      error:
        `Project origin mismatch.\n\n` +
        `This server has an app with the same name deployed from a different repository:\n` +
        `  Server origin: ${storedOrigin}\n` +
        `  Local origin:  ${localOrigin}\n\n` +
        `This safety check prevents accidentally overwriting another project.\n\n` +
        `If this is intentional, you can:\n` +
        `  1. Use a different app name in toss.json\n` +
        `  2. Remove the existing deployment with: toss remove <env>`,
    };
  }

  return { valid: true };
}

/**
 * Normalizes a git origin URL for comparison.
 *
 * This handles common variations:
 * - SSH vs HTTPS URLs for the same repo
 * - Trailing .git suffix
 * - Trailing slashes
 */
function normalizeGitOrigin(origin: string): string {
  let normalized = origin.trim();

  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, "");

  // Remove trailing .git
  normalized = normalized.replace(/\.git$/, "");

  // Convert SSH format to a normalized form
  // git@github.com:user/repo -> github.com/user/repo
  const sshMatch = normalized.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    normalized = `${sshMatch[1]}/${sshMatch[2]}`;
  }

  // Convert HTTPS URLs to normalized form
  // https://github.com/user/repo -> github.com/user/repo
  const httpsMatch = normalized.match(/^https?:\/\/([^/]+)\/(.+)$/);
  if (httpsMatch) {
    normalized = `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  return normalized.toLowerCase();
}
