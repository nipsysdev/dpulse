import type { Config } from "../config/index.ts";

let config: Config = {
  environment: "dev",
  logLevel: "info",
  contentTopic: ""
};

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
} as const;

export function setConfig(cfg: Config): void {
  config = cfg;
}

export function debug(message: string): void {
  if (LOG_LEVELS[config.logLevel] <= LOG_LEVELS.debug) {
    console.log(`[DEBUG] ${message}`);
  }
}

export function info(message: string): void {
  if (LOG_LEVELS[config.logLevel] <= LOG_LEVELS.info) {
    console.log(`[INFO] ${message}`);
  }
}

export function warn(message: string): void {
  if (LOG_LEVELS[config.logLevel] <= LOG_LEVELS.warn) {
    console.warn(`[WARN] ${message}`);
  }
}

export function error(message: string): void {
  if (LOG_LEVELS[config.logLevel] <= LOG_LEVELS.error) {
    console.error(`[ERROR] ${message}`);
  }
}
