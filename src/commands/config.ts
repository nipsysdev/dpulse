import { Command } from "commander";
import * as fs from "node:fs/promises";
import { loadConfig } from "../config/index.ts";
import * as logger from "../utils/logger.ts";

const ENV_EXAMPLE_CONTENT = `# Environment Configuration
ENVIRONMENT=dev                 # dev or prod
LOG_LEVEL=info                  # debug, info, warn, error

# Content Topics (configure in .env.\${ENVIRONMENT})
Content topic will be loaded from .env.\${ENVIRONMENT} file

# Example .env.dev:
# CONTENT_TOPIC="/nipsys/dpulse/1.0.0/dev/proto"

# Example .env.prod:
# CONTENT_TOPIC="/nipsys/dpulse/1.0.0/prod/proto"
`;

const ENV_DEV_CONTENT = `CONTENT_TOPIC="/nipsys/dpulse/1.0.0/dev/proto"
`;

const ENV_PROD_CONTENT = `CONTENT_TOPIC="/nipsys/dpulse/1.0.0/prod/proto"
`;

async function createFileIfMissing(filePath: string, content: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return false;
  } catch {
    await fs.writeFile(filePath, content);
    return true;
  }
}

export const configCommand = new Command("config")
  .description("Manage configuration")
  .action(() => {
    configCommand.help();
  });

const initCommand = new Command("init")
  .description("Initialize config (creates .env.example and .env files if missing)")
  .action(async () => {
    const files = [
      { path: ".env.example", content: ENV_EXAMPLE_CONTENT, desc: "example config" },
      { path: ".env.dev", content: ENV_DEV_CONTENT, desc: "dev environment config" },
      { path: ".env.prod", content: ENV_PROD_CONTENT, desc: "prod environment config" }
    ];

    console.log("Checking config files...");

    let created = 0;
    let existing = 0;

    for (const file of files) {
      const wasCreated = await createFileIfMissing(file.path, file.content);
      if (wasCreated) {
        console.log(`✓ Created ${file.path} (${file.desc})`);
        created++;
      } else {
        console.log(`  ${file.path} already exists`);
        existing++;
      }
    }

    console.log(`\nConfig setup complete: ${created} created, ${existing} already exist`);
    console.log("\nNext steps:");
    console.log("1. Edit .env to set your preferred environment (dev or prod)");
    console.log("2. Edit .env.dev or .env.prod to set CONTENT_TOPIC");
    console.log("3. Run 'dpulse config show' to verify configuration");
  });

const showCommand = new Command("show")
  .description("Display current configuration")
  .action(async () => {
    try {
      const config = await loadConfig();
      logger.setConfig(config);

      console.log("Current Configuration:");
      console.log("=====================");
      console.log(`Environment: ${config.environment}`);
      console.log(`Log Level:   ${config.logLevel}`);
      console.log(`Content Topic: ${config.contentTopic}`);
    } catch (error) {
      console.error(`Error loading configuration: ${(error as Error).message}`);
      console.log("\nSuggestion: Run 'dpulse config init' to create config files");
      process.exit(1);
    }
  });

configCommand.addCommand(initCommand);
configCommand.addCommand(showCommand);
