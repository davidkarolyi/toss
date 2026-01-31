import * as readline from "node:readline";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseServerString, type TossConfig } from "../config.ts";
import { testConnection } from "../ssh.ts";
import {
  provisionServer,
  verifyElevatedAccess,
  isAlreadyProvisioned,
  detectGitOrigin,
} from "../provisioning.ts";
import { readState } from "../state.ts";

/**
 * Creates a readline interface for interactive input
 */
function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompts for input with validation
 */
async function prompt(
  readlineInterface: readline.Interface,
  question: string,
  options: {
    required?: boolean;
    validate?: (value: string) => string | null;
    defaultValue?: string;
  } = {}
): Promise<string> {
  const { required = false, validate, defaultValue } = options;

  return new Promise((resolve) => {
    const questionWithDefault = defaultValue
      ? `${question} [${defaultValue}]: `
      : `${question}: `;

    const askQuestion = (): void => {
      readlineInterface.question(questionWithDefault, (answer) => {
        const trimmedAnswer = answer.trim();
        const value = trimmedAnswer || defaultValue || "";

        if (required && !value) {
          console.log("  This field is required.");
          askQuestion();
          return;
        }

        if (validate && value) {
          const error = validate(value);
          if (error) {
            console.log(`  ${error}`);
            askQuestion();
            return;
          }
        }

        resolve(value);
      });
    };

    askQuestion();
  });
}

/**
 * Prompts for yes/no confirmation
 */
async function confirm(
  readlineInterface: readline.Interface,
  question: string,
  defaultValue: boolean = false
): Promise<boolean> {
  return new Promise((resolve) => {
    const hint = defaultValue ? "[Y/n]" : "[y/N]";
    readlineInterface.question(`${question} ${hint}: `, (answer) => {
      const normalizedAnswer = answer.trim().toLowerCase();
      if (normalizedAnswer === "") {
        resolve(defaultValue);
      } else {
        resolve(normalizedAnswer === "y" || normalizedAnswer === "yes");
      }
    });
  });
}

/**
 * Validates server string format
 */
function validateServer(server: string): string | null {
  try {
    parseServerString(server);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid server format";
  }
}

/**
 * Validates app name format
 */
function validateAppName(appName: string): string | null {
  if (!/^[a-z][a-z0-9-]*$/.test(appName)) {
    return "App name must start with a letter and contain only lowercase letters, numbers, and hyphens";
  }
  if (appName.length > 63) {
    return "App name must be at most 63 characters";
  }
  return null;
}

/**
 * Validates domain format (basic check)
 */
function validateDomain(domain: string): string | null {
  // Basic domain validation - must have at least one dot and valid characters
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(domain)) {
    return "Invalid domain format. Example: myapp.com";
  }
  return null;
}

/**
 * Parses deploy script input into an array of commands
 * Supports:
 * - Single line with && separators: "npm ci && npm run build"
 * - Multi-line input (for future readline multi-line support)
 */
function parseDeployScript(input: string): string[] {
  // Split by && and trim each command
  const commands = input
    .split("&&")
    .map((command) => command.trim())
    .filter((command) => command.length > 0);

  return commands;
}

/**
 * Generates GitHub Actions workflow content
 */
function generateGitHubActionsWorkflow(
  domain: string | undefined,
  serverHost: string,
  appName: string
): string {
  // For preview URL comments, use domain if available, otherwise construct sslip.io URL pattern
  const previewUrlPattern = domain
    ? `https://pr-\${{ github.event.pull_request.number }}.${appName}.${domain}`
    : `https://pr-\${{ github.event.pull_request.number }}.${appName}.${serverHost.replace(/\./g, "-")}.sslip.io`;

  return `name: Deploy

on:
  push:
    branches: [main]
  pull_request:
  pull_request_target:
    types: [closed]

jobs:
  deploy:
    if: github.event.action != 'closed'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup SSH
        run: |
          mkdir -p ~/.ssh
          echo "\${{ secrets.SSH_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          ssh-keyscan \${{ secrets.SSH_HOST }} >> ~/.ssh/known_hosts

      - name: Install toss
        run: curl -fsSL https://toss.dev/install.sh | sh

      - name: Deploy
        run: |
          if [ "\${{ github.event_name }}" = "pull_request" ]; then
            toss deploy pr-\${{ github.event.pull_request.number }}
          else
            toss deploy prod
          fi

      - name: Comment preview URL
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '🚀 Preview: ${previewUrlPattern}'
            })

  cleanup:
    if: github.event.action == 'closed'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup SSH
        run: |
          mkdir -p ~/.ssh
          echo "\${{ secrets.SSH_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          ssh-keyscan \${{ secrets.SSH_HOST }} >> ~/.ssh/known_hosts

      - name: Install toss
        run: curl -fsSL https://toss.dev/install.sh | sh

      - name: Remove preview
        run: toss remove pr-\${{ github.event.pull_request.number }}
`;
}

/**
 * Prints the header banner
 */
function printHeader(): void {
  console.log("");
  console.log("┌─────────────────────────────────────┐");
  console.log("│  toss - deploy apps to your VPS    │");
  console.log("└─────────────────────────────────────┘");
  console.log("");
}

/**
 * Prints a section divider
 */
function printSection(title: string): void {
  console.log("");
  console.log("──────────────────────────────────────");
  console.log(title);
  console.log("──────────────────────────────────────");
  console.log("");
}

/**
 * Main init command handler
 */
export async function initCommand(_args: string[]): Promise<void> {
  const readlineInterface = createReadlineInterface();

  try {
    printHeader();

    // Check if toss.json already exists
    const configPath = join(process.cwd(), "toss.json");
    if (existsSync(configPath)) {
      console.log("A toss.json file already exists in this directory.");
      const overwrite = await confirm(readlineInterface, "Do you want to overwrite it?", false);
      if (!overwrite) {
        console.log("Aborted.");
        return;
      }
      console.log("");
    }

    // Step 1: Server connection
    console.log("Let's set up your deployment server.");
    console.log("Enter the SSH connection string (e.g., root@64.23.123.45 or root@64.23.123.45:2222)");
    console.log("");

    const server = await prompt(readlineInterface, "Server (user@host)", {
      required: true,
      validate: validateServer,
    });

    const connection = parseServerString(server);

    // Test SSH connection
    process.stdout.write("Testing connection... ");
    try {
      await testConnection(connection);
      console.log("✓");
    } catch (error) {
      console.log("✗");
      console.log("");
      if (error instanceof Error) {
        console.log(error.message);
      } else {
        console.log("SSH connection failed.");
      }
      return;
    }

    // Verify elevated access
    process.stdout.write("Verifying elevated access... ");
    const accessResult = await verifyElevatedAccess(connection);
    if (!accessResult.success) {
      console.log("✗");
      console.log("");
      console.log(accessResult.error);
      return;
    }
    console.log("✓");
    console.log("");

    // Step 2: App name
    console.log("Choose a name for your app. This will be used for:");
    console.log("  - Server directories (/srv/<app>/...)");
    console.log("  - Service names (toss-<app>-prod)");
    console.log("");

    const appName = await prompt(readlineInterface, "App name", {
      required: true,
      validate: validateAppName,
    });

    // Check for app name conflict on server
    const alreadyProvisioned = await isAlreadyProvisioned(connection, appName);
    if (alreadyProvisioned) {
      // Check if it's from the same project
      const localOrigin = await detectGitOrigin();
      const serverState = await readState(connection, appName);

      if (serverState.origin && localOrigin) {
        // Both have origins - need to check if they match
        const normalizedServerOrigin = normalizeOrigin(serverState.origin);
        const normalizedLocalOrigin = normalizeOrigin(localOrigin);

        if (normalizedServerOrigin !== normalizedLocalOrigin) {
          console.log("");
          console.log(`⚠ An app named '${appName}' already exists on this server from a different project.`);
          console.log(`  Server origin: ${serverState.origin}`);
          console.log(`  Local origin:  ${localOrigin}`);
          console.log("");
          console.log("Please choose a different app name or remove the existing deployment first.");
          return;
        }
      }

      // Same project or no conflict - inform user and continue
      console.log("");
      console.log(`ℹ An app named '${appName}' already exists on this server.`);
      console.log("  Continuing will update the existing configuration.");
      const continueSetup = await confirm(readlineInterface, "Continue?", true);
      if (!continueSetup) {
        console.log("Aborted.");
        return;
      }
    }
    console.log("");

    // Step 3: Domain (optional)
    console.log("Enter your domain if you have one (e.g., myapp.com).");
    console.log("Leave empty to use sslip.io for automatic DNS.");
    console.log("");

    const domain = await prompt(readlineInterface, "Domain (optional)", {
      required: false,
      validate: (value) => (value ? validateDomain(value) : null),
    });
    console.log("");

    // Step 4: Start command
    console.log("How do you start your app? This command will be used in the systemd service.");
    console.log("Examples: npm start, bun run start, node server.js");
    console.log("");

    const startCommand = await prompt(readlineInterface, "Start command", {
      required: true,
    });
    console.log("");

    // Step 5: Deploy script
    console.log("What commands should run on every deploy?");
    console.log("Enter commands separated by &&. Example: npm ci && npm run build");
    console.log("");

    const deployScriptInput = await prompt(readlineInterface, "Deploy commands", {
      required: true,
    });
    const deployScript = parseDeployScript(deployScriptInput);
    console.log("");

    // Step 6: GitHub Actions (optional)
    console.log("Would you like to set up GitHub Actions for automated deployments?");
    console.log("This will create a workflow file at .github/workflows/toss.yml");
    console.log("");

    const setupGitHubActions = await confirm(readlineInterface, "Setup GitHub Actions?", true);
    console.log("");

    // Server provisioning
    printSection("Setting up VPS...");

    const gitOrigin = await detectGitOrigin();

    process.stdout.write("→ Installing Caddy (if needed)...\n");
    process.stdout.write("→ Creating directories...\n");
    process.stdout.write("→ Initializing state...\n");

    const provisionResult = await provisionServer(connection, {
      appName,
      gitOrigin,
    });

    if (!provisionResult.success) {
      console.log("");
      console.log(`✗ Server provisioning failed: ${provisionResult.error}`);
      return;
    }

    console.log("✓ Server setup complete");

    // Create local files
    printSection("Creating local files...");

    // Write toss.json
    const config: TossConfig = {
      app: appName,
      server,
      startCommand,
      deployScript,
    };

    if (domain) {
      config.domain = domain;
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    console.log("Created toss.json");

    // Write GitHub Actions workflow if requested
    if (setupGitHubActions) {
      const workflowDir = join(process.cwd(), ".github", "workflows");
      const workflowPath = join(workflowDir, "toss.yml");

      mkdirSync(workflowDir, { recursive: true });
      writeFileSync(
        workflowPath,
        generateGitHubActionsWorkflow(domain, connection.host, appName)
      );
      console.log("Created .github/workflows/toss.yml");
    }

    // Print final instructions
    printSection("Almost done!");

    let stepNumber = 1;

    // DNS instructions (only if domain is set)
    if (domain) {
      console.log(`${stepNumber}. Add DNS records:`);
      console.log(`   A  *.${appName}.${domain}  → ${connection.host}`);
      console.log(`   Example prod:    prod.${appName}.${domain}`);
      console.log(`   Example preview: pr-42.${appName}.${domain}`);
      console.log("");
      stepNumber++;
    }

    // GitHub secrets instructions (if GitHub Actions was set up)
    if (setupGitHubActions) {
      console.log(`${stepNumber}. Add GitHub secrets (Settings → Secrets → Actions):`);
      console.log(`   SSH_HOST     ${connection.host}`);
      console.log(`   SSH_USER     ${connection.user}`);
      console.log("   SSH_KEY      (contents of ~/.ssh/id_ed25519)");
      console.log("");
      stepNumber++;
    }

    // Push secrets instruction
    console.log(`${stepNumber}. Push your secrets:`);
    console.log("   toss secrets push prod --file .env.local");
    console.log("   toss secrets push preview --file .env.local");
    console.log("");
    stepNumber++;

    // Deploy instruction
    console.log(`${stepNumber}. Deploy:`);
    console.log("   toss deploy prod");
    console.log("");

    console.log("Happy deploying! 🚀");
  } finally {
    readlineInterface.close();
  }
}

/**
 * Normalizes a git origin URL for comparison
 */
function normalizeOrigin(origin: string): string {
  let normalized = origin.trim().toLowerCase();

  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, "");

  // Remove trailing .git
  normalized = normalized.replace(/\.git$/, "");

  // Convert SSH format: git@github.com:user/repo -> github.com/user/repo
  const sshMatch = normalized.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    normalized = `${sshMatch[1]}/${sshMatch[2]}`;
  }

  // Convert HTTPS: https://github.com/user/repo -> github.com/user/repo
  const httpsMatch = normalized.match(/^https?:\/\/([^/]+)\/(.+)$/);
  if (httpsMatch) {
    normalized = `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  return normalized;
}
