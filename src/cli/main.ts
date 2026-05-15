import { Command } from 'commander';
import { checkCommand } from '../commands/check.ts';
import { configCommand } from '../commands/config.ts';
import keysCommand from '../commands/keys.ts';

const program = new Command();

program
  .name('dpulse')
  .version('0.1.0')
  .description('Distributed pulse messaging CLI');

program.addCommand(configCommand);
program.addCommand(checkCommand);
program.addCommand(keysCommand);

program.parse();
