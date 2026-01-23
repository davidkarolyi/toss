import { describe, test, expect } from "bun:test";
import {
  getMissingDependencies,
  formatDependencyError,
} from "./dependencies.ts";
import type { DependencyResult } from "./dependencies.ts";

describe("getMissingDependencies", () => {
  test("returns empty array when config has no dependencies", () => {
    const result = getMissingDependencies(undefined, []);
    expect(result).toEqual([]);
  });

  test("returns empty array when config dependencies is empty object", () => {
    const result = getMissingDependencies({}, []);
    expect(result).toEqual([]);
  });

  test("returns all dependencies when none are applied", () => {
    const dependencies = {
      nodejs: "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
      bun: "curl -fsSL https://bun.sh/install | bash",
    };

    const result = getMissingDependencies(dependencies, []);

    expect(result).toContain("nodejs");
    expect(result).toContain("bun");
    expect(result).toHaveLength(2);
  });

  test("returns only missing dependencies when some are applied", () => {
    const dependencies = {
      nodejs: "apt install nodejs",
      bun: "curl -fsSL https://bun.sh/install | bash",
      redis: "apt install redis-server",
    };

    const result = getMissingDependencies(dependencies, ["nodejs"]);

    expect(result).toContain("bun");
    expect(result).toContain("redis");
    expect(result).not.toContain("nodejs");
    expect(result).toHaveLength(2);
  });

  test("returns empty array when all dependencies are applied", () => {
    const dependencies = {
      nodejs: "apt install nodejs",
      bun: "curl -fsSL https://bun.sh/install | bash",
    };

    const result = getMissingDependencies(dependencies, ["nodejs", "bun"]);

    expect(result).toEqual([]);
  });

  test("ignores applied dependencies not in config", () => {
    const dependencies = {
      nodejs: "apt install nodejs",
    };

    // "bun" was previously applied but is no longer in config
    const result = getMissingDependencies(dependencies, ["bun"]);

    expect(result).toEqual(["nodejs"]);
  });

  test("handles multiple missing and applied dependencies", () => {
    const dependencies = {
      nodejs: "install nodejs",
      bun: "install bun",
      redis: "install redis",
      postgres: "install postgres",
      nginx: "install nginx",
    };

    const result = getMissingDependencies(dependencies, ["nodejs", "postgres"]);

    expect(result).toContain("bun");
    expect(result).toContain("redis");
    expect(result).toContain("nginx");
    expect(result).not.toContain("nodejs");
    expect(result).not.toContain("postgres");
    expect(result).toHaveLength(3);
  });
});

describe("formatDependencyError", () => {
  test("includes dependency name in error message", () => {
    const result: DependencyResult = {
      name: "nodejs",
      success: false,
      error: "apt-get not found",
    };

    const message = formatDependencyError(result);

    expect(message).toContain("nodejs");
    expect(message).toContain("Failed to install dependency");
  });

  test("includes error details when available", () => {
    const result: DependencyResult = {
      name: "bun",
      success: false,
      error: "curl: command not found",
    };

    const message = formatDependencyError(result);

    expect(message).toContain("curl: command not found");
  });

  test("includes hint about where to find the command", () => {
    const result: DependencyResult = {
      name: "redis",
      success: false,
      error: "installation failed",
    };

    const message = formatDependencyError(result);

    expect(message).toContain("toss.json");
    expect(message).toContain("dependencies.redis");
  });

  test("handles result without error message", () => {
    const result: DependencyResult = {
      name: "postgres",
      success: false,
    };

    const message = formatDependencyError(result);

    expect(message).toContain("postgres");
    expect(message).toContain("toss.json");
  });
});

describe("DependencyResult type", () => {
  test("success result has expected shape", () => {
    const result: DependencyResult = {
      name: "nodejs",
      success: true,
      output: "Node.js v20.10.0 installed successfully",
    };

    expect(result.name).toBe("nodejs");
    expect(result.success).toBe(true);
    expect(result.output).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  test("failure result has expected shape", () => {
    const result: DependencyResult = {
      name: "bun",
      success: false,
      output: "Partial output before failure",
      error: "Network error: connection refused",
    };

    expect(result.name).toBe("bun");
    expect(result.success).toBe(false);
    expect(result.output).toBeDefined();
    expect(result.error).toBeDefined();
  });
});
