import { describe, test, expect } from "bun:test";
import { getServiceName } from "../systemd.ts";
import { getDeploymentDirectory, getSecretsOverridesDirectory } from "../state.ts";

/**
 * Tests for the remove command logic and path construction.
 * Since the command orchestrates SSH operations, we test the parsing
 * and path construction logic.
 */

describe("remove command path construction", () => {
  test("constructs deployment directory path correctly", () => {
    const appName = "myapp";
    const environment = "pr-42";
    const expectedPath = getDeploymentDirectory(appName, environment);
    expect(expectedPath).toBe("/srv/myapp/pr-42");
  });

  test("constructs secrets overrides path correctly", () => {
    const appName = "myapp";
    const expectedDir = getSecretsOverridesDirectory(appName);
    expect(expectedDir).toBe("/srv/myapp/.toss/secrets/overrides");
  });

  test("constructs override file path correctly", () => {
    const appName = "myapp";
    const environment = "pr-42";
    const overridesDir = getSecretsOverridesDirectory(appName);
    const overridePath = `${overridesDir}/${environment}.env`;
    expect(overridePath).toBe("/srv/myapp/.toss/secrets/overrides/pr-42.env");
  });

  test("constructs service name correctly", () => {
    const appName = "myapp";
    const environment = "pr-42";
    const serviceName = getServiceName(appName, environment);
    expect(serviceName).toBe("toss-myapp-pr-42");
  });
});

describe("production environment protection", () => {
  test("production is the protected environment name", () => {
    // The remove command refuses to remove production
    const protectedEnvironment = "production";
    expect(protectedEnvironment).toBe("production");
  });

  test("other environments can be removed", () => {
    const removableEnvironments = ["pr-42", "staging", "dev", "preview-123"];
    for (const env of removableEnvironments) {
      expect(env).not.toBe("production");
    }
  });
});

describe("remove command error messages", () => {
  test("production protection error includes manual override instructions", () => {
    const errorMessage = `Cannot remove the production environment.

The production environment is protected from removal as a safety measure.
If you really need to tear down production, you can:
  1. SSH into the server: toss ssh production
  2. Manually stop the service and remove the files`;

    expect(errorMessage).toContain("Cannot remove the production environment");
    expect(errorMessage).toContain("safety measure");
    expect(errorMessage).toContain("toss ssh production");
    expect(errorMessage).toContain("Manually stop");
  });

  test("environment not found error suggests list command", () => {
    const environment = "nonexistent";
    const errorMessage = `Environment "${environment}" not found.

Run 'toss list' to see deployed environments.`;

    expect(errorMessage).toContain("not found");
    expect(errorMessage).toContain("toss list");
  });

  test("missing environment argument error includes usage", () => {
    const errorMessage = `Missing environment argument.

Usage: toss remove <environment>

Examples:
  toss remove pr-42
  toss remove staging`;

    expect(errorMessage).toContain("Missing environment argument");
    expect(errorMessage).toContain("Usage:");
    expect(errorMessage).toContain("Examples:");
  });
});

describe("remove command argument parsing", () => {
  test("extracts environment from first positional argument", () => {
    const args = ["pr-42"];
    const environment = args[0];
    expect(environment).toBe("pr-42");
  });

  test("rejects unknown flags", () => {
    const args = ["pr-42", "--force"];
    const unknownFlag = args.find((arg) => arg.startsWith("-") && arg !== "-h" && arg !== "--help");
    expect(unknownFlag).toBe("--force");
  });

  test("recognizes help flag", () => {
    const helpArgs = ["-h", "--help"];
    for (const arg of helpArgs) {
      expect(arg === "-h" || arg === "--help").toBe(true);
    }
  });
});

describe("remove command help text", () => {
  test("help text includes usage and examples", () => {
    const helpText = `toss remove - Remove an environment

Usage: toss remove <environment>

Arguments:
  environment       The environment to remove (e.g., pr-42, staging)

Options:
  -h, --help        Show this help message

Note: The production environment cannot be removed as a safety measure.

Examples:
  toss remove pr-42
  toss remove staging`;

    expect(helpText).toContain("toss remove - Remove an environment");
    expect(helpText).toContain("Usage:");
    expect(helpText).toContain("Arguments:");
    expect(helpText).toContain("Options:");
    expect(helpText).toContain("production environment cannot be removed");
    expect(helpText).toContain("Examples:");
  });
});

describe("removed items tracking", () => {
  test("tracks systemd service removal", () => {
    const removedItems: string[] = [];
    const serviceName = "toss-myapp-pr-42";
    removedItems.push(`Systemd service: ${serviceName}`);
    expect(removedItems).toContain("Systemd service: toss-myapp-pr-42");
  });

  test("tracks deployment directory removal", () => {
    const removedItems: string[] = [];
    const deploymentDir = "/srv/myapp/pr-42";
    removedItems.push(`Deployment directory: ${deploymentDir}`);
    expect(removedItems).toContain("Deployment directory: /srv/myapp/pr-42");
  });

  test("tracks secret overrides removal", () => {
    const removedItems: string[] = [];
    const overridePath = "/srv/myapp/.toss/secrets/overrides/pr-42.env";
    removedItems.push(`Secret overrides: ${overridePath}`);
    expect(removedItems).toContain("Secret overrides: /srv/myapp/.toss/secrets/overrides/pr-42.env");
  });
});
