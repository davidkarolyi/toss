import { describe, test, expect } from "bun:test";
import {
  getTossDirectory,
  getStatePath,
  getSecretsDirectory,
  getSecretsOverridesDirectory,
  getDeploymentDirectory,
  createEmptyState,
  getDeployedEnvironments,
  getPortForEnvironment,
} from "./state.ts";
import type { TossState } from "./state.ts";

describe("getTossDirectory", () => {
  test("returns correct path for app", () => {
    expect(getTossDirectory("myapp")).toBe("/srv/myapp/.toss");
  });

  test("handles hyphenated app names", () => {
    expect(getTossDirectory("my-cool-app")).toBe("/srv/my-cool-app/.toss");
  });
});

describe("getStatePath", () => {
  test("returns correct path for state.json", () => {
    expect(getStatePath("myapp")).toBe("/srv/myapp/.toss/state.json");
  });
});

describe("getSecretsDirectory", () => {
  test("returns correct path for secrets directory", () => {
    expect(getSecretsDirectory("myapp")).toBe("/srv/myapp/.toss/secrets");
  });
});

describe("getSecretsOverridesDirectory", () => {
  test("returns correct path for overrides directory", () => {
    expect(getSecretsOverridesDirectory("myapp")).toBe("/srv/myapp/.toss/secrets/overrides");
  });
});

describe("getDeploymentDirectory", () => {
  test("returns correct path for production", () => {
    expect(getDeploymentDirectory("myapp", "production")).toBe("/srv/myapp/production");
  });

  test("returns correct path for preview environment", () => {
    expect(getDeploymentDirectory("myapp", "pr-42")).toBe("/srv/myapp/pr-42");
  });

  test("handles complex environment names", () => {
    expect(getDeploymentDirectory("app", "feature-branch-123")).toBe("/srv/app/feature-branch-123");
  });
});

describe("createEmptyState", () => {
  test("creates state with null origin by default", () => {
    const state = createEmptyState();

    expect(state.origin).toBeNull();
    expect(state.deployments).toEqual({});
    expect(state.appliedDependencies).toEqual([]);
    expect(state.lock).toBeNull();
  });

  test("creates state with provided origin", () => {
    const state = createEmptyState("git@github.com:user/repo.git");

    expect(state.origin).toBe("git@github.com:user/repo.git");
    expect(state.deployments).toEqual({});
    expect(state.appliedDependencies).toEqual([]);
    expect(state.lock).toBeNull();
  });
});

describe("getDeployedEnvironments", () => {
  test("returns empty array for no deployments", () => {
    const state = createEmptyState();
    expect(getDeployedEnvironments(state)).toEqual([]);
  });

  test("returns environment names", () => {
    const state: TossState = {
      origin: null,
      deployments: {
        production: { port: 3000 },
        "pr-42": { port: 3001 },
      },
      appliedDependencies: [],
      lock: null,
    };

    const environments = getDeployedEnvironments(state);
    expect(environments).toContain("production");
    expect(environments).toContain("pr-42");
    expect(environments).toHaveLength(2);
  });
});

describe("getPortForEnvironment", () => {
  test("returns undefined for non-existent environment", () => {
    const state = createEmptyState();
    expect(getPortForEnvironment(state, "production")).toBeUndefined();
  });

  test("returns port for existing environment", () => {
    const state: TossState = {
      origin: null,
      deployments: {
        production: { port: 3000 },
        "pr-42": { port: 3001 },
      },
      appliedDependencies: [],
      lock: null,
    };

    expect(getPortForEnvironment(state, "production")).toBe(3000);
    expect(getPortForEnvironment(state, "pr-42")).toBe(3001);
  });
});

describe("TossState structure", () => {
  test("can represent a full state", () => {
    const state: TossState = {
      origin: "git@github.com:user/myapp.git",
      deployments: {
        production: { port: 3000 },
        "pr-42": { port: 3001 },
        staging: { port: 3002 },
      },
      appliedDependencies: ["nodejs", "bun"],
      lock: {
        environment: "pr-42",
        host: "user@laptop.local",
        pid: 12345,
        startedAt: "2024-01-23T10:00:00Z",
      },
    };

    expect(state.origin).toBe("git@github.com:user/myapp.git");
    expect(Object.keys(state.deployments)).toHaveLength(3);
    expect(state.appliedDependencies).toContain("nodejs");
    expect(state.lock?.environment).toBe("pr-42");
    expect(state.lock?.pid).toBe(12345);
  });

  test("can represent a minimal state", () => {
    const state: TossState = {
      origin: null,
      deployments: {},
      appliedDependencies: [],
      lock: null,
    };

    expect(state.origin).toBeNull();
    expect(state.deployments).toEqual({});
    expect(state.appliedDependencies).toEqual([]);
    expect(state.lock).toBeNull();
  });
});
