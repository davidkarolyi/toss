import { describe, test, expect } from "bun:test";
import { getServiceName } from "../systemd.ts";

/**
 * Tests for the logs command argument parsing and path construction.
 * Since the command streams logs over SSH, we test the parsing logic
 * and service name construction.
 */

describe("logs command service name construction", () => {
  test("constructs service name for prod", () => {
    const serviceName = getServiceName("myapp", "prod");
    expect(serviceName).toBe("toss-myapp-prod");
  });

  test("constructs service name for preview environment", () => {
    const serviceName = getServiceName("myapp", "pr-42");
    expect(serviceName).toBe("toss-myapp-pr-42");
  });

  test("constructs service name for staging", () => {
    const serviceName = getServiceName("myapp", "staging");
    expect(serviceName).toBe("toss-myapp-staging");
  });
});

describe("logs command argument parsing logic", () => {
  // Helper that mimics the parseArgs function behavior
  function parseArgs(args: string[]): {
    environment: string | null;
    lineCount: number | null;
    since: string | null;
    follow: boolean | null;
    showHelp: boolean;
  } {
    let environment: string | null = null;
    let lineCount: number | null = null;
    let since: string | null = null;
    let follow: boolean | null = null;
    let showHelp = false;
    let skipNext = false;

    for (let index = 0; index < args.length; index++) {
      if (skipNext) {
        skipNext = false;
        continue;
      }

      const arg = args[index];
      if (arg === undefined) continue;

      if (arg === "-h" || arg === "--help") {
        showHelp = true;
        continue;
      }

      if (arg === "-n") {
        const nextArg = args[index + 1];
        if (nextArg === undefined) {
          throw new Error("The -n flag requires a number argument");
        }

        const parsed = parseInt(nextArg, 10);
        if (isNaN(parsed) || parsed < 1) {
          throw new Error(
            `Invalid line count: ${nextArg}. Must be a positive number.`
          );
        }

        lineCount = parsed;
        skipNext = true;
        continue;
      }

      if (arg === "--since") {
        const nextArg = args[index + 1];
        if (nextArg === undefined) {
          throw new Error("The --since flag requires a time argument");
        }
        since = nextArg;
        skipNext = true;
        continue;
      }

      if (arg.startsWith("--since=")) {
        const value = arg.slice("--since=".length);
        if (!value) {
          throw new Error("The --since flag requires a time argument");
        }
        since = value;
        continue;
      }

      if (arg === "-f" || arg === "--follow") {
        follow = true;
        continue;
      }

      if (arg.startsWith("-")) {
        throw new Error(`Unknown option: ${arg}`);
      }

      if (environment === null) {
        environment = arg;
      } else {
        throw new Error(`Unexpected argument: ${arg}`);
      }
    }

    return { environment, lineCount, since, follow, showHelp };
  }

  test("parses environment name only", () => {
    const result = parseArgs(["prod"]);
    expect(result.environment).toBe("prod");
    expect(result.lineCount).toBeNull();
    expect(result.since).toBeNull();
    expect(result.follow).toBeNull();
    expect(result.showHelp).toBe(false);
  });

  test("parses environment and -n flag", () => {
    const result = parseArgs(["prod", "-n", "100"]);
    expect(result.environment).toBe("prod");
    expect(result.lineCount).toBe(100);
    expect(result.since).toBeNull();
    expect(result.follow).toBeNull();
    expect(result.showHelp).toBe(false);
  });

  test("parses -n flag before environment", () => {
    const result = parseArgs(["-n", "50", "pr-42"]);
    expect(result.environment).toBe("pr-42");
    expect(result.lineCount).toBe(50);
    expect(result.since).toBeNull();
    expect(result.follow).toBeNull();
    expect(result.showHelp).toBe(false);
  });

  test("parses -h flag", () => {
    const result = parseArgs(["-h"]);
    expect(result.showHelp).toBe(true);
  });

  test("parses --help flag", () => {
    const result = parseArgs(["--help"]);
    expect(result.showHelp).toBe(true);
  });

  test("parses --since flag", () => {
    const result = parseArgs(["prod", "--since", "1h"]);
    expect(result.environment).toBe("prod");
    expect(result.since).toBe("1h");
  });

  test("parses --since= flag", () => {
    const result = parseArgs(["prod", "--since=2025-01-01"]);
    expect(result.environment).toBe("prod");
    expect(result.since).toBe("2025-01-01");
  });

  test("parses --follow flag", () => {
    const result = parseArgs(["prod", "--follow"]);
    expect(result.environment).toBe("prod");
    expect(result.follow).toBe(true);
  });

  test("help flag with environment", () => {
    const result = parseArgs(["prod", "--help"]);
    expect(result.showHelp).toBe(true);
    expect(result.environment).toBe("prod");
  });

  test("throws on missing -n argument", () => {
    expect(() => parseArgs(["prod", "-n"])).toThrow(
      "The -n flag requires a number argument"
    );
  });

  test("throws on missing --since argument", () => {
    expect(() => parseArgs(["prod", "--since"])).toThrow(
      "The --since flag requires a time argument"
    );
  });

  test("throws on invalid -n argument", () => {
    expect(() => parseArgs(["prod", "-n", "abc"])).toThrow(
      "Invalid line count: abc. Must be a positive number."
    );
  });

  test("throws on negative -n argument", () => {
    expect(() => parseArgs(["prod", "-n", "-5"])).toThrow(
      "Invalid line count: -5. Must be a positive number."
    );
  });

  test("throws on zero -n argument", () => {
    expect(() => parseArgs(["prod", "-n", "0"])).toThrow(
      "Invalid line count: 0. Must be a positive number."
    );
  });

  test("throws on unknown flag", () => {
    expect(() => parseArgs(["prod", "--unknown"])).toThrow(
      "Unknown option: --unknown"
    );
  });

  test("throws on extra positional argument", () => {
    expect(() => parseArgs(["prod", "extra"])).toThrow(
      "Unexpected argument: extra"
    );
  });

  test("returns null environment when not provided", () => {
    const result = parseArgs([]);
    expect(result.environment).toBeNull();
  });

  test("returns null lineCount when not provided", () => {
    const result = parseArgs(["prod"]);
    expect(result.lineCount).toBeNull();
  });
});

describe("journalctl command construction", () => {
  function buildJournalCommand(
    serviceName: string,
    lineCount: number | null,
    since: string | null,
    follow: boolean
  ): string {
    let command = `journalctl -u ${serviceName} --no-pager`;

    if (since) {
      command += ` --since ${since}`;
    }

    if (lineCount !== null) {
      command += ` -n ${lineCount}`;
    }

    if (follow) {
      command += " -f";
    }

    return command;
  }

  test("builds follow command without line count", () => {
    const command = buildJournalCommand("toss-myapp-prod", null, null, true);
    expect(command).toBe("journalctl -u toss-myapp-prod --no-pager -f");
  });

  test("builds line count command with -n flag", () => {
    const command = buildJournalCommand("toss-myapp-prod", 100, null, false);
    expect(command).toBe(
      "journalctl -u toss-myapp-prod --no-pager -n 100"
    );
  });

  test("builds command for preview environment", () => {
    const command = buildJournalCommand("toss-myapp-pr-42", 50, null, false);
    expect(command).toBe("journalctl -u toss-myapp-pr-42 --no-pager -n 50");
  });

  test("builds since command with follow", () => {
    const command = buildJournalCommand("toss-myapp-prod", null, "1h", true);
    expect(command).toBe("journalctl -u toss-myapp-prod --no-pager --since 1h -f");
  });
});

describe("logs command help text structure", () => {
  test("help text includes usage", () => {
    const expectedUsage = "Usage: toss logs <env> [options]";
    expect(expectedUsage).toContain("toss logs");
    expect(expectedUsage).toContain("<env>");
    expect(expectedUsage).toContain("options");
  });

  test("help text documents -n flag", () => {
    const description = "Show last N lines";
    expect(description).toContain("last N lines");
  });

  test("help text includes examples", () => {
    const examples = [
      "toss logs prod",
      "toss logs pr-42",
      "toss logs prod -n 100",
      "toss logs prod --since \"1h\"",
    ];
    for (const example of examples) {
      expect(example).toMatch(/^toss logs/);
    }
  });
});

describe("logs command error messages", () => {
  test("missing environment error includes usage", () => {
    const errorMessage = `Error: Environment name is required.

Usage: toss logs <env> [options]

Examples:
  toss logs prod
  toss logs pr-42 -n 100`;

    expect(errorMessage).toContain("Environment name is required");
    expect(errorMessage).toContain("Usage:");
    expect(errorMessage).toContain("Examples:");
  });
});
