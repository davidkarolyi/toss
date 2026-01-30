import type { ServerConnection } from "./config.ts";
import {
  exec,
  mkdirRemote,
  remoteExists,
  removeRemote,
  escapeShellArg,
} from "./ssh.ts";
import {
  getEnvDirectory,
  getReleasesDirectory,
  getPreserveDirectory,
  getCurrentSymlinkPath,
} from "./state.ts";

/**
 * Generates a timestamp string for a release directory name.
 * Format: YYYYMMDD_HHMMSS (e.g., 20260130_143022)
 */
export function generateReleaseTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

/**
 * Gets the full path to a release directory.
 */
export function getReleaseDirectory(
  appName: string,
  environment: string,
  timestamp: string
): string {
  return `${getReleasesDirectory(appName, environment)}/${timestamp}`;
}

/**
 * Ensures the release infrastructure directories exist.
 * Creates releases/ and preserve/ directories if they don't exist.
 */
export async function ensureReleaseDirectories(
  connection: ServerConnection,
  appName: string,
  environment: string
): Promise<void> {
  const releasesDir = getReleasesDirectory(appName, environment);
  const preserveDir = getPreserveDirectory(appName, environment);

  await mkdirRemote(connection, releasesDir, { requiresSudo: true });
  await mkdirRemote(connection, preserveDir, { requiresSudo: true });
}

/**
 * Creates symlinks for persistent directories in a release directory.
 *
 * For each item in persistentDirs:
 * 1. Ensure the directory exists in preserve/ (create if missing)
 * 2. Remove any existing file/dir at that path in the release
 * 3. Create a symlink from release/<item> → envDir/preserve/<item>
 */
export async function linkPersistentDirs(
  connection: ServerConnection,
  appName: string,
  environment: string,
  releaseDir: string,
  persistentDirs: string[]
): Promise<void> {
  if (persistentDirs.length === 0) {
    return;
  }

  const preserveDir = getPreserveDirectory(appName, environment);

  for (const dirPath of persistentDirs) {
    const preserveItemPath = `${preserveDir}/${dirPath}`;
    const releaseItemPath = `${releaseDir}/${dirPath}`;

    // Ensure directory exists in preserve (treat all entries as directories)
    await mkdirRemote(connection, preserveItemPath, { requiresSudo: true });

    // Ensure parent directory exists in release for the symlink
    const releaseItemParent = releaseItemPath.substring(
      0,
      releaseItemPath.lastIndexOf("/")
    );
    if (releaseItemParent && releaseItemParent !== releaseDir) {
      await mkdirRemote(connection, releaseItemParent, { requiresSudo: true });
    }

    // Remove any existing file/directory at the release path
    // (this handles the case where rsync brought in a file that should be preserved)
    const existsInRelease = await remoteExists(connection, releaseItemPath, {
      requiresSudo: true,
    });
    if (existsInRelease) {
      await removeRemote(connection, releaseItemPath, true, {
        requiresSudo: true,
      });
    }

    // Create symlink from release to preserve
    // Using relative path would be nice but absolute is simpler and always works
    const result = await exec(
      connection,
      `ln -s ${escapeShellArg(preserveItemPath)} ${escapeShellArg(releaseItemPath)}`,
      { requiresSudo: true }
    );
    if (result.exitCode !== 0) {
      throw new Error(
        `Failed to create symlink for persistent directory ${dirPath}: ${result.stderr}`
      );
    }
  }
}

/**
 * Atomically switches the current symlink to point to a new release.
 * Uses ln -sfn which atomically replaces the symlink target.
 */
export async function switchCurrentSymlink(
  connection: ServerConnection,
  appName: string,
  environment: string,
  releaseDir: string
): Promise<void> {
  const currentPath = getCurrentSymlinkPath(appName, environment);

  // ln -sfn atomically replaces the symlink target
  // -s = create symbolic link
  // -f = remove existing destination files
  // -n = treat destination as a normal file if it's a symlink to a directory
  const result = await exec(
    connection,
    `ln -sfn ${escapeShellArg(releaseDir)} ${escapeShellArg(currentPath)}`,
    { requiresSudo: true }
  );

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to switch current symlink to ${releaseDir}: ${result.stderr}`
    );
  }
}

/**
 * Gets the target of the current symlink (the active release directory).
 * Returns null if the symlink doesn't exist.
 */
export async function getCurrentReleaseTarget(
  connection: ServerConnection,
  appName: string,
  environment: string
): Promise<string | null> {
  const currentPath = getCurrentSymlinkPath(appName, environment);

  const exists = await remoteExists(connection, currentPath, {
    requiresSudo: true,
  });

  if (!exists) {
    return null;
  }

  const result = await exec(
    connection,
    `readlink -f ${escapeShellArg(currentPath)}`,
    { requiresSudo: true }
  );

  if (result.exitCode !== 0) {
    return null;
  }

  return result.stdout.trim();
}

/**
 * Lists all release directories for an environment, sorted by name (oldest first).
 */
export async function listReleases(
  connection: ServerConnection,
  appName: string,
  environment: string
): Promise<string[]> {
  const releasesDir = getReleasesDirectory(appName, environment);

  const exists = await remoteExists(connection, releasesDir, {
    requiresSudo: true,
  });

  if (!exists) {
    return [];
  }

  const result = await exec(
    connection,
    `ls -1 ${escapeShellArg(releasesDir)} 2>/dev/null | sort`,
    { requiresSudo: true }
  );

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return [];
  }

  return result.stdout
    .trim()
    .split("\n")
    .filter((name) => name.length > 0);
}

/** Default number of releases to keep for production */
export const DEFAULT_KEEP_RELEASES = 3;

/**
 * Result of release cleanup operation
 */
export interface CleanupResult {
  /** Number of releases that were deleted */
  deleted: number;
  /** Names of releases that were deleted */
  deletedReleases: string[];
  /** Number of releases remaining */
  remaining: number;
}

/**
 * Cleans up old releases after a successful deploy.
 *
 * For production environments:
 *   - Keeps the most recent N releases (where N is keepReleases, defaulting to 3)
 *   - Never deletes the current active release
 *
 * For preview environments:
 *   - Only keeps the current release (previews are temporary and don't need rollback)
 *
 * @param connection SSH connection to the server
 * @param appName The application name
 * @param environment The environment (e.g., "production", "pr-42")
 * @param keepReleases Number of releases to keep (only used for production)
 * @returns Information about what was cleaned up
 */
export async function cleanupOldReleases(
  connection: ServerConnection,
  appName: string,
  environment: string,
  keepReleases: number = DEFAULT_KEEP_RELEASES
): Promise<CleanupResult> {
  const releasesDir = getReleasesDirectory(appName, environment);

  // Get all releases (sorted oldest first)
  const allReleases = await listReleases(connection, appName, environment);

  if (allReleases.length === 0) {
    return { deleted: 0, deletedReleases: [], remaining: 0 };
  }

  // Get current release target to ensure we never delete it
  const currentTarget = await getCurrentReleaseTarget(
    connection,
    appName,
    environment
  );

  // Extract just the timestamp from the full path
  const currentReleaseName = currentTarget
    ? currentTarget.split("/").pop()
    : null;

  // Determine how many to keep based on environment type
  const isProduction = environment === "production";
  const releasesToKeep = isProduction ? keepReleases : 1;

  // Find releases to delete
  // Releases are sorted oldest first, so we delete from the beginning
  const releasesToDelete: string[] = [];

  // Keep the newest N releases
  const keepCount = Math.min(releasesToKeep, allReleases.length);
  const candidatesForDeletion = allReleases.slice(
    0,
    allReleases.length - keepCount
  );

  for (const release of candidatesForDeletion) {
    // Safety check: never delete the current release even if math says we should
    if (release === currentReleaseName) {
      continue;
    }
    releasesToDelete.push(release);
  }

  // Delete old releases
  for (const release of releasesToDelete) {
    const releasePath = `${releasesDir}/${release}`;
    await removeRemote(connection, releasePath, true, { requiresSudo: true });
  }

  return {
    deleted: releasesToDelete.length,
    deletedReleases: releasesToDelete,
    remaining: allReleases.length - releasesToDelete.length,
  };
}
