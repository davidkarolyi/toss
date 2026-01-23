import { describe, test, expect } from "bun:test";
import { getServiceName, getUnitFilePath, generateUnitFile } from "./systemd.ts";
import type { ServiceConfig } from "./systemd.ts";

describe("getServiceName", () => {
  test("generates correct service name", () => {
    expect(getServiceName("myapp", "production")).toBe("toss-myapp-production");
  });

  test("handles environment names with hyphens", () => {
    expect(getServiceName("myapp", "pr-42")).toBe("toss-myapp-pr-42");
  });

  test("handles complex app names", () => {
    expect(getServiceName("my-cool-app", "staging")).toBe("toss-my-cool-app-staging");
  });
});

describe("getUnitFilePath", () => {
  test("generates correct unit file path", () => {
    expect(getUnitFilePath("myapp", "production")).toBe(
      "/etc/systemd/system/toss-myapp-production.service"
    );
  });

  test("handles preview environments", () => {
    expect(getUnitFilePath("webapp", "pr-123")).toBe(
      "/etc/systemd/system/toss-webapp-pr-123.service"
    );
  });
});

describe("generateUnitFile", () => {
  test("generates valid unit file content", () => {
    const config: ServiceConfig = {
      appName: "myapp",
      environment: "production",
      workingDirectory: "/srv/myapp/production",
      startCommand: "npm start",
      envFilePath: "/srv/myapp/production/.env",
    };

    const content = generateUnitFile(config);

    expect(content).toContain("[Unit]");
    expect(content).toContain("Description=toss-myapp-production");
    expect(content).toContain("After=network.target");

    expect(content).toContain("[Service]");
    expect(content).toContain("Type=simple");
    expect(content).toContain("WorkingDirectory=/srv/myapp/production");
    expect(content).toContain("EnvironmentFile=/srv/myapp/production/.env");
    expect(content).toContain("ExecStart=npm start");
    expect(content).toContain("Restart=always");
    expect(content).toContain("RestartSec=5");

    expect(content).toContain("[Install]");
    expect(content).toContain("WantedBy=multi-user.target");
  });

  test("handles complex start commands", () => {
    const config: ServiceConfig = {
      appName: "webapp",
      environment: "pr-42",
      workingDirectory: "/srv/webapp/pr-42",
      startCommand: "/usr/bin/node server.js --port 3001",
      envFilePath: "/srv/webapp/pr-42/.env",
    };

    const content = generateUnitFile(config);

    expect(content).toContain("Description=toss-webapp-pr-42");
    expect(content).toContain("WorkingDirectory=/srv/webapp/pr-42");
    expect(content).toContain("ExecStart=/usr/bin/node server.js --port 3001");
    expect(content).toContain("EnvironmentFile=/srv/webapp/pr-42/.env");
  });

  test("generates properly formatted sections", () => {
    const config: ServiceConfig = {
      appName: "app",
      environment: "env",
      workingDirectory: "/srv/app/env",
      startCommand: "start",
      envFilePath: "/srv/app/env/.env",
    };

    const content = generateUnitFile(config);

    // Check that sections are in correct order
    const unitIndex = content.indexOf("[Unit]");
    const serviceIndex = content.indexOf("[Service]");
    const installIndex = content.indexOf("[Install]");

    expect(unitIndex).toBeLessThan(serviceIndex);
    expect(serviceIndex).toBeLessThan(installIndex);
  });

  test("includes all required service configuration", () => {
    const config: ServiceConfig = {
      appName: "myapp",
      environment: "production",
      workingDirectory: "/srv/myapp/production",
      startCommand: "bun run start",
      envFilePath: "/srv/myapp/production/.env",
    };

    const content = generateUnitFile(config);

    // All these fields are essential for proper service operation
    const requiredFields = [
      "Type=simple",
      "Restart=always",
      "RestartSec=5",
      "WantedBy=multi-user.target",
    ];

    for (const field of requiredFields) {
      expect(content).toContain(field);
    }
  });
});
