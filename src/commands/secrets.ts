import { existsSync } from "node:fs";
import { loadConfig, parseServerString } from "../config.ts";
import { writeRemoteFile, readRemoteFile, mkdirRemote, remoteExists } from "../ssh.ts";

/**
 * Valid environment types for secrets management
 */
type SecretsEnvironment = "prod" | "preview";

/**
 * Validates that the environment is a valid secrets environment (prod or preview)
 */
function validateSecretsEnvironment(environment: string): SecretsEnvironment {
  if (environment !== "prod" && environment !== "preview") {
    throw new Error(
      `Invalid environment "${environment}". Secrets environment must be "prod" or "preview".\n\n` +
        "  prod       - Base secrets for prod deployments\n" +
        "  preview    - Base secrets for all non-prod deployments"
    );
  }
  return environment;
}

/**
 * Parses arguments for secrets push/pull commands
 */
function parseSecretsArgs(
  args: string[],
  subcommand: string,
  options: { allowMissingFile?: boolean } = {}
): { environment: SecretsEnvironment; filePath: string; fileProvided: boolean } {
  // Find --file or -f flag
  let filePath: string | undefined;
  let environment: string | undefined;
  const remainingArgs: string[] = [];
  let skipNext = false;

  for (const [index, arg] of args.entries()) {
    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (arg === "--file" || arg === "-f") {
      const nextArg = args[index + 1];
      if (!nextArg || nextArg.startsWith("-")) {
        throw new Error(`The ${arg} flag requires a file path argument.`);
      }
      filePath = nextArg;
      skipNext = true;
    } else if (arg.startsWith("--file=")) {
      const extractedPath = arg.slice("--file=".length);
      if (!extractedPath) {
        throw new Error("The --file flag requires a file path argument.");
      }
      filePath = extractedPath;
    } else if (!arg.startsWith("-")) {
      remainingArgs.push(arg);
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }

  // First positional arg should be the environment
  environment = remainingArgs[0];

  if (!environment) {
    const usage =
      subcommand === "pull" && options.allowMissingFile
        ? `Usage: toss secrets ${subcommand} <prod|preview> [--file <path>]`
        : `Usage: toss secrets ${subcommand} <prod|preview> --file <path>`;
    throw new Error(
      `Missing environment argument.\n\n` +
        `${usage}\n\n` +
        `Example: toss secrets ${subcommand} prod --file .env.local`
    );
  }

  const validatedEnvironment = validateSecretsEnvironment(environment);

  let fileProvided = true;

  if (!filePath) {
    if (options.allowMissingFile) {
      fileProvided = false;
      filePath = validatedEnvironment === "prod" ? ".env.prod" : ".env.preview";
    } else {
      throw new Error(
        `Missing --file flag.\n\n` +
          `Usage: toss secrets ${subcommand} <prod|preview> --file <path>\n\n` +
          `Example: toss secrets ${subcommand} ${environment} --file .env.local`
      );
    }
  }

  return { environment: validatedEnvironment, filePath, fileProvided };
}

/**
 * Pushes a local secrets file to the VPS
 */
async function pushSecrets(args: string[]): Promise<void> {
  const { environment, filePath } = parseSecretsArgs(args, "push");

  // Validate local file exists
  if (!existsSync(filePath)) {
    throw new Error(`Local file not found: ${filePath}`);
  }

  // Load config
  const { config } = await loadConfig();
  const connection = parseServerString(config.server);

  // Read local file content
  const content = await Bun.file(filePath).text();

  // Construct remote path
  const remotePath = `/srv/${config.app}/.toss/secrets/${environment}.env`;
  const secretsDir = `/srv/${config.app}/.toss/secrets`;

  // Ensure the secrets directory exists
  await mkdirRemote(connection, secretsDir, { requiresSudo: true });

  // Write the file to the server
  console.log(`→ Uploading secrets to ${environment}...`);
  await writeRemoteFile(connection, remotePath, content, {
    requiresSudo: true,
  });

  console.log(`✓ Secrets pushed to ${remotePath}`);
}

/**
 * Pulls secrets from the VPS to a local file
 */
async function pullSecrets(args: string[]): Promise<void> {
  const { environment, filePath, fileProvided } = parseSecretsArgs(args, "pull", {
    allowMissingFile: true,
  });

  // Load config
  const { config } = await loadConfig();
  const connection = parseServerString(config.server);

  // Construct remote path
  const remotePath = `/srv/${config.app}/.toss/secrets/${environment}.env`;

  // Check if remote file exists
  const exists = await remoteExists(connection, remotePath, {
    requiresSudo: true,
  });
  if (!exists) {
    throw new Error(
      `No secrets file found for "${environment}".\n\n` +
        `Expected location: ${remotePath}\n\n` +
        `Push secrets first with: toss secrets push ${environment} --file <path>`
    );
  }

  // Read the remote file
  console.log(`→ Downloading ${environment} secrets...`);
  const content = await readRemoteFile(connection, remotePath, {
    requiresSudo: true,
  });

  // Write to local file
  if (!fileProvided) {
    console.log(`→ No --file provided, using ${filePath}`);
  }
  await Bun.write(filePath, content);

  console.log(`✓ Secrets saved to ${filePath}`);
}

/**
 * Prints help for the secrets command
 */
function printSecretsHelp(): void {
  console.log(`toss secrets - Manage secrets on VPS

Usage:
  toss secrets push <environment> --file <path>
  toss secrets pull <environment> [--file <path>]

Commands:
  push <env>    Upload a local file as secrets
  pull <env>    Download secrets to a local file

Environments:
  prod          Base secrets for prod deployments
  preview       Base secrets for all non-prod deployments

Examples:
  toss secrets push prod --file .env.local
  toss secrets push preview --file .env.preview
  toss secrets pull prod --file .env
  toss secrets pull prod
`);
}

/**
 * Main secrets command handler
 */
export async function secretsCommand(args: string[]): Promise<void> {
  const subcommand = args[0];
  const subcommandArgs = args.slice(1);

  if (!subcommand || subcommand === "-h" || subcommand === "--help") {
    printSecretsHelp();
    return;
  }

  switch (subcommand) {
    case "push":
      await pushSecrets(subcommandArgs);
      break;
    case "pull":
      await pullSecrets(subcommandArgs);
      break;
    default:
      throw new Error(
        `Unknown secrets command: ${subcommand}\n\n` +
          `Available commands: push, pull\n` +
          `Run 'toss secrets --help' for usage information.`
      );
  }
}
