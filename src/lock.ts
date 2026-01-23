import os from "node:os";
import type { ServerConnection } from "./config.ts";
import type { TossState, DeploymentLock } from "./state.ts";
import { readState, writeState } from "./state.ts";

/**
 * Lock timeout in milliseconds.
 * Locks older than this are considered stale and can be broken automatically.
 */
const LOCK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Result of attempting to acquire a lock
 */
export interface AcquireLockResult {
  acquired: boolean;
  lock?: DeploymentLock;
  existingLock?: DeploymentLock;
  reason?: string;
}

/**
 * Creates a new lock object for the current process.
 */
export function createLock(environment: string): DeploymentLock {
  return {
    environment,
    host: os.hostname(),
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };
}

/**
 * Checks if a lock is stale (older than 30 minutes).
 */
export function isLockStale(lock: DeploymentLock): boolean {
  const lockTime = new Date(lock.startedAt).getTime();
  const now = Date.now();
  return now - lockTime > LOCK_TIMEOUT_MS;
}

/**
 * Calculates how long a lock has been held.
 */
export function getLockAge(lock: DeploymentLock): { minutes: number; seconds: number } {
  const lockTime = new Date(lock.startedAt).getTime();
  const now = Date.now();
  const ageMs = now - lockTime;
  const totalSeconds = Math.floor(ageMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return { minutes, seconds };
}

/**
 * Checks if a lock is held by the current process.
 */
export function isOwnLock(lock: DeploymentLock): boolean {
  return lock.host === os.hostname() && lock.pid === process.pid;
}

/**
 * Checks if a lock appears to be from a dead process on the same host.
 *
 * Note: This can only reliably detect dead processes on the same host.
 * For locks from different hosts, we cannot verify if the process is alive.
 */
export function isDeadProcessLock(lock: DeploymentLock): boolean {
  // Can only check processes on the same host
  if (lock.host !== os.hostname()) {
    return false;
  }

  // Check if the process still exists by sending signal 0
  try {
    process.kill(lock.pid, 0);
    return false; // Process exists
  } catch {
    return true; // Process does not exist
  }
}

/**
 * Formats lock information for display to the user.
 */
export function formatLockInfo(lock: DeploymentLock): string {
  const { minutes, seconds } = getLockAge(lock);
  const ageString =
    minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  return (
    `Deploy locked by ${lock.host} (pid ${lock.pid})\n` +
    `  Environment: ${lock.environment}\n` +
    `  Started: ${lock.startedAt} (${ageString} ago)`
  );
}

/**
 * Formats a lock error message with actionable information.
 */
export function formatLockError(lock: DeploymentLock): string {
  let message = `⚠ ${formatLockInfo(lock)}\n\n`;

  if (isLockStale(lock)) {
    message += "The lock appears to be stale (older than 30 minutes).\n";
    message += "This may indicate a crashed deploy process.\n\n";
    message += "The lock will be automatically broken on the next deploy attempt.";
  } else {
    message += "Another deploy is in progress. Please wait for it to complete.\n\n";
    message += "If you believe this is an error (e.g., the other process crashed),\n";
    message += "wait 30 minutes for the lock to become stale, or manually clear\n";
    message += "the lock in .toss/state.json on the server.";
  }

  return message;
}

/**
 * Attempts to acquire a deployment lock.
 *
 * Lock acquisition rules:
 * 1. If no lock exists, acquire it
 * 2. If the lock is owned by this process, allow (re-entrant)
 * 3. If the lock is stale (>30 min), break it and acquire
 * 4. If the lock is from a dead process on the same host, break it and acquire
 * 5. Otherwise, refuse and return the existing lock info
 *
 * @param connection Server connection details
 * @param appName App name for state file
 * @param environment Environment being deployed
 * @returns Result indicating whether lock was acquired
 */
export async function acquireLock(
  connection: ServerConnection,
  appName: string,
  environment: string
): Promise<AcquireLockResult> {
  const state = await readState(connection, appName);

  // No existing lock - acquire it
  if (!state.lock) {
    const newLock = createLock(environment);
    state.lock = newLock;
    await writeState(connection, appName, state);
    return { acquired: true, lock: newLock };
  }

  const existingLock = state.lock;

  // Already own this lock (re-entrant)
  if (isOwnLock(existingLock)) {
    return { acquired: true, lock: existingLock };
  }

  // Lock is stale - break it
  if (isLockStale(existingLock)) {
    const newLock = createLock(environment);
    state.lock = newLock;
    await writeState(connection, appName, state);
    return {
      acquired: true,
      lock: newLock,
      existingLock,
      reason: "Previous lock was stale (older than 30 minutes)",
    };
  }

  // Lock is from a dead process on this host - break it
  if (isDeadProcessLock(existingLock)) {
    const newLock = createLock(environment);
    state.lock = newLock;
    await writeState(connection, appName, state);
    return {
      acquired: true,
      lock: newLock,
      existingLock,
      reason: "Previous lock holder process is no longer running",
    };
  }

  // Lock is active and valid - cannot acquire
  return {
    acquired: false,
    existingLock,
    reason: "Another deploy is in progress",
  };
}

/**
 * Releases the deployment lock.
 *
 * Only releases the lock if it's owned by the current process.
 * This prevents accidentally releasing another process's lock.
 *
 * @param connection Server connection details
 * @param appName App name for state file
 * @returns True if lock was released, false if no matching lock was found
 */
export async function releaseLock(
  connection: ServerConnection,
  appName: string
): Promise<boolean> {
  const state = await readState(connection, appName);

  // No lock to release
  if (!state.lock) {
    return false;
  }

  // Only release if we own the lock
  if (!isOwnLock(state.lock)) {
    return false;
  }

  state.lock = null;
  await writeState(connection, appName, state);
  return true;
}

/**
 * Force releases any existing lock, regardless of owner.
 *
 * Use with caution - this should only be used for recovery scenarios.
 *
 * @param connection Server connection details
 * @param appName App name for state file
 * @returns The lock that was released, or null if no lock existed
 */
export async function forceReleaseLock(
  connection: ServerConnection,
  appName: string
): Promise<DeploymentLock | null> {
  const state = await readState(connection, appName);

  if (!state.lock) {
    return null;
  }

  const releasedLock = state.lock;
  state.lock = null;
  await writeState(connection, appName, state);
  return releasedLock;
}

/**
 * Gets the current lock status without modifying it.
 *
 * @param connection Server connection details
 * @param appName App name for state file
 * @returns Current lock or null if no lock exists
 */
export async function getLockStatus(
  connection: ServerConnection,
  appName: string
): Promise<DeploymentLock | null> {
  const state = await readState(connection, appName);
  return state.lock;
}

/**
 * Executes a function with a deployment lock.
 *
 * This is the primary way to use locking during deploys:
 * - Acquires the lock before executing
 * - Releases the lock after completion (success or failure)
 * - Handles stale/dead locks automatically
 *
 * @param connection Server connection details
 * @param appName App name for state file
 * @param environment Environment being deployed
 * @param fn The function to execute while holding the lock
 * @param options Optional callbacks for lock events
 * @returns The result of fn()
 * @throws If lock cannot be acquired, or if fn() throws
 */
export async function withLock<T>(
  connection: ServerConnection,
  appName: string,
  environment: string,
  fn: () => Promise<T>,
  options: {
    onLockAcquired?: (result: AcquireLockResult) => void;
    onLockReleased?: () => void;
  } = {}
): Promise<T> {
  const { onLockAcquired, onLockReleased } = options;

  // Attempt to acquire lock
  const lockResult = await acquireLock(connection, appName, environment);

  if (!lockResult.acquired) {
    throw new LockError(lockResult.existingLock!);
  }

  onLockAcquired?.(lockResult);

  try {
    return await fn();
  } finally {
    await releaseLock(connection, appName);
    onLockReleased?.();
  }
}

/**
 * Error thrown when a lock cannot be acquired.
 */
export class LockError extends Error {
  public readonly existingLock: DeploymentLock;

  constructor(existingLock: DeploymentLock) {
    super(formatLockError(existingLock));
    this.name = "LockError";
    this.existingLock = existingLock;
  }
}
