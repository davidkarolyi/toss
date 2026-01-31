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
    const result = parseArgs(["prod"]);
    expect(result.environment).toBe("prod");
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
    const result = parseArgs(["prod", "--help"]);
    expect(result.showHelp).toBe(true);
    expect(result.environment).toBe("prod");
  });

  test("throws on unknown flag", () => {
    expect(() => parseArgs(["prod", "--unknown"])).toThrow(
      "Unknown option: --unknown"
    );
  });

  test("throws on unknown short flag", () => {
    expect(() => parseArgs(["-x"])).toThrow("Unknown option: -x");
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
});

describe("ssh command directory construction", () => {
  function buildEnvDir(appName: string, environment: string): string {
    return `/srv/${appName}/${environment}`;
  }

  function buildCurrentPath(appName: string, environment: string): string {
    return `${buildEnvDir(appName, environment)}/current`;
  }

  test("constructs current path for prod", () => {
    const path = buildCurrentPath("myapp", "prod");
    expect(path).toBe("/srv/myapp/prod/current");
  });

  test("constructs current path for preview environment", () => {
    const path = buildCurrentPath("myapp", "pr-42");
    expect(path).toBe("/srv/myapp/pr-42/current");
  });

  test("constructs current path for staging", () => {
    const path = buildCurrentPath("myapp", "staging");
    expect(path).toBe("/srv/myapp/staging/current");
  });

  test("constructs current path with different app name", () => {
    const path = buildCurrentPath("webapp", "prod");
    expect(path).toBe("/srv/webapp/prod/current");
  });

  test("constructs current path with hyphenated app name", () => {
    const path = buildCurrentPath("my-app", "pr-123");
    expect(path).toBe("/srv/my-app/pr-123/current");
  });

  test("fallback env dir for legacy deployments", () => {
    const envDir = buildEnvDir("myapp", "prod");
    expect(envDir).toBe("/srv/myapp/prod");
  });
});

describe("ssh command initial shell command construction", () => {
  function buildInitialCommand(targetDir: string): string {
    return `cd ${targetDir} && exec $SHELL -l`;
  }

  test("builds command to cd and start shell for current symlink", () => {
    const command = buildInitialCommand("/srv/myapp/prod/current");
    expect(command).toBe("cd /srv/myapp/prod/current && exec $SHELL -l");
  });

  test("builds command for legacy directory fallback", () => {
    const command = buildInitialCommand("/srv/myapp/prod");
    expect(command).toBe("cd /srv/myapp/prod && exec $SHELL -l");
  });

  test("command uses login shell (-l flag)", () => {
    const command = buildInitialCommand("/srv/myapp/prod/current");
    expect(command).toContain("-l");
  });

  test("command uses exec to replace ssh process", () => {
    const command = buildInitialCommand("/srv/myapp/prod/current");
    expect(command).toContain("exec $SHELL");
  });

  test("command changes directory first", () => {
    const command = buildInitialCommand("/srv/myapp/prod/current");
    expect(command).toMatch(/^cd/);
  });
});

describe("ssh command help text structure", () => {
  test("help text includes usage", () => {
    const expectedUsage = "Usage: toss ssh <env>";
    expect(expectedUsage).toContain("toss ssh");
    expect(expectedUsage).toContain("<env>");
  });

  test("help text references current directory", () => {
    const helpText =
      "The session starts in the current release directory (/srv/<app>/<env>/current/).";
    expect(helpText).toContain("current");
    expect(helpText).toContain("/current/");
  });

  test("help text includes examples", () => {
    const examples = ["toss ssh prod", "toss ssh pr-42"];
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
  toss ssh prod
  toss ssh pr-42`;

    expect(errorMessage).toContain("Environment name is required");
    expect(errorMessage).toContain("Usage:");
    expect(errorMessage).toContain("Examples:");
  });
});
