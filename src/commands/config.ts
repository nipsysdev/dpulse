import { Command } from 'commander';
import { loadConfig } from '../config/index.ts';
import * as logger from '../utils/logger.ts';

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

      console.log('Current Configuration:');
      console.log('=====================');
      console.log(`Environment: ${config.environment}`);
      console.log(`Log Level:   ${config.logLevel}`);
      console.log(`Content Topic: ${config.contentTopic}`);
    } catch (error) {
      console.error(`Error loading configuration: ${(error as Error).message}`);
      console.log(
        '\nSuggestion: Copy dpulse.yml.example to dpulse.yml and configure your services',
      );
      process.exit(1);
    }
  });

configCommand.addCommand(showCommand);
