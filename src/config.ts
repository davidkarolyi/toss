import { existsSync } from "node:fs";
import { join, dirname } from "node:path";

/**
 * Parsed server connection string
 */
export interface ServerConnection {
  user: string;
  host: string;
  port: number;
}

/**
 * Config structure as defined in toss.json
 */
export interface TossConfig {
  app: string;
  server: string;
  startCommand: string;
  deployScript: string[];
  domain?: string;
  dependencies?: Record<string, string>;
}

/**
 * Loaded config with additional metadata
 */
export interface LoadedConfig {
  config: TossConfig;
  repoRoot: string;
  configPath: string;
}

const CONFIG_FILENAME = "toss.json";

/**
 * Searches for toss.json starting from the current directory and walking up to parent directories.
 * Returns the path to toss.json if found, or null if not found.
 */
function findConfigFile(startDir: string = process.cwd()): string | null {
  let currentDir = startDir;

  while (true) {
    const configPath = join(currentDir, CONFIG_FILENAME);

    if (existsSync(configPath)) {
      return configPath;
    }

    const parentDir = dirname(currentDir);

    // Reached root directory
    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}

/**
 * Validates that all required fields are present and have correct types.
 * Throws an error with a descriptive message if validation fails.
 */
function validateConfig(rawConfig: unknown, configPath: string): TossConfig {
  if (typeof rawConfig !== "object" || rawConfig === null) {
    throw new Error(`${configPath}: config must be a JSON object`);
  }

  const config = rawConfig as Record<string, unknown>;
  const errors: string[] = [];

  // Required string fields
  if (typeof config.app !== "string" || config.app.trim() === "") {
    errors.push('"app" is required and must be a non-empty string');
  }

  if (typeof config.server !== "string" || config.server.trim() === "") {
    errors.push('"server" is required and must be a non-empty string');
  }

  if (
    typeof config.startCommand !== "string" ||
    config.startCommand.trim() === ""
  ) {
    errors.push('"startCommand" is required and must be a non-empty string');
  }

  // deployScript must be an array of strings
  if (!Array.isArray(config.deployScript)) {
    errors.push('"deployScript" is required and must be an array of strings');
  } else {
    const invalidItems = config.deployScript.filter(
      (item) => typeof item !== "string"
    );
    if (invalidItems.length > 0) {
      errors.push('"deployScript" must contain only strings');
    }
    if (config.deployScript.length === 0) {
      errors.push('"deployScript" must contain at least one command');
    }
  }

  // Optional: domain
  if (config.domain !== undefined) {
    if (typeof config.domain !== "string" || config.domain.trim() === "") {
      errors.push('"domain" must be a non-empty string if provided');
    }
  }

  // Optional: dependencies
  if (config.dependencies !== undefined) {
    if (
      typeof config.dependencies !== "object" ||
      config.dependencies === null ||
      Array.isArray(config.dependencies)
    ) {
      errors.push(
        '"dependencies" must be an object mapping names to install commands'
      );
    } else {
      const deps = config.dependencies as Record<string, unknown>;
      for (const [name, command] of Object.entries(deps)) {
        if (typeof command !== "string" || command.trim() === "") {
          errors.push(
            `"dependencies.${name}" must be a non-empty string command`
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid ${configPath}:\n  - ${errors.join("\n  - ")}`
    );
  }

  return {
    app: (config.app as string).trim(),
    server: (config.server as string).trim(),
    startCommand: (config.startCommand as string).trim(),
    deployScript: config.deployScript as string[],
    domain: config.domain ? (config.domain as string).trim() : undefined,
    dependencies: config.dependencies as Record<string, string> | undefined,
  };
}

/**
 * Loads and validates the toss.json config file.
 * Searches from the current directory upwards until it finds the config.
 *
 * @returns The loaded config along with the repo root path
 * @throws Error if config is not found or is invalid
 */
export async function loadConfig(): Promise<LoadedConfig> {
  const configPath = findConfigFile();

  if (!configPath) {
    console.error("Could not find toss.json in current directory or any parent.");
    console.error("");
    console.error("To set up a new project, run:");
    console.error("  toss init");
    process.exit(1);
  }

  let rawContent: string;
  try {
    rawContent = await Bun.file(configPath).text();
  } catch {
    throw new Error(`Failed to read ${configPath}`);
  }

  let rawConfig: unknown;
  try {
    rawConfig = JSON.parse(rawContent);
  } catch {
    throw new Error(`${configPath}: invalid JSON`);
  }

  const config = validateConfig(rawConfig, configPath);
  const repoRoot = dirname(configPath);

  return {
    config,
    repoRoot,
    configPath,
  };
}

/**
 * Parses a server connection string into its components.
 *
 * Supported formats:
 *   - user@host
 *   - user@host:port
 *
 * @param server The server string from config
 * @returns Parsed connection details
 * @throws Error if the format is invalid
 */
export function parseServerString(server: string): ServerConnection {
  // Format: user@host or user@host:port
  const atIndex = server.indexOf("@");

  if (atIndex === -1) {
    throw new Error(
      `Invalid server format: "${server}". Expected format: user@host or user@host:port`
    );
  }

  const user = server.slice(0, atIndex);
  const hostPart = server.slice(atIndex + 1);

  if (!user) {
    throw new Error(
      `Invalid server format: "${server}". User cannot be empty.`
    );
  }

  // Check for port
  const colonIndex = hostPart.lastIndexOf(":");
  let host: string;
  let port = 22;

  if (colonIndex !== -1) {
    host = hostPart.slice(0, colonIndex);
    const portString = hostPart.slice(colonIndex + 1);
    const parsedPort = parseInt(portString, 10);

    if (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      throw new Error(
        `Invalid port "${portString}" in server string. Port must be a number between 1 and 65535.`
      );
    }
    port = parsedPort;
  } else {
    host = hostPart;
  }

  if (!host) {
    throw new Error(
      `Invalid server format: "${server}". Host cannot be empty.`
    );
  }

  return { user, host, port };
}

/**
 * Extracts just the IP address or hostname from the server config.
 * Useful for constructing sslip.io URLs.
 */
export function extractHostFromServer(server: string): string {
  const { host } = parseServerString(server);
  return host;
}
