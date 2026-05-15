import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DpulseConfig } from '../../src/config/schema.js';
import {
  ensureConfigDirectory,
  loadDpulseConfig,
  loadDpulseConfigPath,
  saveDpulseConfig,
} from '../../src/config/yaml.js';

describe('YAML Configuration Loader', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dpulse-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Config directory structure', () => {
    it('should create config directory using env-paths', () => {
      expect(() => ensureConfigDirectory()).not.toThrow();
    });
  });

  describe('Config loading with defaults', () => {
    it('should apply default timeout when not specified', () => {
      const configContent = `
services:
  - name: test-http
    displayName: "Test HTTP"
    description: "A test HTTP service"
    type: http
    url: https://example.com
      `;

      fs.writeFileSync('dpulse.yml', configContent, 'utf-8');

      const config: DpulseConfig = loadDpulseConfig();

      expect(config.timeout).toBe(5000);
      expect(config.iconCids).toEqual({});
    });

    it('should load iconCids mapping service names to CIDs', () => {
      const configContent = `
iconCids:
  website: 'bafkreie7ohywtosou76tasm7j63yigtzxe7d5zqus4zu3j6oltvgtibeom'
  api: 'bafkreie7ohywtosou76tasm7j63yigtzxe7d5zqus4zu3j6oltvgtibeom'
services:
  - name: website
    displayName: "Website"
    description: "Website service"
    type: http
    url: https://example.com
  - name: api
    displayName: "API"
    description: "API service"
    type: http
    url: https://api.example.com
      `;

      fs.writeFileSync('dpulse.yml', configContent, 'utf-8');

      const config: DpulseConfig = loadDpulseConfig();

      expect(config.iconCids?.website).toBe(
        'bafkreie7ohywtosou76tasm7j63yigtzxe7d5zqus4zu3j6oltvgtibeom',
      );
      expect(config.iconCids?.api).toBe(
        'bafkreie7ohywtosou76tasm7j63yigtzxe7d5zqus4zu3j6oltvgtibeom',
      );
    });

    it('should allow iconCids to be optional', () => {
      const configContent = `
services:
  - name: test
    displayName: "Test"
    description: "Test service"
    type: http
    url: https://example.com
      `;

      fs.writeFileSync('dpulse.yml', configContent, 'utf-8');

      const config: DpulseConfig = loadDpulseConfig();

      expect(config.iconCids).toEqual({});
    });
  });

  describe('Fallback to local ./dpulse.yml', () => {
    it("should fallback to local dpulse.yml when system config doesn't exist", () => {
      const configContent = `
services:
  - name: local-service
    displayName: "Local Service"
    description: "Test fallback to local config"
    type: http
    url: https://localhost:3000
      `;

      fs.writeFileSync('dpulse.yml', configContent, 'utf-8');

      const configPath = loadDpulseConfigPath();
      expect(configPath).toContain('dpulse.yml');
      expect(configPath).not.toContain(path.join('.config', 'dpulse'));

      const config: DpulseConfig = loadDpulseConfig();
      expect(config.services).toHaveLength(1);
      expect(config.services[0].name).toBe('local-service');
    });
  });

  describe('HTTP service configuration', () => {
    it('should load valid HTTP service config', () => {
      const configContent = `
services:
  - name: web-server
    displayName: "Web Server"
    description: "Main web server"
    type: http
    url: https://api.example.com
    expect:
      status: 200
      body_contains: "healthy"
      `;

      fs.writeFileSync('dpulse.yml', configContent, 'utf-8');

      const config: DpulseConfig = loadDpulseConfig();

      expect(config.services).toHaveLength(1);
      const service = config.services[0];
      expect(service.name).toBe('web-server');
      expect(service.type).toBe('http');
      expect(service.url).toBe('https://api.example.com');
      expect(service.expect?.status).toBe(200);
      expect(service.expect?.body_contains).toBe('healthy');
    });
  });

  describe('Command service configuration', () => {
    it('should load valid command service config', () => {
      const configContent = `
services:
  - name: database
    displayName: "Database"
    description: "PostgreSQL database"
    type: command
    command: pg_isready -h localhost -p 5432
    expect:
      output_contains: "accepting connections"
      `;

      fs.writeFileSync('dpulse.yml', configContent, 'utf-8');

      const config: DpulseConfig = loadDpulseConfig();

      expect(config.services).toHaveLength(1);
      const service = config.services[0];
      expect(service.name).toBe('database');
      expect(service.type).toBe('command');
      expect(service.command).toBe('pg_isready -h localhost -p 5432');
      expect(service.expect?.output_contains).toBe('accepting connections');
    });
  });

  describe('Multiple services', () => {
    it('should load multiple services of different types', () => {
      const configContent = `
services:
  - name: api
    displayName: "API"
    description: "REST API"
    type: http
    url: https://api.example.com

  - name: cache
    displayName: "Redis Cache"
    description: "Redis server"
    type: command
    command: redis-cli ping

  - name: frontend
    displayName: "Frontend"
    description: "Web frontend"
    type: http
    url: https://example.com
      `;

      fs.writeFileSync('dpulse.yml', configContent, 'utf-8');

      const config: DpulseConfig = loadDpulseConfig();

      expect(config.services).toHaveLength(3);
      expect(config.services[0].type).toBe('http');
      expect(config.services[1].type).toBe('command');
      expect(config.services[2].type).toBe('http');
    });
  });

  describe('Error handling', () => {
    it('should reject config with duplicate service names', () => {
      const configContent = `
services:
  - name: duplicate
    displayName: "First"
    description: "First service"
    type: http
    url: https://example.com

  - name: duplicate
    displayName: "Second"
    description: "Second service"
    type: http
    url: https://example2.com
      `;

      fs.writeFileSync('dpulse.yml', configContent, 'utf-8');

      expect(() => loadDpulseConfig()).toThrow(
        "Duplicate service name: 'duplicate'",
      );
    });

    it('should reject HTTP service without url', () => {
      const configContent = `
services:
  - name: bad-http
    displayName: "Bad HTTP"
    description: "HTTP without url"
    type: http
      `;

      fs.writeFileSync('dpulse.yml', configContent, 'utf-8');

      expect(() => loadDpulseConfig()).toThrow("must have a non-empty 'url'");
    });

    it('should reject command service without command', () => {
      const configContent = `
services:
  - name: bad-command
    displayName: "Bad Command"
    description: "Command without command"
    type: command
      `;

      fs.writeFileSync('dpulse.yml', configContent, 'utf-8');

      expect(() => loadDpulseConfig()).toThrow(
        "must have a non-empty 'command'",
      );
    });

    it('should reject invalid service type', () => {
      const configContent = `
services:
  - name: bad-type
    displayName: "Bad Type"
    description: "Invalid type"
    type: websocket
    url: ws://localhost
      `;

      fs.writeFileSync('dpulse.yml', configContent, 'utf-8');

      expect(() => loadDpulseConfig()).toThrow(
        "type must be 'http' or 'command'",
      );
    });

    it('should reject invalid status code', () => {
      const configContent = `
services:
  - name: bad-status
    displayName: "Bad Status"
    description: "Invalid status"
    type: http
    url: https://example.com
    expect:
      status: 9999
      `;

      fs.writeFileSync('dpulse.yml', configContent, 'utf-8');

      expect(() => loadDpulseConfig()).toThrow(
        'expect.status must be a valid HTTP status code',
      );
    });

    it('should reject empty services array', () => {
      const configContent = `
services: []
      `;

      fs.writeFileSync('dpulse.yml', configContent, 'utf-8');

      expect(() => loadDpulseConfig()).toThrow(
        'services array cannot be empty',
      );
    });

    it('should reject negative timeout', () => {
      const configContent = `
timeout: -1000
services:
  - name: test
    displayName: "Test"
    description: "Test service"
    type: http
    url: https://example.com
      `;

      fs.writeFileSync('dpulse.yml', configContent, 'utf-8');

      expect(() => loadDpulseConfig()).toThrow(
        'timeout must be a non-negative number',
      );
    });

    it('should reject invalid iconCid value type', () => {
      const configContent = `
iconCids:
  website: 123
services:
  - name: website
    displayName: "Website"
    description: "Website service"
    type: http
    url: https://example.com
      `;

      fs.writeFileSync('dpulse.yml', configContent, 'utf-8');

      expect(() => loadDpulseConfig()).toThrow(
        "iconCids['website'] must be a non-empty IPFS CID string",
      );
    });

    it('should reject empty iconCid value', () => {
      const configContent = `
iconCids:
  website: ""
services:
  - name: website
    displayName: "Website"
    description: "Website service"
    type: http
    url: https://example.com
      `;

      fs.writeFileSync('dpulse.yml', configContent, 'utf-8');

      expect(() => loadDpulseConfig()).toThrow(
        "iconCids['website'] must be a non-empty IPFS CID string",
      );
    });

    it('should reject non-string iconCid keys', () => {
      const configContent = `
iconCids:
  "": 'bafkreie7ohywtosou76tasm7j63yigtzxe7d5zqus4zu3j6oltvgtibeom'
services:
  - name: test
    displayName: "Test"
    description: "Test service"
    type: http
    url: https://example.com
      `;

      fs.writeFileSync('dpulse.yml', configContent, 'utf-8');

      expect(() => loadDpulseConfig()).toThrow(
        'iconCids keys must be non-empty strings (service names)',
      );
    });
  });

  describe('Config saving', () => {
    it('should save config to local file', () => {
      const config: DpulseConfig = {
        timeout: 10000,
        services: [
          {
            name: 'test-service',
            displayName: 'Test Service',
            description: 'A test service',
            type: 'http',
            url: 'https://example.com',
          },
        ],
        iconCids: {
          'test-service': 'bafkreie7ohywtosou76tasm7j63yigtzxe7d5zqus4zu3j6oltvgtibeom',
        },
      };

      saveDpulseConfig(config, true);

      const savedPath = path.join(tempDir, 'dpulse.yml');
      expect(fs.existsSync(savedPath)).toBe(true);

      const loadedConfig: DpulseConfig = loadDpulseConfig();
      expect(loadedConfig.timeout).toBe(10000);
      expect(loadedConfig.services[0].name).toBe('test-service');
      expect(loadedConfig.iconCids?.['test-service']).toBe(
        'bafkreie7ohywtosou76tasm7j63yigtzxe7d5zqus4zu3j6oltvgtibeom',
      );
    });

    it('should create directory when saving to system config', () => {
      const config: DpulseConfig = {
        services: [
          {
            name: 'test',
            displayName: 'Test',
            description: 'Test service',
            type: 'http',
            url: 'https://example.com',
          },
        ],
      };

      const testEnvPaths = process.env.XDG_CONFIG_HOME;
      process.env.XDG_CONFIG_HOME = tempDir;

      try {
        expect(() => saveDpulseConfig(config, false)).not.toThrow();
      } finally {
        if (testEnvPaths !== undefined) {
          process.env.XDG_CONFIG_HOME = testEnvPaths;
        } else {
          delete process.env.XDG_CONFIG_HOME;
        }
      }
    });
  });
});
