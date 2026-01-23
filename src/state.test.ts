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
  verifyOrigin,
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

describe("verifyOrigin", () => {
  describe("allows deploy when", () => {
    test("stored origin is null (first deploy)", () => {
      const result = verifyOrigin(null, "git@github.com:user/repo.git");
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test("local origin is null (not a git repo)", () => {
      const result = verifyOrigin("git@github.com:user/repo.git", null);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test("both origins are null", () => {
      const result = verifyOrigin(null, null);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test("origins match exactly (SSH)", () => {
      const origin = "git@github.com:user/repo.git";
      const result = verifyOrigin(origin, origin);
      expect(result.valid).toBe(true);
    });

    test("origins match exactly (HTTPS)", () => {
      const origin = "https://github.com/user/repo.git";
      const result = verifyOrigin(origin, origin);
      expect(result.valid).toBe(true);
    });
  });

  describe("normalizes origins correctly", () => {
    test("SSH and HTTPS for same repo are equivalent", () => {
      const sshOrigin = "git@github.com:user/repo.git";
      const httpsOrigin = "https://github.com/user/repo.git";
      const result = verifyOrigin(sshOrigin, httpsOrigin);
      expect(result.valid).toBe(true);
    });

    test("with and without .git suffix are equivalent", () => {
      const withGit = "git@github.com:user/repo.git";
      const withoutGit = "git@github.com:user/repo";
      const result = verifyOrigin(withGit, withoutGit);
      expect(result.valid).toBe(true);
    });

    test("trailing slashes are ignored", () => {
      const withSlash = "https://github.com/user/repo/";
      const withoutSlash = "https://github.com/user/repo";
      const result = verifyOrigin(withSlash, withoutSlash);
      expect(result.valid).toBe(true);
    });

    test("case differences are ignored", () => {
      const uppercase = "git@GitHub.com:User/Repo.git";
      const lowercase = "git@github.com:user/repo.git";
      const result = verifyOrigin(uppercase, lowercase);
      expect(result.valid).toBe(true);
    });

    test("http and https are equivalent", () => {
      const http = "http://github.com/user/repo.git";
      const https = "https://github.com/user/repo.git";
      const result = verifyOrigin(http, https);
      expect(result.valid).toBe(true);
    });
  });

  describe("blocks deploy when", () => {
    test("origins are different repos", () => {
      const storedOrigin = "git@github.com:user/repo-a.git";
      const localOrigin = "git@github.com:user/repo-b.git";
      const result = verifyOrigin(storedOrigin, localOrigin);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.storedOrigin).toBe(storedOrigin);
      expect(result.localOrigin).toBe(localOrigin);
    });

    test("origins are from different users", () => {
      const storedOrigin = "git@github.com:user-a/repo.git";
      const localOrigin = "git@github.com:user-b/repo.git";
      const result = verifyOrigin(storedOrigin, localOrigin);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Project origin mismatch");
    });

    test("origins are from different hosts", () => {
      const storedOrigin = "git@github.com:user/repo.git";
      const localOrigin = "git@gitlab.com:user/repo.git";
      const result = verifyOrigin(storedOrigin, localOrigin);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("Project origin mismatch");
    });
  });

  describe("error message", () => {
    test("includes both origins for debugging", () => {
      const storedOrigin = "git@github.com:company/project-a.git";
      const localOrigin = "git@github.com:company/project-b.git";
      const result = verifyOrigin(storedOrigin, localOrigin);

      expect(result.error).toContain(storedOrigin);
      expect(result.error).toContain(localOrigin);
    });

    test("includes helpful suggestions", () => {
      const result = verifyOrigin(
        "git@github.com:user/repo-a.git",
        "git@github.com:user/repo-b.git"
      );

      expect(result.error).toContain("Use a different app name");
      expect(result.error).toContain("toss remove");
    });
  });
});
