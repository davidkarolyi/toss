import { describe, expect, test } from "bun:test";
import {
  generateReleaseTimestamp,
  getReleaseDirectory,
} from "./releases.ts";
import {
  getEnvDirectory,
  getReleasesDirectory,
  getPreserveDirectory,
  getCurrentSymlinkPath,
  getCurrentWorkingDirectory,
} from "./state.ts";

describe("generateReleaseTimestamp", () => {
  test("returns a string in YYYYMMDD_HHMMSS format", () => {
    const timestamp = generateReleaseTimestamp();
    expect(timestamp).toMatch(/^\d{8}_\d{6}$/);
  });

  test("generates unique timestamps for different calls", async () => {
    const timestamp1 = generateReleaseTimestamp();
    // Wait 1 second to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const timestamp2 = generateReleaseTimestamp();
    expect(timestamp1).not.toBe(timestamp2);
  });

  test("timestamps sort chronologically", async () => {
    const timestamps: string[] = [];
    for (let i = 0; i < 3; i++) {
      timestamps.push(generateReleaseTimestamp());
      if (i < 2) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    const sorted = [...timestamps].sort();
    expect(sorted).toEqual(timestamps);
  });
});

describe("getReleaseDirectory", () => {
  test("constructs release directory path correctly", () => {
    const result = getReleaseDirectory("myapp", "production", "20260130_143022");
    expect(result).toBe("/srv/myapp/production/releases/20260130_143022");
  });

  test("handles different environments", () => {
    const prod = getReleaseDirectory("myapp", "production", "20260130_143022");
    const preview = getReleaseDirectory("myapp", "pr-42", "20260130_143022");

    expect(prod).toBe("/srv/myapp/production/releases/20260130_143022");
    expect(preview).toBe("/srv/myapp/pr-42/releases/20260130_143022");
  });

  test("handles different app names", () => {
    const app1 = getReleaseDirectory("app-one", "production", "20260130_143022");
    const app2 = getReleaseDirectory("app-two", "production", "20260130_143022");

    expect(app1).toBe("/srv/app-one/production/releases/20260130_143022");
    expect(app2).toBe("/srv/app-two/production/releases/20260130_143022");
  });
});

describe("getEnvDirectory", () => {
  test("returns the environment directory path", () => {
    expect(getEnvDirectory("myapp", "production")).toBe("/srv/myapp/production");
    expect(getEnvDirectory("myapp", "pr-42")).toBe("/srv/myapp/pr-42");
  });
});

describe("getReleasesDirectory", () => {
  test("returns the releases directory path", () => {
    expect(getReleasesDirectory("myapp", "production")).toBe("/srv/myapp/production/releases");
    expect(getReleasesDirectory("myapp", "pr-42")).toBe("/srv/myapp/pr-42/releases");
  });
});

describe("getPreserveDirectory", () => {
  test("returns the preserve directory path", () => {
    expect(getPreserveDirectory("myapp", "production")).toBe("/srv/myapp/production/preserve");
    expect(getPreserveDirectory("myapp", "pr-42")).toBe("/srv/myapp/pr-42/preserve");
  });
});

describe("getCurrentSymlinkPath", () => {
  test("returns the current symlink path", () => {
    expect(getCurrentSymlinkPath("myapp", "production")).toBe("/srv/myapp/production/current");
    expect(getCurrentSymlinkPath("myapp", "pr-42")).toBe("/srv/myapp/pr-42/current");
  });
});

describe("getCurrentWorkingDirectory", () => {
  test("returns the current working directory (same as symlink)", () => {
    expect(getCurrentWorkingDirectory("myapp", "production")).toBe("/srv/myapp/production/current");
    expect(getCurrentWorkingDirectory("myapp", "pr-42")).toBe("/srv/myapp/pr-42/current");
  });
});
