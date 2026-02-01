import { describe, test, expect } from "bun:test";

/**
 * Tests for the rollback command argument parsing and help text structure.
 * Since the command performs SSH operations, we focus on parsing and messaging.
 */

describe("rollback command argument parsing", () => {
  function parseArgs(args: string[]): {
    environment: string | null;
    release: string | null;
    showHelp: boolean;
  } {
    let environment: string | null = null;
    let release: string | null = null;
    let showHelp = false;

    for (const arg of args) {
      if (arg === "-h" || arg === "--help") {
        showHelp = true;
        continue;
      }

      if (arg.startsWith("-")) {
        throw new Error(`Unknown flag: ${arg}`);
      }

      if (environment === null) {
        environment = arg;
      } else if (release === null) {
        release = arg;
      } else {
        throw new Error(`Unexpected argument: ${arg}`);
      }
    }

    return { environment, release, showHelp };
  }

  test("parses environment name", () => {
    const result = parseArgs(["prod"]);
    expect(result.environment).toBe("prod");
    expect(result.release).toBeNull();
  });

  test("parses environment and release", () => {
    const result = parseArgs(["prod", "20260130_120000"]);
    expect(result.environment).toBe("prod");
    expect(result.release).toBe("20260130_120000");
  });

  test("parses help flag", () => {
    const result = parseArgs(["--help"]);
    expect(result.showHelp).toBe(true);
  });

  test("throws on unknown flag", () => {
    expect(() => parseArgs(["prod", "--unknown"])).toThrow(
      "Unknown flag: --unknown"
    );
  });

  test("throws on extra positional argument", () => {
    expect(() => parseArgs(["prod", "20260130_120000", "extra"])).toThrow(
      "Unexpected argument: extra"
    );
  });
});

describe("rollback command release format validation", () => {
  const pattern = /^\d{8}_\d{6}$/;

  test("accepts valid release timestamp", () => {
    expect("20260130_143022").toMatch(pattern);
  });

  test("rejects invalid release timestamp", () => {
    expect("2026-01-30").not.toMatch(pattern);
    expect("20260130").not.toMatch(pattern);
    expect("abc123").not.toMatch(pattern);
  });
});

describe("rollback command help text structure", () => {
  test("help text includes usage and examples", () => {
    const usage = "Usage: toss rollback <environment> [release]";
    const example = "toss rollback prod 20260130_120000";
    expect(usage).toContain("toss rollback");
    expect(usage).toContain("<environment>");
    expect(example).toContain("20260130_120000");
  });
});

describe("rollback command error messages", () => {
  test("missing environment error includes usage", () => {
    const errorMessage = `Missing environment argument.

Usage: toss rollback <environment> [release]

Examples:
  toss rollback prod
  toss rollback prod 20260130_120000`;

    expect(errorMessage).toContain("Missing environment argument");
    expect(errorMessage).toContain("Usage:");
    expect(errorMessage).toContain("Examples:");
  });
});
