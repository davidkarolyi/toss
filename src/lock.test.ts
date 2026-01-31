import { describe, test, expect } from "bun:test";
import os from "node:os";
import {
  createLock,
  isLockStale,
  getLockAge,
  isOwnLock,
  isDeadProcessLock,
  formatLockInfo,
  formatLockError,
  LockError,
} from "./lock.ts";
import type { DeploymentLock } from "./state.ts";

describe("createLock", () => {
  test("creates lock with current hostname and pid", () => {
    const lock = createLock("prod");

    expect(lock.environment).toBe("prod");
    expect(lock.host).toBe(os.hostname());
    expect(lock.pid).toBe(process.pid);
    expect(typeof lock.startedAt).toBe("string");
  });

  test("creates lock with valid ISO timestamp", () => {
    const lock = createLock("pr-42");

    const timestamp = new Date(lock.startedAt);
    expect(timestamp.getTime()).not.toBeNaN();
    // Timestamp should be recent (within last second)
    expect(Date.now() - timestamp.getTime()).toBeLessThan(1000);
  });

  test("preserves environment name", () => {
    expect(createLock("prod").environment).toBe("prod");
    expect(createLock("pr-42").environment).toBe("pr-42");
    expect(createLock("staging").environment).toBe("staging");
  });
});

describe("isLockStale", () => {
  test("returns false for fresh lock", () => {
    const lock = createLock("prod");
    expect(isLockStale(lock)).toBe(false);
  });

  test("returns false for lock under 30 minutes old", () => {
    const lock: DeploymentLock = {
      environment: "prod",
      host: "test-host",
      pid: 12345,
      startedAt: new Date(Date.now() - 29 * 60 * 1000).toISOString(), // 29 minutes ago
    };
    expect(isLockStale(lock)).toBe(false);
  });

  test("returns true for lock exactly 30 minutes old", () => {
    const lock: DeploymentLock = {
      environment: "prod",
      host: "test-host",
      pid: 12345,
      startedAt: new Date(Date.now() - 30 * 60 * 1000 - 1).toISOString(), // Just over 30 minutes
    };
    expect(isLockStale(lock)).toBe(true);
  });

  test("returns true for lock over 30 minutes old", () => {
    const lock: DeploymentLock = {
      environment: "prod",
      host: "test-host",
      pid: 12345,
      startedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
    };
    expect(isLockStale(lock)).toBe(true);
  });

  test("returns true for very old lock", () => {
    const lock: DeploymentLock = {
      environment: "prod",
      host: "test-host",
      pid: 12345,
      startedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    };
    expect(isLockStale(lock)).toBe(true);
  });
});

describe("getLockAge", () => {
  test("returns correct age for fresh lock", () => {
    const lock = createLock("prod");
    const { minutes, seconds } = getLockAge(lock);

    expect(minutes).toBe(0);
    expect(seconds).toBeLessThan(2); // Should be nearly instant
  });

  test("returns correct age for older lock", () => {
    const lock: DeploymentLock = {
      environment: "prod",
      host: "test-host",
      pid: 12345,
      startedAt: new Date(Date.now() - 5 * 60 * 1000 - 30 * 1000).toISOString(), // 5 min 30 sec ago
    };
    const { minutes, seconds } = getLockAge(lock);

    expect(minutes).toBe(5);
    expect(seconds).toBeGreaterThanOrEqual(29);
    expect(seconds).toBeLessThanOrEqual(31);
  });

  test("returns only seconds for sub-minute age", () => {
    const lock: DeploymentLock = {
      environment: "prod",
      host: "test-host",
      pid: 12345,
      startedAt: new Date(Date.now() - 45 * 1000).toISOString(), // 45 seconds ago
    };
    const { minutes, seconds } = getLockAge(lock);

    expect(minutes).toBe(0);
    expect(seconds).toBeGreaterThanOrEqual(44);
    expect(seconds).toBeLessThanOrEqual(46);
  });
});

describe("isOwnLock", () => {
  test("returns true for lock owned by current process", () => {
    const lock = createLock("prod");
    expect(isOwnLock(lock)).toBe(true);
  });

  test("returns false for lock from different host", () => {
    const lock: DeploymentLock = {
      environment: "prod",
      host: "different-host",
      pid: process.pid,
      startedAt: new Date().toISOString(),
    };
    expect(isOwnLock(lock)).toBe(false);
  });

  test("returns false for lock from different pid", () => {
    const lock: DeploymentLock = {
      environment: "prod",
      host: os.hostname(),
      pid: process.pid + 99999, // Different PID
      startedAt: new Date().toISOString(),
    };
    expect(isOwnLock(lock)).toBe(false);
  });

  test("returns false for lock from different host and pid", () => {
    const lock: DeploymentLock = {
      environment: "prod",
      host: "different-host",
      pid: 99999,
      startedAt: new Date().toISOString(),
    };
    expect(isOwnLock(lock)).toBe(false);
  });
});

describe("isDeadProcessLock", () => {
  test("returns false for lock from different host", () => {
    const lock: DeploymentLock = {
      environment: "prod",
      host: "different-host",
      pid: 1, // Likely always running (init)
      startedAt: new Date().toISOString(),
    };
    // Cannot verify processes on other hosts
    expect(isDeadProcessLock(lock)).toBe(false);
  });

  test("returns false for lock from current process", () => {
    const lock = createLock("prod");
    expect(isDeadProcessLock(lock)).toBe(false);
  });

  test("returns true for lock from dead process on same host", () => {
    const lock: DeploymentLock = {
      environment: "prod",
      host: os.hostname(),
      pid: 999999999, // Very unlikely to be a real PID
      startedAt: new Date().toISOString(),
    };
    expect(isDeadProcessLock(lock)).toBe(true);
  });

  test("returns false for lock from live process on same host", () => {
    // Use current process PID which is guaranteed to be running
    const lock: DeploymentLock = {
      environment: "prod",
      host: os.hostname(),
      pid: process.pid,
      startedAt: new Date().toISOString(),
    };
    expect(isDeadProcessLock(lock)).toBe(false);
  });
});

describe("formatLockInfo", () => {
  test("includes all lock details", () => {
    const lock: DeploymentLock = {
      environment: "pr-42",
      host: "laptop.local",
      pid: 12345,
      startedAt: new Date().toISOString(),
    };
    const info = formatLockInfo(lock);

    expect(info).toContain("laptop.local");
    expect(info).toContain("12345");
    expect(info).toContain("pr-42");
    expect(info).toContain("ago");
  });

  test("shows age in minutes and seconds for older locks", () => {
    const lock: DeploymentLock = {
      environment: "prod",
      host: "test-host",
      pid: 12345,
      startedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
    };
    const info = formatLockInfo(lock);

    expect(info).toMatch(/5m \d+s ago/);
  });

  test("shows age in seconds only for fresh locks", () => {
    const lock: DeploymentLock = {
      environment: "prod",
      host: "test-host",
      pid: 12345,
      startedAt: new Date(Date.now() - 30 * 1000).toISOString(), // 30 seconds ago
    };
    const info = formatLockInfo(lock);

    expect(info).toMatch(/\d+s ago/);
    expect(info).not.toMatch(/\dm/);
  });
});

describe("formatLockError", () => {
  test("includes lock info for active lock", () => {
    const lock: DeploymentLock = {
      environment: "pr-42",
      host: "other-laptop.local",
      pid: 54321,
      startedAt: new Date().toISOString(),
    };
    const error = formatLockError(lock);

    expect(error).toContain("other-laptop.local");
    expect(error).toContain("54321");
    expect(error).toContain("Another deploy is in progress");
  });

  test("indicates stale lock for old locks", () => {
    const lock: DeploymentLock = {
      environment: "prod",
      host: "crashed-server.local",
      pid: 99999,
      startedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(), // 45 minutes ago
    };
    const error = formatLockError(lock);

    expect(error).toContain("stale");
    expect(error).toContain("30 minutes");
    expect(error).toContain("automatically broken");
  });

  test("suggests waiting for active locks", () => {
    const lock: DeploymentLock = {
      environment: "prod",
      host: "coworker-laptop.local",
      pid: 11111,
      startedAt: new Date().toISOString(),
    };
    const error = formatLockError(lock);

    expect(error).toContain("wait");
    expect(error).toContain("state.json");
  });
});

describe("LockError", () => {
  test("has correct name", () => {
    const lock = createLock("prod");
    const error = new LockError(lock);
    expect(error.name).toBe("LockError");
  });

  test("includes lock in message", () => {
    const lock: DeploymentLock = {
      environment: "pr-42",
      host: "blocker.local",
      pid: 12345,
      startedAt: new Date().toISOString(),
    };
    const error = new LockError(lock);

    expect(error.message).toContain("blocker.local");
    expect(error.message).toContain("12345");
  });

  test("exposes existing lock", () => {
    const lock = createLock("staging");
    const error = new LockError(lock);

    expect(error.existingLock).toBe(lock);
    expect(error.existingLock.environment).toBe("staging");
  });

  test("is instanceof Error", () => {
    const lock = createLock("prod");
    const error = new LockError(lock);
    expect(error instanceof Error).toBe(true);
    expect(error instanceof LockError).toBe(true);
  });
});

describe("lock timeout constant", () => {
  test("stale threshold is 30 minutes", () => {
    // Lock at exactly 30 minutes should be stale
    const borderlineLock: DeploymentLock = {
      environment: "prod",
      host: "test-host",
      pid: 12345,
      startedAt: new Date(Date.now() - 30 * 60 * 1000 - 1).toISOString(),
    };
    expect(isLockStale(borderlineLock)).toBe(true);

    // Lock just under 30 minutes should not be stale
    const freshLock: DeploymentLock = {
      environment: "prod",
      host: "test-host",
      pid: 12345,
      startedAt: new Date(Date.now() - 30 * 60 * 1000 + 1000).toISOString(),
    };
    expect(isLockStale(freshLock)).toBe(false);
  });
});
