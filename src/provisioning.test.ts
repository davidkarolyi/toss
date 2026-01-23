import { describe, test, expect } from "bun:test";
import {
  getAppDirectory,
  getProductionSecretsPath,
  getPreviewSecretsPath,
} from "./provisioning.ts";

describe("getAppDirectory", () => {
  test("returns correct path for app", () => {
    expect(getAppDirectory("myapp")).toBe("/srv/myapp");
  });

  test("handles hyphenated app names", () => {
    expect(getAppDirectory("my-cool-app")).toBe("/srv/my-cool-app");
  });

  test("handles numbers in app names", () => {
    expect(getAppDirectory("app123")).toBe("/srv/app123");
  });
});

describe("getProductionSecretsPath", () => {
  test("returns correct path for production secrets", () => {
    expect(getProductionSecretsPath("myapp")).toBe(
      "/srv/myapp/.toss/secrets/production.env"
    );
  });

  test("handles hyphenated app names", () => {
    expect(getProductionSecretsPath("my-app")).toBe(
      "/srv/my-app/.toss/secrets/production.env"
    );
  });
});

describe("getPreviewSecretsPath", () => {
  test("returns correct path for preview secrets", () => {
    expect(getPreviewSecretsPath("myapp")).toBe(
      "/srv/myapp/.toss/secrets/preview.env"
    );
  });

  test("handles hyphenated app names", () => {
    expect(getPreviewSecretsPath("my-app")).toBe(
      "/srv/my-app/.toss/secrets/preview.env"
    );
  });
});

describe("directory structure consistency", () => {
  test("secrets paths are under app directory", () => {
    const appName = "testapp";
    const appDir = getAppDirectory(appName);
    const prodSecrets = getProductionSecretsPath(appName);
    const previewSecrets = getPreviewSecretsPath(appName);

    expect(prodSecrets.startsWith(appDir)).toBe(true);
    expect(previewSecrets.startsWith(appDir)).toBe(true);
  });

  test("production and preview secrets are in same directory", () => {
    const appName = "myapp";
    const prodPath = getProductionSecretsPath(appName);
    const previewPath = getPreviewSecretsPath(appName);

    // Both should be in /srv/myapp/.toss/secrets/
    const prodDir = prodPath.substring(0, prodPath.lastIndexOf("/"));
    const previewDir = previewPath.substring(0, previewPath.lastIndexOf("/"));

    expect(prodDir).toBe(previewDir);
    expect(prodDir).toBe("/srv/myapp/.toss/secrets");
  });
});

describe("ProvisioningOptions type", () => {
  test("accepts valid options with git origin", () => {
    const options = {
      appName: "myapp",
      gitOrigin: "git@github.com:user/repo.git",
    };

    expect(options.appName).toBe("myapp");
    expect(options.gitOrigin).toBe("git@github.com:user/repo.git");
  });

  test("accepts null git origin", () => {
    const options = {
      appName: "myapp",
      gitOrigin: null,
    };

    expect(options.appName).toBe("myapp");
    expect(options.gitOrigin).toBeNull();
  });
});
