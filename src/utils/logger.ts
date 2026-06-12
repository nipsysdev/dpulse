import pino from 'pino';
import type { Config } from '../config/index.js';

let config: Config = {
  environment: 'dev',
  logLevel: 'info',
  contentTopic: '',
  services: [],
  timeout: 5000,
  iconCids: {},
};

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

let pinoLogger: ReturnType<typeof pino> | null = null;

function getLogger(): ReturnType<typeof pino> {
  if (!pinoLogger) {
    const isDevelopment =
      config.environment === 'dev' || process.env.NODE_ENV === 'development';

    const pinoConfig = {
      level: config.logLevel,
      timestamp: pino.stdTimeFunctions.isoTime,
      ...(isDevelopment && {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
            singleLine: false,
            messageFormat: '{msg}',
            errorProps: 'err',
          },
        },
      }),
    };

    pinoLogger = pino(pinoConfig);
  }
  return pinoLogger;
}

const logger = {
  setConfig: (cfg: Config): void => {
    config = cfg;
    pinoLogger = null;
  },

  debug: (message: string, data?: Record<string, unknown>): void => {
    if (LOG_LEVELS[config.logLevel] <= LOG_LEVELS.debug) {
      if (data) {
        getLogger().debug(data, message);
      } else {
        getLogger().debug(message);
      }
    }
  },

  info: (message: string, data?: Record<string, unknown>): void => {
    if (LOG_LEVELS[config.logLevel] <= LOG_LEVELS.info) {
      if (config.logLevel === 'debug' && data) {
        getLogger().info(data, message);
      } else {
        getLogger().info(message);
      }
    }
  },

  warn: (message: string, data?: Record<string, unknown>): void => {
    if (LOG_LEVELS[config.logLevel] <= LOG_LEVELS.warn) {
      if (config.logLevel === 'debug' && data) {
        getLogger().warn(data, message);
      } else {
        getLogger().warn(message);
      }
    }
  },

  error: (message: string, data?: Record<string, unknown>): void => {
    if (LOG_LEVELS[config.logLevel] <= LOG_LEVELS.error) {
      if (data) {
        if (config.logLevel === 'debug') {
          getLogger().error(data, message);
        } else {
          const errorData = {
            error: (data as Record<string, unknown>).error,
            errorType: (data as Record<string, unknown>).errorType,
            errorCode: (data as Record<string, unknown>).errorCode,
          };
          getLogger().error(errorData, message);
        }
      } else {
        getLogger().error(message);
      }
    }
  },

  success: (message: string, data?: Record<string, unknown>): void => {
    if (data && config.logLevel === 'debug') {
      getLogger().info(data, `✓ ${message}`);
    } else {
      getLogger().info(`✓ ${message}`);
    }
  },

  status: (message: string): void => {
    getLogger().info(message);
  },

  fail: (message: string): void => {
    getLogger().error(`✗ ${message}`);
  },

  summary: (title: string, items: Record<string, string | number>): void => {
    getLogger().info(`\n=== ${title} ===`);
    for (const [key, value] of Object.entries(items)) {
      getLogger().info(`${key.padEnd(12)}${value}`);
    }
  },
};

export default logger;
