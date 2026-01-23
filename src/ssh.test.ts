import { describe, test, expect } from "bun:test";
import { buildSshArgs, escapeShellArg } from "./ssh.ts";

describe("buildSshArgs", () => {
  test("builds args for default port", () => {
    const args = buildSshArgs({
      user: "root",
      host: "192.168.1.1",
      port: 22,
    });

    expect(args).toContain("-o");
    expect(args).toContain("BatchMode=yes");
    expect(args).toContain("StrictHostKeyChecking=accept-new");
    expect(args).toContain("ConnectTimeout=10");
    expect(args).toContain("root@192.168.1.1");
    expect(args).not.toContain("-p");
  });

  test("builds args for custom port", () => {
    const args = buildSshArgs({
      user: "deploy",
      host: "myserver.com",
      port: 2222,
    });

    expect(args).toContain("-p");
    expect(args).toContain("2222");
    expect(args).toContain("deploy@myserver.com");
  });

  test("includes all security options", () => {
    const args = buildSshArgs({
      user: "root",
      host: "example.com",
      port: 22,
    });

    // Find BatchMode option
    const batchModeIndex = args.indexOf("BatchMode=yes");
    expect(batchModeIndex).toBeGreaterThan(0);
    expect(args[batchModeIndex - 1]).toBe("-o");

    // Find StrictHostKeyChecking option
    const strictHostIndex = args.indexOf("StrictHostKeyChecking=accept-new");
    expect(strictHostIndex).toBeGreaterThan(0);
    expect(args[strictHostIndex - 1]).toBe("-o");

    // Find ConnectTimeout option
    const timeoutIndex = args.indexOf("ConnectTimeout=10");
    expect(timeoutIndex).toBeGreaterThan(0);
    expect(args[timeoutIndex - 1]).toBe("-o");
  });
});

describe("escapeShellArg", () => {
  test("wraps simple string in single quotes", () => {
    expect(escapeShellArg("hello")).toBe("'hello'");
  });

  test("wraps path in single quotes", () => {
    expect(escapeShellArg("/srv/myapp/production")).toBe(
      "'/srv/myapp/production'"
    );
  });

  test("escapes single quotes within string", () => {
    expect(escapeShellArg("it's working")).toBe("'it'\\''s working'");
  });

  test("escapes multiple single quotes", () => {
    expect(escapeShellArg("don't can't won't")).toBe(
      "'don'\\''t can'\\''t won'\\''t'"
    );
  });

  test("handles empty string", () => {
    expect(escapeShellArg("")).toBe("''");
  });

  test("handles strings with special characters", () => {
    expect(escapeShellArg("hello world")).toBe("'hello world'");
    expect(escapeShellArg("$HOME")).toBe("'$HOME'");
    expect(escapeShellArg("a;b")).toBe("'a;b'");
    expect(escapeShellArg("a|b")).toBe("'a|b'");
    expect(escapeShellArg("a&b")).toBe("'a&b'");
  });

  test("handles newlines", () => {
    expect(escapeShellArg("line1\nline2")).toBe("'line1\nline2'");
  });
});
