export * from './schema.js';
export * from './yaml.js';

import type { ServiceConfig } from './schema.js';

export interface Config {
  environment: string;
  contentTopic: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  services: ServiceConfig[];
  timeout: number;
  iconCids: Record<string, string>;
}

export interface ConfigOverrides {
  env?: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  contentTopic?: string;
}

export async function loadConfig(
  overrides: ConfigOverrides = {},
): Promise<Config> {
  const { loadDpulseConfig } = await import('./yaml.js');
  const dpulseConfig = loadDpulseConfig();

  const environment = overrides.env ?? dpulseConfig.environment ?? 'dev';

  const envConfig = dpulseConfig.environments?.[environment];
  if (!envConfig) {
    throw new Error(
      `Environment '${environment}' not found in dpulse.yml. Available environments: ${Object.keys(dpulseConfig.environments ?? {}).join(', ') || 'none'}`,
    );
  }

  const contentTopic = overrides.contentTopic ?? envConfig.contentTopic;
  if (!contentTopic) {
    throw new Error(
      `contentTopic is not set for environment '${environment}' in dpulse.yml`,
    );
  }

  const logLevel = overrides.logLevel ?? envConfig.logLevel ?? 'info';
  const validLogLevels = ['debug', 'info', 'warn', 'error'];

  if (!validLogLevels.includes(logLevel)) {
    throw new Error(
      `Invalid logLevel: ${logLevel}. Must be one of: ${validLogLevels.join(', ')}.`,
    );
  }

  return {
    environment,
    contentTopic,
    logLevel,
    services: dpulseConfig.services,
    timeout: dpulseConfig.timeout ?? 5000,
    iconCids: dpulseConfig.iconCids ?? {},
  };
}
