import { describe, test, expect } from "bun:test";
import { parseServerString, extractHostFromServer } from "./config.ts";

describe("parseServerString", () => {
  test("parses user@host format", () => {
    const result = parseServerString("root@192.168.1.1");
    expect(result).toEqual({
      user: "root",
      host: "192.168.1.1",
      port: 22,
    });
  });

  test("parses user@host:port format", () => {
    const result = parseServerString("root@192.168.1.1:2222");
    expect(result).toEqual({
      user: "root",
      host: "192.168.1.1",
      port: 2222,
    });
  });

  test("parses hostname instead of IP", () => {
    const result = parseServerString("deploy@myserver.com");
    expect(result).toEqual({
      user: "deploy",
      host: "myserver.com",
      port: 22,
    });
  });

  test("parses hostname with custom port", () => {
    const result = parseServerString("deploy@myserver.com:3022");
    expect(result).toEqual({
      user: "deploy",
      host: "myserver.com",
      port: 3022,
    });
  });

  test("parses bracketed IPv6 without port", () => {
    const result = parseServerString("root@[::1]");
    expect(result).toEqual({
      user: "root",
      host: "::1",
      port: 22,
    });
  });

  test("parses bracketed IPv6 with port", () => {
    const result = parseServerString("deploy@[2a01:4f8:c17:b8f::2]:2222");
    expect(result).toEqual({
      user: "deploy",
      host: "2a01:4f8:c17:b8f::2",
      port: 2222,
    });
  });

  test("throws on missing @", () => {
    expect(() => parseServerString("192.168.1.1")).toThrow(
      'Invalid server format: "192.168.1.1". Expected format: user@host or user@host:port'
    );
  });

  test("throws on empty user", () => {
    expect(() => parseServerString("@192.168.1.1")).toThrow(
      'Invalid server format: "@192.168.1.1". User cannot be empty.'
    );
  });

  test("throws on empty host", () => {
    expect(() => parseServerString("root@")).toThrow(
      'Invalid server format: "root@". Host cannot be empty.'
    );
  });

  test("throws on invalid port", () => {
    expect(() => parseServerString("root@host:abc")).toThrow(
      'Invalid port "abc" in server string.'
    );
  });

  test("throws on port out of range", () => {
    expect(() => parseServerString("root@host:99999")).toThrow(
      'Invalid port "99999" in server string.'
    );
  });

  test("throws on unbracketed IPv6", () => {
    expect(() => parseServerString("root@2a01:4f8:c17:b8f::2")).toThrow(
      "IPv6 addresses must use brackets"
    );
  });
});

describe("extractHostFromServer", () => {
  test("extracts host from user@host format", () => {
    expect(extractHostFromServer("root@64.23.123.45")).toBe("64.23.123.45");
  });

  test("extracts host from user@host:port format", () => {
    expect(extractHostFromServer("root@64.23.123.45:2222")).toBe("64.23.123.45");
  });

  test("extracts host from bracketed IPv6 format", () => {
    expect(extractHostFromServer("root@[::1]")).toBe("::1");
  });
});
