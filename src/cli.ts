import { initCommand } from "./commands/init.ts";
import { deployCommand } from "./commands/deploy.ts";
import { removeCommand } from "./commands/remove.ts";
import { listCommand } from "./commands/list.ts";
import { statusCommand } from "./commands/status.ts";
import { logsCommand } from "./commands/logs.ts";
import { sshCommand } from "./commands/ssh.ts";
import { secretsCommand } from "./commands/secrets.ts";
import { rollbackCommand } from "./commands/rollback.ts";

const VERSION = "0.1.0";

interface CommandHandler {
  (args: string[]): Promise<void>;
}

const commands: Record<string, CommandHandler> = {
  init: initCommand,
  deploy: deployCommand,
  remove: removeCommand,
  list: listCommand,
  status: statusCommand,
  logs: logsCommand,
  ssh: sshCommand,
  secrets: secretsCommand,
  rollback: rollbackCommand,
};

function printHelp(): void {
  console.log(`toss - deploy apps to your VPS

Usage: toss <command> [options]

Commands:
  init                    Interactive setup wizard
  deploy <env>            Deploy to environment (e.g., prod, pr-42)
  rollback <env> [release] Roll back to a previous release
  remove <env>            Remove an environment
  list                    List running deployments
  status                  Status summary
  logs <env>              Tail logs for environment
  ssh <env>               SSH into server
  secrets push <env>      Push secrets to VPS
  secrets pull <env>      Pull secrets from VPS

Options:
  -h, --help              Show this help message
  -v, --version           Show version number

Examples:
  toss init               Set up a new project
  toss deploy prod        Deploy to prod
  toss deploy pr-42       Deploy a preview environment
  toss rollback prod      Roll back to previous release
  toss logs prod          Stream prod logs
`);
}

function printVersion(): void {
  console.log(`toss v${VERSION}`);
}

export async function run(): Promise<void> {
  const args = Bun.argv.slice(2);
  const firstArg = args[0];

  if (!firstArg) {
    printHelp();
    process.exit(0);
  }

  if (firstArg === "-h" || firstArg === "--help") {
    printHelp();
    process.exit(0);
  }

  if (firstArg === "-v" || firstArg === "--version") {
    printVersion();
    process.exit(0);
  }

  const commandName = firstArg;
  const commandArgs = args.slice(1);

  const handler = commands[commandName];

  if (!handler) {
    console.error(`Unknown command: ${commandName}`);
    console.error(`Run 'toss --help' for usage information.`);
    process.exit(1);
  }

  try {
    await handler(commandArgs);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("An unexpected error occurred");
    }
    process.exit(1);
  }
}
