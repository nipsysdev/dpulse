#!/usr/bin/env node

import { Command } from "commander";
import { configCommand } from "../commands/config.ts";
import { statusCommand, peersCommand } from "../commands/waku.ts";
import { sendCommand } from "../commands/send.ts";
import keysCommand from "../commands/keys.ts";

const program = new Command();

program
  .name("dpulse")
  .version("0.1.0")
  .description("Distributed pulse messaging CLI");

program.addCommand(configCommand);

const wakuCommand = new Command("waku")
  .description("Waku network commands");

wakuCommand.addCommand(statusCommand);
wakuCommand.addCommand(peersCommand);
program.addCommand(wakuCommand);

program.addCommand(sendCommand);
program.addCommand(keysCommand);

program.parse();
