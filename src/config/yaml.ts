import * as fs from 'node:fs';
import * as path from 'node:path';
import envPaths from 'env-paths';
import * as yaml from 'js-yaml';
import { validateCID } from '../utils/cid-validator.js';
import type {
  DpulseConfig,
  EnvironmentConfig,
  ServiceConfig,
} from './schema.js';

const DEFAULT_TIMEOUT = 5000;
const MAX_CID_LENGTH = 128;

function validateServiceConfig(service: unknown): ServiceConfig {
  if (typeof service !== 'object' || service === null) {
    throw new Error('Service config must be an object');
  }

  const s = service as Record<string, unknown>;

  if (typeof s.name !== 'string' || !s.name.trim()) {
    throw new Error("Service must have a non-empty 'name' string");
  }

  if (typeof s.displayName !== 'string' || !s.displayName.trim()) {
    throw new Error(
      `Service '${s.name}' must have a non-empty 'displayName' string`,
    );
  }

  if (typeof s.description !== 'string' || !s.description.trim()) {
    throw new Error(
      `Service '${s.name}' must have a non-empty 'description' string`,
    );
  }

  if (s.type !== 'http' && s.type !== 'command') {
    throw new Error(`Service '${s.name}' type must be 'http' or 'command'`);
  }

  const config: ServiceConfig = {
    name: s.name.trim(),
    displayName: s.displayName.trim(),
    description: s.description.trim(),
    type: s.type as 'http' | 'command',
  };

  if (s.type === 'http') {
    if (typeof s.url !== 'string' || !s.url.trim()) {
      throw new Error(`HTTP service '${s.name}' must have a non-empty 'url'`);
    }
    config.url = s.url.trim();
  }

  if (s.type === 'command') {
    if (typeof s.command !== 'string' || !s.command.trim()) {
      throw new Error(
        `Command service '${s.name}' must have a non-empty 'command'`,
      );
    }
    config.command = s.command.trim();
  }

  if (s.expect) {
    if (typeof s.expect !== 'object' || s.expect === null) {
      throw new Error(`Service '${s.name}' expect config must be an object`);
    }

    const e = s.expect as Record<string, unknown>;
    const expectConfig = {};

    if (e.status !== undefined) {
      if (typeof e.status !== 'number' || e.status < 100 || e.status > 599) {
        throw new Error(
          `Service '${s.name}' expect.status must be a valid HTTP status code`,
        );
      }
      Object.assign(expectConfig, { status: e.status });
    }

    if (e.body_contains !== undefined) {
      if (typeof e.body_contains !== 'string') {
        throw new Error(
          `Service '${s.name}' expect.body_contains must be a string`,
        );
      }
      Object.assign(expectConfig, { body_contains: e.body_contains });
    }

    if (e.output_contains !== undefined) {
      if (typeof e.output_contains !== 'string') {
        throw new Error(
          `Service '${s.name}' expect.output_contains must be a string`,
        );
      }
      Object.assign(expectConfig, { output_contains: e.output_contains });
    }

    if (Object.keys(expectConfig).length > 0) {
      config.expect = expectConfig;
    }
  }

  return config;
}

function validateDpulseConfig(data: unknown): DpulseConfig {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Config must be an object');
  }

  const d = data as Record<string, unknown>;

  const config: DpulseConfig = {
    environment: 'dev',
    environments: {},
    services: [],
  };

  if (d.timeout !== undefined) {
    if (typeof d.timeout !== 'number' || d.timeout < 0) {
      throw new Error('timeout must be a non-negative number');
    }
    config.timeout = d.timeout;
  }

  if (d.environment !== undefined) {
    if (typeof d.environment !== 'string' || !d.environment.trim()) {
      throw new Error('environment must be a non-empty string');
    }
    config.environment = d.environment.trim();
  }

  if (d.feedUrl !== undefined) {
    if (typeof d.feedUrl !== 'string' || !d.feedUrl.trim()) {
      throw new Error('feedUrl must be a non-empty string');
    }
    config.feedUrl = d.feedUrl.trim();
  }

  if (d.environments !== undefined) {
    if (typeof d.environments !== 'object' || d.environments === null) {
      throw new Error('environments must be an object');
    }

    const envsObj = d.environments as Record<string, unknown>;
    const envsConfig: Record<string, EnvironmentConfig> = {};

    for (const [key, value] of Object.entries(envsObj)) {
      if (typeof key !== 'string' || !key.trim()) {
        throw new Error('environment name must be a non-empty string');
      }

      if (typeof value !== 'object' || value === null) {
        throw new Error(`environment '${key}' must be an object`);
      }

      const env = value as Record<string, unknown>;

      if (typeof env.contentTopic !== 'string' || !env.contentTopic.trim()) {
        throw new Error(
          `environment '${key}' must have a non-empty 'contentTopic'`,
        );
      }

      const environmentConfig: EnvironmentConfig = {
        contentTopic: env.contentTopic.trim(),
      };

      if (env.feedContentTopic !== undefined) {
        if (
          typeof env.feedContentTopic !== 'string' ||
          !env.feedContentTopic.trim()
        ) {
          throw new Error(
            `environment '${key}' feedContentTopic must be a non-empty string`,
          );
        }
        environmentConfig.feedContentTopic = env.feedContentTopic.trim();
      }

      if (env.logLevel !== undefined) {
        if (
          env.logLevel !== 'debug' &&
          env.logLevel !== 'info' &&
          env.logLevel !== 'warn' &&
          env.logLevel !== 'error'
        ) {
          throw new Error(
            `environment '${key}' logLevel must be 'debug', 'info', 'warn', or 'error'`,
          );
        }
        environmentConfig.logLevel = env.logLevel as
          | 'debug'
          | 'info'
          | 'warn'
          | 'error';
      }

      envsConfig[key.trim()] = environmentConfig;
    }

    if (Object.keys(envsConfig).length > 0) {
      config.environments = envsConfig;
    }
  }

  if (d.iconCids !== undefined) {
    if (typeof d.iconCids !== 'object' || d.iconCids === null) {
      throw new Error('iconCids must be an object');
    }

    const iconCidsObj = d.iconCids as Record<string, unknown>;
    const iconCidsConfig: Record<string, string> = {};

    for (const [key, value] of Object.entries(iconCidsObj)) {
      if (typeof key !== 'string' || !key.trim()) {
        throw new Error(
          'iconCids keys must be non-empty strings (service names)',
        );
      }
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error(
          `iconCids['${key}'] must be a non-empty IPFS CID string`,
        );
      }
      const cid = value.trim();
      if (cid.length > MAX_CID_LENGTH) {
        throw new Error(
          `iconCids['${key}'] CID exceeds maximum length of ${MAX_CID_LENGTH} characters`,
        );
      }
      if (!validateCID(cid)) {
        throw new Error(`iconCids['${key}'] is not a valid IPFS CID format`);
      }
      iconCidsConfig[key.trim()] = cid;
    }

    if (Object.keys(iconCidsConfig).length > 0) {
      config.iconCids = iconCidsConfig;
    }
  }

  if (!d.services || !Array.isArray(d.services)) {
    throw new Error('services must be an array');
  }

  if (d.services.length === 0) {
    throw new Error('services array cannot be empty');
  }

  config.services = d.services.map((service, index) => {
    try {
      return validateServiceConfig(service);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Service at index ${index}: ${error.message}`);
      }
      throw error;
    }
  });

  const names = new Set<string>();
  for (const service of config.services) {
    if (names.has(service.name)) {
      throw new Error(`Duplicate service name: '${service.name}'`);
    }
    names.add(service.name);
  }

  if (config.iconCids) {
    for (const cidKey of Object.keys(config.iconCids)) {
      if (!names.has(cidKey)) {
        throw new Error(
          `iconCids contains entry for non-existent service '${cidKey}'`,
        );
      }
    }
  }

  return config;
}

function applyDefaults(config: DpulseConfig): Required<DpulseConfig> {
  return {
    timeout: config.timeout ?? DEFAULT_TIMEOUT,
    environment: config.environment ?? 'dev',
    feedUrl: config.feedUrl ?? '',
    environments: config.environments ?? {},
    services: config.services,
    iconCids: config.iconCids ?? {},
  };
}

export function loadDpulseConfigPath(): string {
  const paths = envPaths('dpulse', { suffix: '' });
  const configPath = path.join(paths.config, 'dpulse.yml');

  if (fs.existsSync(configPath)) {
    return configPath;
  }

  const localPath = path.join(process.cwd(), 'dpulse.yml');
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  return configPath;
}

export function ensureConfigDirectory(): void {
  const paths = envPaths('dpulse', { suffix: '' });
  const configDir = paths.config;

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

export function loadDpulseConfig(): DpulseConfig {
  let configPath: string;

  const paths = envPaths('dpulse', { suffix: '' });
  const systemConfigPath = path.join(paths.config, 'dpulse.yml');

  if (fs.existsSync(systemConfigPath)) {
    configPath = systemConfigPath;
  } else {
    configPath = path.join(process.cwd(), 'dpulse.yml');
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  const parsed = yaml.load(content);

  if (parsed === null || parsed === undefined) {
    throw new Error(`Config file '${configPath}' is empty`);
  }

  const validated = validateDpulseConfig(parsed);
  const defaulted = applyDefaults(validated) as DpulseConfig;

  return defaulted;
}

export function saveDpulseConfig(config: DpulseConfig, useLocal = false): void {
  let configPath: string;

  if (useLocal) {
    configPath = path.join(process.cwd(), 'dpulse.yml');
  } else {
    ensureConfigDirectory();
    const paths = envPaths('dpulse', { suffix: '' });
    configPath = path.join(paths.config, 'dpulse.yml');
  }

  const serialized = yaml.dump(config, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
  });

  fs.writeFileSync(configPath, serialized, 'utf-8');
}
