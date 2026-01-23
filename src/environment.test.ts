import { describe, expect, it } from "bun:test";
import {
  validateEnvironmentName,
  validateEnvironmentNameOrThrow,
  isValidEnvironmentName,
} from "./environment.ts";

describe("validateEnvironmentName", () => {
  describe("valid names", () => {
    it("accepts simple lowercase names", () => {
      expect(validateEnvironmentName("production")).toEqual({ valid: true });
      expect(validateEnvironmentName("staging")).toEqual({ valid: true });
      expect(validateEnvironmentName("development")).toEqual({ valid: true });
    });

    it("accepts names with numbers", () => {
      expect(validateEnvironmentName("pr42")).toEqual({ valid: true });
      expect(validateEnvironmentName("feature1")).toEqual({ valid: true });
      expect(validateEnvironmentName("v2")).toEqual({ valid: true });
    });

    it("accepts names with hyphens", () => {
      expect(validateEnvironmentName("pr-42")).toEqual({ valid: true });
      expect(validateEnvironmentName("feature-auth")).toEqual({ valid: true });
      expect(validateEnvironmentName("my-cool-feature")).toEqual({ valid: true });
    });

    it("accepts single character names", () => {
      expect(validateEnvironmentName("a")).toEqual({ valid: true });
      expect(validateEnvironmentName("z")).toEqual({ valid: true });
    });

    it("accepts names up to 63 characters", () => {
      const longName = "a" + "b".repeat(62);
      expect(longName.length).toBe(63);
      expect(validateEnvironmentName(longName)).toEqual({ valid: true });
    });

    it("accepts typical PR naming patterns", () => {
      expect(validateEnvironmentName("pr-1")).toEqual({ valid: true });
      expect(validateEnvironmentName("pr-123")).toEqual({ valid: true });
      expect(validateEnvironmentName("pr-9999")).toEqual({ valid: true });
    });
  });

  describe("invalid names - empty", () => {
    it("rejects empty string", () => {
      const result = validateEnvironmentName("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("cannot be empty");
    });
  });

  describe("invalid names - length", () => {
    it("rejects names longer than 63 characters", () => {
      const longName = "a" + "b".repeat(63);
      expect(longName.length).toBe(64);
      const result = validateEnvironmentName(longName);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("too long");
      expect(result.error).toContain("64 characters");
      expect(result.error).toContain("Maximum is 63");
    });
  });

  describe("invalid names - must start with letter", () => {
    it("rejects names starting with a number", () => {
      const result = validateEnvironmentName("42pr");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must start with a letter");
      expect(result.error).toContain("not a number");
    });

    it("rejects names starting with a hyphen", () => {
      const result = validateEnvironmentName("-pr42");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must start with a letter");
      expect(result.error).toContain("not a hyphen");
    });
  });

  describe("invalid names - uppercase", () => {
    it("rejects uppercase names with helpful suggestion", () => {
      const result = validateEnvironmentName("Production");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be lowercase");
      expect(result.error).toContain('Try "production" instead');
    });

    it("rejects all uppercase names", () => {
      const result = validateEnvironmentName("STAGING");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be lowercase");
      expect(result.error).toContain('Try "staging" instead');
    });

    it("rejects mixed case names", () => {
      const result = validateEnvironmentName("myFeature");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be lowercase");
      expect(result.error).toContain('Try "myfeature" instead');
    });

    it("rejects names starting with uppercase", () => {
      const result = validateEnvironmentName("Pr-42");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("must be lowercase");
      expect(result.error).toContain('Try "pr-42" instead');
    });
  });

  describe("invalid names - special characters", () => {
    it("rejects names with underscores", () => {
      const result = validateEnvironmentName("my_feature");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid characters");
      expect(result.error).toContain("_");
    });

    it("rejects names with dots", () => {
      const result = validateEnvironmentName("v1.2.3");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid characters");
      expect(result.error).toContain(".");
    });

    it("rejects names with spaces", () => {
      const result = validateEnvironmentName("my feature");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid characters");
    });

    it("rejects names with slashes", () => {
      const result = validateEnvironmentName("feature/auth");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid characters");
      expect(result.error).toContain("/");
    });

    it("rejects names with colons", () => {
      const result = validateEnvironmentName("env:test");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid characters");
      expect(result.error).toContain(":");
    });

    it("shows multiple invalid characters", () => {
      const result = validateEnvironmentName("my_feature.test");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("invalid characters");
      expect(result.error).toContain("_");
      expect(result.error).toContain(".");
    });
  });
});

describe("validateEnvironmentNameOrThrow", () => {
  it("does not throw for valid names", () => {
    expect(() => validateEnvironmentNameOrThrow("production")).not.toThrow();
    expect(() => validateEnvironmentNameOrThrow("pr-42")).not.toThrow();
    expect(() => validateEnvironmentNameOrThrow("staging")).not.toThrow();
  });

  it("throws with detailed error for invalid names", () => {
    expect(() => validateEnvironmentNameOrThrow("Production")).toThrow(
      "must be lowercase"
    );
    expect(() => validateEnvironmentNameOrThrow("Production")).toThrow(
      "Environment name rules:"
    );
  });

  it("includes examples in error message", () => {
    try {
      validateEnvironmentNameOrThrow("INVALID");
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("production");
      expect(message).toContain("staging");
      expect(message).toContain("pr-42");
    }
  });

  it("includes rules in error message", () => {
    try {
      validateEnvironmentNameOrThrow("123");
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("Lowercase letters, numbers, and hyphens only");
      expect(message).toContain("Must start with a letter");
      expect(message).toContain("Maximum 63 characters");
    }
  });
});

describe("isValidEnvironmentName", () => {
  it("returns true for valid names", () => {
    expect(isValidEnvironmentName("production")).toBe(true);
    expect(isValidEnvironmentName("pr-42")).toBe(true);
    expect(isValidEnvironmentName("staging")).toBe(true);
    expect(isValidEnvironmentName("a")).toBe(true);
  });

  it("returns false for invalid names", () => {
    expect(isValidEnvironmentName("")).toBe(false);
    expect(isValidEnvironmentName("Production")).toBe(false);
    expect(isValidEnvironmentName("42pr")).toBe(false);
    expect(isValidEnvironmentName("my_feature")).toBe(false);
    expect(isValidEnvironmentName("-invalid")).toBe(false);
  });
});

describe("edge cases", () => {
  it("handles names with only hyphens after first letter", () => {
    expect(validateEnvironmentName("a-")).toEqual({ valid: true });
    expect(validateEnvironmentName("a--")).toEqual({ valid: true });
    expect(validateEnvironmentName("a---b")).toEqual({ valid: true });
  });

  it("handles names ending with numbers", () => {
    expect(validateEnvironmentName("pr42")).toEqual({ valid: true });
    expect(validateEnvironmentName("test123")).toEqual({ valid: true });
  });

  it("handles names ending with hyphens", () => {
    expect(validateEnvironmentName("test-")).toEqual({ valid: true });
  });

  it("handles exactly 63 character names", () => {
    const exactlyMax = "a".repeat(63);
    expect(validateEnvironmentName(exactlyMax)).toEqual({ valid: true });
  });

  it("handles 64 character names (one over)", () => {
    const oneOverMax = "a".repeat(64);
    const result = validateEnvironmentName(oneOverMax);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("64 characters");
  });
});
