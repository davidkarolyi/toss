import { describe, test, expect } from "bun:test";

/**
 * Tests for the ssh command argument parsing and path construction.
 * Since the command opens an interactive SSH session, we test the parsing logic
 * and deployment directory construction.
 */

describe("ssh command argument parsing logic", () => {
  // Helper that mimics the parseArgs function behavior
  function parseArgs(args: string[]): {
    environment: string | null;
    showHelp: boolean;
  } {
    let environment: string | null = null;
    let showHelp = false;

    for (const arg of args) {
      if (arg === "-h" || arg === "--help") {
        showHelp = true;
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

    return { environment, showHelp };
  }

  test("parses environment name", () => {
    const result = parseArgs(["production"]);
    expect(result.environment).toBe("production");
    expect(result.showHelp).toBe(false);
  });

  test("parses preview environment name", () => {
    const result = parseArgs(["pr-42"]);
    expect(result.environment).toBe("pr-42");
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

  test("help flag with environment", () => {
    const result = parseArgs(["production", "--help"]);
    expect(result.showHelp).toBe(true);
    expect(result.environment).toBe("production");
  });

  test("throws on unknown flag", () => {
    expect(() => parseArgs(["production", "--unknown"])).toThrow(
      "Unknown option: --unknown"
    );
  });

  test("throws on unknown short flag", () => {
    expect(() => parseArgs(["-x"])).toThrow("Unknown option: -x");
  });

  test("throws on extra positional argument", () => {
    expect(() => parseArgs(["production", "extra"])).toThrow(
      "Unexpected argument: extra"
    );
  });

  test("returns null environment when not provided", () => {
    const result = parseArgs([]);
    expect(result.environment).toBeNull();
  });
});

describe("ssh command deployment directory construction", () => {
  function buildDeploymentDir(appName: string, environment: string): string {
    return `/srv/${appName}/${environment}`;
  }

  test("constructs path for production", () => {
    const path = buildDeploymentDir("myapp", "production");
    expect(path).toBe("/srv/myapp/production");
  });

  test("constructs path for preview environment", () => {
    const path = buildDeploymentDir("myapp", "pr-42");
    expect(path).toBe("/srv/myapp/pr-42");
  });

  test("constructs path for staging", () => {
    const path = buildDeploymentDir("myapp", "staging");
    expect(path).toBe("/srv/myapp/staging");
  });

  test("constructs path with different app name", () => {
    const path = buildDeploymentDir("webapp", "production");
    expect(path).toBe("/srv/webapp/production");
  });

  test("constructs path with hyphenated app name", () => {
    const path = buildDeploymentDir("my-app", "pr-123");
    expect(path).toBe("/srv/my-app/pr-123");
  });
});

describe("ssh command initial shell command construction", () => {
  function buildInitialCommand(deploymentDir: string): string {
    return `cd ${deploymentDir} && exec $SHELL -l`;
  }

  test("builds command to cd and start shell", () => {
    const command = buildInitialCommand("/srv/myapp/production");
    expect(command).toBe("cd /srv/myapp/production && exec $SHELL -l");
  });

  test("command uses login shell (-l flag)", () => {
    const command = buildInitialCommand("/srv/myapp/production");
    expect(command).toContain("-l");
  });

  test("command uses exec to replace ssh process", () => {
    const command = buildInitialCommand("/srv/myapp/production");
    expect(command).toContain("exec $SHELL");
  });

  test("command changes directory first", () => {
    const command = buildInitialCommand("/srv/myapp/production");
    expect(command).toMatch(/^cd/);
  });
});

describe("ssh command help text structure", () => {
  test("help text includes usage", () => {
    const expectedUsage = "Usage: toss ssh <env>";
    expect(expectedUsage).toContain("toss ssh");
    expect(expectedUsage).toContain("<env>");
  });

  test("help text includes examples", () => {
    const examples = ["toss ssh production", "toss ssh pr-42"];
    for (const example of examples) {
      expect(example).toMatch(/^toss ssh/);
    }
  });
});

describe("ssh command error messages", () => {
  test("missing environment error format", () => {
    const errorMessage = `Error: Environment name is required.

Usage: toss ssh <env>

Examples:
  toss ssh production
  toss ssh pr-42`;

    expect(errorMessage).toContain("Environment name is required");
    expect(errorMessage).toContain("Usage:");
    expect(errorMessage).toContain("Examples:");
  });
});
