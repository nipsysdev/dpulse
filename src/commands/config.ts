import { Command } from 'commander';
import { loadConfig } from '../config/index.js';
import logger from '../utils/logger.js';

export const configCommand = new Command('config')
  .description('Manage configuration')
  .action(() => {
    configCommand.help();
  });

const showCommand = new Command('show')
  .description('Display current configuration')
  .action(async () => {
    try {
      const config = await loadConfig();
      logger.setConfig(config);

      logger.status('Current Configuration:');
      logger.status('=====================');
      logger.status(`Environment: ${config.environment}`);
      logger.status(`Log Level:   ${config.logLevel}`);
      logger.status(`Content Topic: ${config.contentTopic}`);
    } catch (error) {
      logger.fail(`Error loading configuration: ${(error as Error).message}`);
      logger.status(
        '\nSuggestion: Copy dpulse.yml.example to dpulse.yml and configure your services',
      );
      process.exit(1);
    }
  });

configCommand.addCommand(showCommand);
