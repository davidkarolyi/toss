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
    test("returns bare domain for production", () => {
      expect(getDeploymentHostname("production", "64.23.123.45", "myapp.com")).toBe("myapp.com");
    });

    test("returns preview subdomain for non-production", () => {
      expect(getDeploymentHostname("pr-42", "64.23.123.45", "myapp.com")).toBe(
        "pr-42.preview.myapp.com"
      );
    });

    test("handles staging environment", () => {
      expect(getDeploymentHostname("staging", "64.23.123.45", "myapp.com")).toBe(
        "staging.preview.myapp.com"
      );
    });
  });

  describe("without custom domain (sslip.io)", () => {
    test("returns sslip.io hostname for production", () => {
      expect(getDeploymentHostname("production", "64.23.123.45")).toBe(
        "production.64-23-123-45.sslip.io"
      );
    });

    test("returns sslip.io hostname for preview", () => {
      expect(getDeploymentHostname("pr-42", "64.23.123.45")).toBe("pr-42.64-23-123-45.sslip.io");
    });

    test("handles different IP addresses", () => {
      expect(getDeploymentHostname("production", "192.168.1.100")).toBe(
        "production.192-168-1-100.sslip.io"
      );
    });

    test("handles IPv6 addresses", () => {
      expect(getDeploymentHostname("production", "::1")).toBe(
        "production.--1.sslip.io"
      );
      expect(getDeploymentHostname("preview", "2a01:4f8:c17:b8f::2")).toBe(
        "preview.2a01-4f8-c17-b8f--2.sslip.io"
      );
    });
  });
});

describe("getDeploymentUrl", () => {
  test("adds https protocol", () => {
    expect(getDeploymentUrl("production", "64.23.123.45", "myapp.com")).toBe("https://myapp.com");
  });

  test("adds https protocol for sslip.io", () => {
    expect(getDeploymentUrl("production", "64.23.123.45")).toBe(
      "https://production.64-23-123-45.sslip.io"
    );
  });

  test("handles preview with domain", () => {
    expect(getDeploymentUrl("pr-123", "64.23.123.45", "example.org")).toBe(
      "https://pr-123.preview.example.org"
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

  test("generates config for single production deployment with domain", () => {
    const state: TossState = {
      origin: null,
      deployments: {
        production: { port: 3000 },
      },
      appliedDependencies: [],
      lock: null,
    };

    const config: CaddyGeneratorConfig = {
      ...baseConfig,
      domain: "myapp.com",
    };

    const caddyfile = generateCaddyfile(state, config);

    expect(caddyfile).toContain("# Managed by toss for myapp");
    expect(caddyfile).toContain("myapp.com {");
    expect(caddyfile).toContain("reverse_proxy localhost:3000");
  });

  test("generates config for production with sslip.io", () => {
    const state: TossState = {
      origin: null,
      deployments: {
        production: { port: 3000 },
      },
      appliedDependencies: [],
      lock: null,
    };

    const caddyfile = generateCaddyfile(state, baseConfig);

    expect(caddyfile).toContain("production.64-23-123-45.sslip.io {");
    expect(caddyfile).toContain("reverse_proxy localhost:3000");
  });

  test("generates config for multiple deployments", () => {
    const state: TossState = {
      origin: null,
      deployments: {
        production: { port: 3000 },
        "pr-42": { port: 3001 },
        "pr-123": { port: 3002 },
      },
      appliedDependencies: [],
      lock: null,
    };

    const config: CaddyGeneratorConfig = {
      ...baseConfig,
      domain: "myapp.com",
    };

    const caddyfile = generateCaddyfile(state, config);

    expect(caddyfile).toContain("myapp.com {");
    expect(caddyfile).toContain("reverse_proxy localhost:3000");

    expect(caddyfile).toContain("pr-42.preview.myapp.com {");
    expect(caddyfile).toContain("reverse_proxy localhost:3001");

    expect(caddyfile).toContain("pr-123.preview.myapp.com {");
    expect(caddyfile).toContain("reverse_proxy localhost:3002");
  });

  test("sorts production first, then alphabetically", () => {
    const state: TossState = {
      origin: null,
      deployments: {
        "pr-99": { port: 3003 },
        "pr-42": { port: 3001 },
        production: { port: 3000 },
        "pr-123": { port: 3002 },
      },
      appliedDependencies: [],
      lock: null,
    };

    const caddyfile = generateCaddyfile(state, baseConfig);

    const productionIndex = caddyfile.indexOf("production.");
    const pr42Index = caddyfile.indexOf("pr-42.");
    const pr99Index = caddyfile.indexOf("pr-99.");
    const pr123Index = caddyfile.indexOf("pr-123.");

    // Production should come first
    expect(productionIndex).toBeLessThan(pr42Index);
    expect(productionIndex).toBeLessThan(pr99Index);
    expect(productionIndex).toBeLessThan(pr123Index);

    // Then alphabetical: pr-123, pr-42, pr-99
    expect(pr123Index).toBeLessThan(pr42Index);
    expect(pr42Index).toBeLessThan(pr99Index);
  });

  test("generates valid site blocks with correct structure", () => {
    const state: TossState = {
      origin: null,
      deployments: {
        production: { port: 3000 },
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
    expect(caddyfile).toMatch(/example\.com \{[\s\S]*reverse_proxy localhost:3000[\s\S]*\}/);
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

    expect(caddyfile).toContain("feature-branch-123-abc.preview.app.io {");
    expect(caddyfile).toContain("reverse_proxy localhost:3005");
  });
});
