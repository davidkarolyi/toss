import { describe, expect, test } from "bun:test";
import { parseEnvFile, formatEnvFile } from "./deploy.ts";

describe("parseEnvFile", () => {
  test("parses simple key-value pairs", () => {
    const content = `KEY1=value1
KEY2=value2`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      KEY1: "value1",
      KEY2: "value2",
    });
  });

  test("skips empty lines", () => {
    const content = `KEY1=value1

KEY2=value2`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      KEY1: "value1",
      KEY2: "value2",
    });
  });

  test("skips comment lines", () => {
    const content = `# This is a comment
KEY1=value1
# Another comment
KEY2=value2`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      KEY1: "value1",
      KEY2: "value2",
    });
  });

  test("handles quoted values with double quotes", () => {
    const content = `KEY1="value with spaces"
KEY2="another value"`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      KEY1: "value with spaces",
      KEY2: "another value",
    });
  });

  test("handles quoted values with single quotes", () => {
    const content = `KEY1='value with spaces'
KEY2='another value'`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      KEY1: "value with spaces",
      KEY2: "another value",
    });
  });

  test("handles values with equals signs", () => {
    const content = `DATABASE_URL=postgres://user:pass@host/db?ssl=true`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      DATABASE_URL: "postgres://user:pass@host/db?ssl=true",
    });
  });

  test("handles empty values", () => {
    const content = `KEY1=
KEY2=value`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      KEY1: "",
      KEY2: "value",
    });
  });

  test("skips lines without equals sign", () => {
    const content = `KEY1=value1
invalid line
KEY2=value2`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      KEY1: "value1",
      KEY2: "value2",
    });
  });

  test("handles empty content", () => {
    const result = parseEnvFile("");
    expect(result).toEqual({});
  });

  test("handles content with only comments", () => {
    const content = `# Comment 1
# Comment 2`;
    const result = parseEnvFile(content);
    expect(result).toEqual({});
  });

  test("trims leading whitespace from lines", () => {
    const content = `  KEY1=value1
  KEY2=value2`;
    const result = parseEnvFile(content);
    expect(result).toEqual({
      KEY1: "value1",
      KEY2: "value2",
    });
  });
});

describe("formatEnvFile", () => {
  test("formats simple key-value pairs", () => {
    const secrets = {
      KEY1: "value1",
      KEY2: "value2",
    };
    const result = formatEnvFile(secrets);
    expect(result).toBe(`KEY1=value1
KEY2=value2
`);
  });

  test("sorts keys alphabetically", () => {
    const secrets = {
      ZEBRA: "z",
      APPLE: "a",
      MANGO: "m",
    };
    const result = formatEnvFile(secrets);
    expect(result).toBe(`APPLE=a
MANGO=m
ZEBRA=z
`);
  });

  test("quotes values with spaces", () => {
    const secrets = {
      KEY: "value with spaces",
    };
    const result = formatEnvFile(secrets);
    expect(result).toBe(`KEY="value with spaces"
`);
  });

  test("quotes values with special characters", () => {
    const secrets = {
      DOLLAR: "has$dollar",
      HASH: "has#hash",
      BACKTICK: "has`backtick",
      BACKSLASH: "has\\backslash",
    };
    const result = formatEnvFile(secrets);
    expect(result).toContain('DOLLAR="has$dollar"');
    expect(result).toContain('HASH="has#hash"');
    expect(result).toContain('BACKTICK="has`backtick"');
    expect(result).toContain('BACKSLASH="has\\backslash"');
  });

  test("escapes double quotes in values", () => {
    const secrets = {
      KEY: 'value with "quotes"',
    };
    const result = formatEnvFile(secrets);
    expect(result).toBe(`KEY="value with \\"quotes\\""
`);
  });

  test("handles empty secrets object", () => {
    const result = formatEnvFile({});
    expect(result).toBe("");
  });

  test("handles values with equals signs", () => {
    const secrets = {
      URL: "postgres://user:pass@host/db?ssl=true",
    };
    const result = formatEnvFile(secrets);
    expect(result).toBe(`URL=postgres://user:pass@host/db?ssl=true
`);
  });

  test("handles empty values", () => {
    const secrets = {
      EMPTY: "",
      FULL: "value",
    };
    const result = formatEnvFile(secrets);
    expect(result).toBe(`EMPTY=
FULL=value
`);
  });
});

describe("parseEnvFile and formatEnvFile roundtrip", () => {
  test("roundtrip preserves simple values", () => {
    const original = {
      KEY1: "value1",
      KEY2: "value2",
    };
    const formatted = formatEnvFile(original);
    const parsed = parseEnvFile(formatted);
    expect(parsed).toEqual(original);
  });

  test("roundtrip preserves values with equals signs", () => {
    const original = {
      DATABASE_URL: "postgres://user:pass@host/db?ssl=true&mode=require",
    };
    const formatted = formatEnvFile(original);
    const parsed = parseEnvFile(formatted);
    expect(parsed).toEqual(original);
  });

  test("roundtrip preserves values with spaces", () => {
    const original = {
      MESSAGE: "hello world",
    };
    const formatted = formatEnvFile(original);
    const parsed = parseEnvFile(formatted);
    expect(parsed).toEqual(original);
  });

  test("roundtrip preserves empty values", () => {
    const original = {
      EMPTY: "",
      FULL: "value",
    };
    const formatted = formatEnvFile(original);
    const parsed = parseEnvFile(formatted);
    expect(parsed).toEqual(original);
  });
});
