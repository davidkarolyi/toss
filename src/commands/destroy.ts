import * as readline from "node:readline";
import { loadConfig, parseServerString, type ServerConnection } from "../config.ts";
import { execSudo, escapeShellArg, remoteExists, removeRemote } from "../ssh.ts";
import { readState } from "../state.ts";
import { removeService } from "../systemd.ts";
import { isCaddyInstalled, reloadCaddy } from "../caddy.ts";

function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function prompt(
  readlineInterface: readline.Interface,
  question: string
): Promise<string> {
  return new Promise((resolve) => {
    readlineInterface.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function printDestroyHelp(): void {
  console.log(`toss destroy - Permanently delete an app from the server

Usage: toss destroy <app>

Arguments:
  app               The app name from toss.json

Options:
  -h, --help        Show this help message

Note: This deletes all environments, secrets, services, and server files for the app.

Examples:
  toss destroy myapp
`);
}

function parseDestroyArgs(args: string[]): { appName: string } {
  let appName: string | undefined;

  for (const arg of args) {
    if (arg === "-h" || arg === "--help") {
      printDestroyHelp();
      process.exit(0);
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    } else if (!appName) {
      appName = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!appName) {
    throw new Error(
      "Missing app argument.\n\n" +
        "Usage: toss destroy <app>\n\n" +
        "Examples:\n" +
        "  toss destroy myapp"
    );
  }

  return { appName };
}

async function confirmDestroy(appName: string): Promise<boolean> {
  const readlineInterface = createReadlineInterface();
  try {
    const requiredPhrase = `Yes, delete ${appName} forever`;
    const answer = await prompt(
      readlineInterface,
      `Type "${requiredPhrase}" to confirm: `
    );
    return answer === requiredPhrase;
  } finally {
    readlineInterface.close();
  }
}

async function listServiceEnvironments(
  connection: ServerConnection,
  appName: string
): Promise<string[]> {
  const pattern = `toss-${appName}-*.service`;
  const command = `find /etc/systemd/system -maxdepth 1 -name ${escapeShellArg(pattern)} -print`;
  const result = await execSudo(connection, command);

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return [];
  }

  const prefix = `toss-${appName}-`;
  const suffix = ".service";

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split("/").pop() ?? line)
    .filter((name) => name.startsWith(prefix) && name.endsWith(suffix))
    .map((name) => name.slice(prefix.length, name.length - suffix.length));
}

export async function destroyCommand(args: string[]): Promise<void> {
  const { appName } = parseDestroyArgs(args);
  const { config } = await loadConfig();

  if (appName !== config.app) {
    throw new Error(
      `App name mismatch.\n\n` +
        `Config app: ${config.app}\n` +
        `Argument:  ${appName}\n\n` +
        "Run the command with the exact app name from toss.json."
    );
  }

  const confirmed = await confirmDestroy(appName);
  if (!confirmed) {
    console.log("Aborted.");
    return;
  }

  const connection = parseServerString(config.server);
  const warnings: string[] = [];
  const removedItems: string[] = [];

  console.log(`\n→ Destroying app: ${appName}...\n`);

  // Load state to discover deployments
  const state = await readState(connection, appName);
  const environments = new Set<string>(Object.keys(state.deployments));

  try {
    const serviceEnvs = await listServiceEnvironments(connection, appName);
    for (const env of serviceEnvs) {
      environments.add(env);
    }
  } catch (error) {
    warnings.push(
      error instanceof Error ? error.message : "Failed to list systemd services"
    );
  }

  if (environments.size > 0) {
    console.log("→ Removing services...");
    for (const env of environments) {
      try {
        await removeService(connection, appName, env);
        removedItems.push(`Systemd service: toss-${appName}-${env}`);
      } catch (error) {
        warnings.push(
          error instanceof Error
            ? `Failed to remove service ${env}: ${error.message}`
            : `Failed to remove service ${env}`
        );
      }
    }
  }

  // Remove app directory
  const appDir = `/srv/${appName}`;
  console.log("→ Removing app directory...");
  try {
    if (await remoteExists(connection, appDir, { requiresSudo: true })) {
      await removeRemote(connection, appDir, true, { requiresSudo: true });
      removedItems.push(`App directory: ${appDir}`);
    }
  } catch (error) {
    warnings.push(
      error instanceof Error ? `Failed to remove ${appDir}: ${error.message}` : `Failed to remove ${appDir}`
    );
  }

  // Remove Caddy config for app
  const caddyConfigPath = `/etc/caddy/caddy.d/${appName}.caddy`;
  console.log("→ Removing Caddy config...");
  let caddyConfigRemoved = false;
  try {
    if (await remoteExists(connection, caddyConfigPath, { requiresSudo: true })) {
      await removeRemote(connection, caddyConfigPath, false, { requiresSudo: true });
      removedItems.push(`Caddy config: ${caddyConfigPath}`);
      caddyConfigRemoved = true;
    }
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `Failed to remove Caddy config: ${error.message}`
        : "Failed to remove Caddy config"
    );
  }

  // Reload Caddy if needed
  if (caddyConfigRemoved) {
    try {
      const caddyInstalled = await isCaddyInstalled(connection);
      if (caddyInstalled) {
        const reloadResult = await reloadCaddy(connection);
        if (!reloadResult.success) {
          warnings.push(reloadResult.error || "Failed to reload Caddy");
        }
      }
    } catch (error) {
      warnings.push(
        error instanceof Error ? `Failed to reload Caddy: ${error.message}` : "Failed to reload Caddy"
      );
    }
  }

  console.log("");
  console.log(`✓ Destroyed app: ${appName}`);

  if (removedItems.length > 0) {
    console.log("");
    console.log("What was removed:");
    for (const item of removedItems) {
      console.log(`  - ${item}`);
    }
  }

  if (warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const warning of warnings) {
      console.log(`  - ${warning}`);
    }
  }
}
