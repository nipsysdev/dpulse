import { Command } from 'commander';
import { checkCommand } from '../commands/check.js';
import { configCommand } from '../commands/config.js';
import { feedCommand } from '../commands/feed.js';
import keysCommand from '../commands/keys.js';

const program = new Command();

program
  .name('dpulse')
  .version('0.1.0')
  .description('Distributed pulse messaging CLI');

program.addCommand(configCommand);
program.addCommand(checkCommand);
program.addCommand(keysCommand);
program.addCommand(feedCommand);

program.parse();
