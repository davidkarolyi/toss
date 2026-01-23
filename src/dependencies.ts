import type { ServerConnection, TossConfig } from "./config.ts";
import type { TossState } from "./state.ts";
import { exec } from "./ssh.ts";
import { writeState } from "./state.ts";

/**
 * Result of applying a single dependency
 */
export interface DependencyResult {
  name: string;
  success: boolean;
  output?: string;
  error?: string;
}

/**
 * Result of applying all dependencies
 */
export interface ApplyDependenciesResult {
  applied: DependencyResult[];
  skipped: string[];
  success: boolean;
}

/**
 * Determines which dependencies from config have not yet been applied to the server.
 */
export function getMissingDependencies(
  configDependencies: Record<string, string> | undefined,
  appliedDependencies: string[]
): string[] {
  if (!configDependencies) {
    return [];
  }

  const configuredNames = Object.keys(configDependencies);
  const appliedSet = new Set(appliedDependencies);

  return configuredNames.filter((name) => !appliedSet.has(name));
}

/**
 * Applies missing server dependencies from the config.
 *
 * Dependencies are install commands that should only run once per server,
 * not on every deploy. Examples: runtime installations (Node.js, Bun, etc.)
 *
 * This function:
 * 1. Checks which dependencies from config are not yet applied
 * 2. Runs install commands for missing dependencies (in order)
 * 3. Updates state.json with newly applied dependencies after each success
 * 4. Fails fast if any dependency command fails
 *
 * @param connection Server connection details
 * @param config The toss config containing dependencies
 * @param state Current server state (will be mutated)
 * @param appName App name for state file path
 * @param options Optional configuration
 * @returns Result indicating what was applied/skipped and overall success
 */
export async function applyDependencies(
  connection: ServerConnection,
  config: TossConfig,
  state: TossState,
  appName: string,
  options: { onProgress?: (message: string) => void } = {}
): Promise<ApplyDependenciesResult> {
  const { onProgress } = options;

  const missingDependencies = getMissingDependencies(
    config.dependencies,
    state.appliedDependencies
  );

  // All dependencies already applied
  if (missingDependencies.length === 0) {
    const skipped = config.dependencies ? Object.keys(config.dependencies) : [];
    return {
      applied: [],
      skipped,
      success: true,
    };
  }

  const result: ApplyDependenciesResult = {
    applied: [],
    skipped: state.appliedDependencies.slice(), // Already applied ones
    success: true,
  };

  // Apply each missing dependency in order
  for (const dependencyName of missingDependencies) {
    // We know this exists because missingDependencies was derived from Object.keys(config.dependencies)
    const command = config.dependencies?.[dependencyName];
    if (!command) {
      continue; // Should never happen, but satisfies TypeScript
    }

    onProgress?.(`Installing ${dependencyName}...`);

    const dependencyResult = await applyDependency(
      connection,
      dependencyName,
      command
    );

    result.applied.push(dependencyResult);

    if (!dependencyResult.success) {
      result.success = false;
      // Fail fast - don't continue with other dependencies
      break;
    }

    // Update state immediately after each successful install
    // This ensures partial progress is persisted if a later dependency fails
    state.appliedDependencies.push(dependencyName);
    await writeState(connection, appName, state);
  }

  return result;
}

/**
 * Applies a single dependency by running its install command.
 */
async function applyDependency(
  connection: ServerConnection,
  name: string,
  command: string
): Promise<DependencyResult> {
  const execResult = await exec(connection, command, { stream: true });

  if (execResult.exitCode !== 0) {
    return {
      name,
      success: false,
      output: execResult.stdout,
      error:
        execResult.stderr.trim() ||
        execResult.stdout.trim() ||
        `Command exited with code ${execResult.exitCode}`,
    };
  }

  return {
    name,
    success: true,
    output: execResult.stdout,
  };
}

/**
 * Formats an error message for a failed dependency installation.
 */
export function formatDependencyError(result: DependencyResult): string {
  let message = `Failed to install dependency "${result.name}"`;

  if (result.error) {
    message += `:\n${result.error}`;
  }

  message += `\n\nThe dependency command can be found in toss.json under dependencies.${result.name}`;

  return message;
}
