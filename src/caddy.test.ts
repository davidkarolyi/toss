import { describe, test, expect } from "bun:test";
import {
  formatIpForSslip,
  getDeploymentUrl,
  getDeploymentHostname,
  generateCaddyfile,
} from "./caddy.ts";
import type { TossState } from "./state.ts";
import type { CaddyGeneratorConfig } from "./caddy.ts";

describe("formatIpForSslip", () => {
  test("converts dots to dashes", () => {
    expect(formatIpForSslip("64.23.123.45")).toBe("64-23-123-45");
  });

  test("handles single-digit octets", () => {
    expect(formatIpForSslip("1.2.3.4")).toBe("1-2-3-4");
  });

  test("handles 255.255.255.255", () => {
    expect(formatIpForSslip("255.255.255.255")).toBe("255-255-255-255");
  });

  test("preserves already-dashed strings", () => {
    expect(formatIpForSslip("64-23-123-45")).toBe("64-23-123-45");
  });

  test("converts IPv6 colons to dashes", () => {
    expect(formatIpForSslip("::1")).toBe("--1");
    expect(formatIpForSslip("2a01:4f8:c17:b8f::2")).toBe("2a01-4f8-c17-b8f--2");
  });
});

describe("getDeploymentHostname", () => {
  describe("with custom domain", () => {
    test("returns app-scoped domain for prod", () => {
      expect(getDeploymentHostname("prod", "myapp", "64.23.123.45", "example.com")).toBe(
        "prod.myapp.example.com"
      );
    });

    test("returns app-scoped domain for non-prod", () => {
      expect(getDeploymentHostname("pr-42", "myapp", "64.23.123.45", "example.com")).toBe(
        "pr-42.myapp.example.com"
      );
    });

    test("handles staging environment", () => {
      expect(getDeploymentHostname("staging", "myapp", "64.23.123.45", "example.com")).toBe(
        "staging.myapp.example.com"
      );
    });
  });

  describe("without custom domain (sslip.io)", () => {
    test("returns sslip.io hostname for prod", () => {
      expect(getDeploymentHostname("prod", "myapp", "64.23.123.45")).toBe(
        "prod.myapp.64-23-123-45.sslip.io"
      );
    });

    test("returns sslip.io hostname for preview", () => {
      expect(getDeploymentHostname("pr-42", "myapp", "64.23.123.45")).toBe(
        "pr-42.myapp.64-23-123-45.sslip.io"
      );
    });

    test("handles different IP addresses", () => {
      expect(getDeploymentHostname("prod", "myapp", "192.168.1.100")).toBe(
        "prod.myapp.192-168-1-100.sslip.io"
      );
    });

    test("handles IPv6 addresses", () => {
      expect(getDeploymentHostname("prod", "myapp", "::1")).toBe(
        "prod.myapp.--1.sslip.io"
      );
      expect(getDeploymentHostname("preview", "myapp", "2a01:4f8:c17:b8f::2")).toBe(
        "preview.myapp.2a01-4f8-c17-b8f--2.sslip.io"
      );
    });
  });
});

describe("getDeploymentUrl", () => {
  test("adds https protocol", () => {
    expect(getDeploymentUrl("prod", "myapp", "64.23.123.45", "example.com")).toBe(
      "https://prod.myapp.example.com"
    );
  });

  test("adds https protocol for sslip.io", () => {
    expect(getDeploymentUrl("prod", "myapp", "64.23.123.45")).toBe(
      "https://prod.myapp.64-23-123-45.sslip.io"
    );
  });

  test("handles preview with domain", () => {
    expect(getDeploymentUrl("pr-123", "myapp", "64.23.123.45", "example.org")).toBe(
      "https://pr-123.myapp.example.org"
    );
  });
});

describe("generateCaddyfile", () => {
  const baseConfig: CaddyGeneratorConfig = {
    appName: "myapp",
    serverHost: "64.23.123.45",
  };

  test("generates empty caddyfile when no deployments", () => {
    const state: TossState = {
      origin: null,
      deployments: {},
      appliedDependencies: [],
      lock: null,
    };

    const caddyfile = generateCaddyfile(state, baseConfig);

    expect(caddyfile).toContain("# Managed by toss for myapp");
    expect(caddyfile).toContain("# No deployments yet");
  });

  test("generates config for single prod deployment with domain", () => {
    const state: TossState = {
      origin: null,
      deployments: {
        prod: { port: 3000 },
      },
      appliedDependencies: [],
      lock: null,
    };

    const config: CaddyGeneratorConfig = {
      ...baseConfig,
      domain: "example.com",
    };

    const caddyfile = generateCaddyfile(state, config);

    expect(caddyfile).toContain("# Managed by toss for myapp");
    expect(caddyfile).toContain("prod.myapp.example.com {");
    expect(caddyfile).toContain("reverse_proxy localhost:3000");
  });

  test("generates config for prod with sslip.io", () => {
    const state: TossState = {
      origin: null,
      deployments: {
        prod: { port: 3000 },
      },
      appliedDependencies: [],
      lock: null,
    };

    const caddyfile = generateCaddyfile(state, baseConfig);

    expect(caddyfile).toContain("prod.myapp.64-23-123-45.sslip.io {");
    expect(caddyfile).toContain("reverse_proxy localhost:3000");
  });

  test("generates config for multiple deployments", () => {
    const state: TossState = {
      origin: null,
      deployments: {
        prod: { port: 3000 },
        "pr-42": { port: 3001 },
        "pr-123": { port: 3002 },
      },
      appliedDependencies: [],
      lock: null,
    };

    const config: CaddyGeneratorConfig = {
      ...baseConfig,
      domain: "example.com",
    };

    const caddyfile = generateCaddyfile(state, config);

    expect(caddyfile).toContain("prod.myapp.example.com {");
    expect(caddyfile).toContain("reverse_proxy localhost:3000");

    expect(caddyfile).toContain("pr-42.myapp.example.com {");
    expect(caddyfile).toContain("reverse_proxy localhost:3001");

    expect(caddyfile).toContain("pr-123.myapp.example.com {");
    expect(caddyfile).toContain("reverse_proxy localhost:3002");
  });

  test("sorts prod first, then alphabetically", () => {
    const state: TossState = {
      origin: null,
      deployments: {
        "pr-99": { port: 3003 },
        "pr-42": { port: 3001 },
        prod: { port: 3000 },
        "pr-123": { port: 3002 },
      },
      appliedDependencies: [],
      lock: null,
    };

    const caddyfile = generateCaddyfile(state, baseConfig);

    const prodIndex = caddyfile.indexOf("prod.");
    const pr42Index = caddyfile.indexOf("pr-42.");
    const pr99Index = caddyfile.indexOf("pr-99.");
    const pr123Index = caddyfile.indexOf("pr-123.");

    // Prod should come first
    expect(prodIndex).toBeLessThan(pr42Index);
    expect(prodIndex).toBeLessThan(pr99Index);
    expect(prodIndex).toBeLessThan(pr123Index);

    // Then alphabetical: pr-123, pr-42, pr-99
    expect(pr123Index).toBeLessThan(pr42Index);
    expect(pr42Index).toBeLessThan(pr99Index);
  });

  test("generates valid site blocks with correct structure", () => {
    const state: TossState = {
      origin: null,
      deployments: {
        prod: { port: 3000 },
      },
      appliedDependencies: [],
      lock: null,
    };

    const config: CaddyGeneratorConfig = {
      ...baseConfig,
      domain: "example.com",
    };

    const caddyfile = generateCaddyfile(state, config);

    // Check structure
    expect(caddyfile).toMatch(
      /prod\.myapp\.example\.com \{[\s\S]*reverse_proxy localhost:3000[\s\S]*\}/
    );
  });

  test("handles complex environment names", () => {
    const state: TossState = {
      origin: null,
      deployments: {
        "feature-branch-123-abc": { port: 3005 },
      },
      appliedDependencies: [],
      lock: null,
    };

    const config: CaddyGeneratorConfig = {
      ...baseConfig,
      domain: "app.io",
    };

    const caddyfile = generateCaddyfile(state, config);

    expect(caddyfile).toContain("feature-branch-123-abc.myapp.app.io {");
    expect(caddyfile).toContain("reverse_proxy localhost:3005");
  });
});
