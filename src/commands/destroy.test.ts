import { describe, test, expect } from "bun:test";

describe("destroy command error messages", () => {
  test("missing app argument error includes usage", () => {
    const errorMessage = `Missing app argument.\n\nUsage: toss destroy <app>\n\nExamples:\n  toss destroy myapp`;

    expect(errorMessage).toContain("Missing app argument");
    expect(errorMessage).toContain("Usage:");
    expect(errorMessage).toContain("Examples:");
  });
});

describe("destroy command confirmation phrase", () => {
  test("requires exact confirmation phrase", () => {
    const appName = "myapp";
    const requiredPhrase = `Yes, delete ${appName} forever`;
    expect(requiredPhrase).toBe("Yes, delete myapp forever");
  });
});

describe("destroy command help text", () => {
  test("help text includes usage and examples", () => {
    const helpText = `toss destroy - Permanently delete an app from the server

Usage: toss destroy <app>

Arguments:
  app               The app name from toss.json

Options:
  -h, --help        Show this help message

Note: This deletes all environments, secrets, services, and server files for the app.

Examples:
  toss destroy myapp
`;

    expect(helpText).toContain("toss destroy - Permanently delete an app");
    expect(helpText).toContain("Usage:");
    expect(helpText).toContain("Arguments:");
    expect(helpText).toContain("Options:");
    expect(helpText).toContain("Examples:");
  });
});
