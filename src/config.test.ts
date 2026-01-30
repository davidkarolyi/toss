import { describe, test, expect } from "bun:test";
import {
  parseServerString,
  extractHostFromServer,
  validatePersistentDirPath,
  isValidKeepReleases,
} from "./config.ts";

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

describe("validatePersistentDirPath", () => {
  describe("valid paths", () => {
    test("accepts simple directory names", () => {
      expect(validatePersistentDirPath("uploads")).toEqual({
        valid: true,
        normalized: "uploads",
      });
      expect(validatePersistentDirPath("data.sqlite")).toEqual({
        valid: true,
        normalized: "data.sqlite",
      });
      expect(validatePersistentDirPath(".env")).toEqual({
        valid: true,
        normalized: ".env",
      });
    });

    test("accepts simple relative paths", () => {
      expect(validatePersistentDirPath("data/db.sqlite")).toEqual({
        valid: true,
        normalized: "data/db.sqlite",
      });
      expect(validatePersistentDirPath("var/cache")).toEqual({
        valid: true,
        normalized: "var/cache",
      });
      expect(validatePersistentDirPath("storage/uploads/images")).toEqual({
        valid: true,
        normalized: "storage/uploads/images",
      });
    });

    test("normalizes leading ./ and trailing slashes", () => {
      expect(validatePersistentDirPath("./uploads")).toEqual({
        valid: true,
        normalized: "uploads",
      });
      expect(validatePersistentDirPath("data/cache/")).toEqual({
        valid: true,
        normalized: "data/cache",
      });
    });

    test("accepts paths with single dots in the middle", () => {
      expect(validatePersistentDirPath("data/./cache")).toEqual({
        valid: true,
        normalized: "data/./cache",
      });
    });

    test("accepts paths with numbers and special characters", () => {
      expect(validatePersistentDirPath("data-2024")).toEqual({
        valid: true,
        normalized: "data-2024",
      });
      expect(validatePersistentDirPath("cache_v2")).toEqual({
        valid: true,
        normalized: "cache_v2",
      });
      expect(validatePersistentDirPath("file.tar.gz")).toEqual({
        valid: true,
        normalized: "file.tar.gz",
      });
    });
  });

  describe("invalid paths - empty", () => {
    test("rejects empty string", () => {
      const result = validatePersistentDirPath("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("non-empty string");
    });

    test("rejects whitespace only", () => {
      const result = validatePersistentDirPath("   ");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("non-empty string");
    });

    test("rejects dot path", () => {
      const result = validatePersistentDirPath("./");
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be "."');
    });
  });

  describe("invalid paths - absolute", () => {
    test("rejects paths starting with /", () => {
      const result = validatePersistentDirPath("/uploads");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("absolute path");
      expect(result.error).toContain("/uploads");
    });

    test("rejects full absolute paths", () => {
      const result = validatePersistentDirPath("/var/data/uploads");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("absolute path");
    });
  });

  describe("invalid paths - parent directory traversal", () => {
    test("rejects paths starting with ..", () => {
      const result = validatePersistentDirPath("../uploads");
      expect(result.valid).toBe(false);
      expect(result.error).toContain('".."');
    });

    test("rejects paths with .. in the middle", () => {
      const result = validatePersistentDirPath("data/../uploads");
      expect(result.valid).toBe(false);
      expect(result.error).toContain('".."');
    });

    test("rejects paths ending with ..", () => {
      const result = validatePersistentDirPath("data/..");
      expect(result.valid).toBe(false);
      expect(result.error).toContain('".."');
    });

    test("rejects multiple .. segments", () => {
      const result = validatePersistentDirPath("../../etc/passwd");
      expect(result.valid).toBe(false);
      expect(result.error).toContain('".."');
    });

    test("accepts paths with .. as part of filename", () => {
      // "file..txt" is valid - the dots are part of the filename, not a segment
      expect(validatePersistentDirPath("file..txt")).toEqual({
        valid: true,
        normalized: "file..txt",
      });
      expect(validatePersistentDirPath("...")).toEqual({
        valid: true,
        normalized: "...",
      });
    });
  });
});

describe("isValidKeepReleases", () => {
  describe("valid values", () => {
    test("accepts positive integers", () => {
      expect(isValidKeepReleases(1)).toBe(true);
      expect(isValidKeepReleases(3)).toBe(true);
      expect(isValidKeepReleases(10)).toBe(true);
      expect(isValidKeepReleases(100)).toBe(true);
    });
  });

  describe("invalid values", () => {
    test("rejects zero", () => {
      expect(isValidKeepReleases(0)).toBe(false);
    });

    test("rejects negative integers", () => {
      expect(isValidKeepReleases(-1)).toBe(false);
      expect(isValidKeepReleases(-10)).toBe(false);
    });

    test("rejects non-integers", () => {
      expect(isValidKeepReleases(1.5)).toBe(false);
      expect(isValidKeepReleases(3.14)).toBe(false);
      expect(isValidKeepReleases(0.5)).toBe(false);
    });

    test("rejects non-numbers", () => {
      expect(isValidKeepReleases("3")).toBe(false);
      expect(isValidKeepReleases(null)).toBe(false);
      expect(isValidKeepReleases(undefined)).toBe(false);
      expect(isValidKeepReleases({})).toBe(false);
      expect(isValidKeepReleases([])).toBe(false);
    });

    test("rejects NaN and Infinity", () => {
      expect(isValidKeepReleases(NaN)).toBe(false);
      expect(isValidKeepReleases(Infinity)).toBe(false);
      expect(isValidKeepReleases(-Infinity)).toBe(false);
    });
  });
});
