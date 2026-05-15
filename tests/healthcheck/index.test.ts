import { describe, expect, it } from 'vitest';
import type { DpulseConfig } from '../../src/config/schema.js';
import {
  runAllChecks,
  runChecksForService,
} from '../../src/healthcheck/index.js';

describe('Healthcheck Orchestrator', () => {
  describe('runAllChecks', () => {
    it('should run HTTP check and return result', async () => {
      const config: DpulseConfig = {
        timeout: 5000,
        services: [
          {
            name: 'httpbin',
            displayName: 'HTTPBin',
            description: 'HTTP testing service',
            type: 'http',
            url: 'https://httpbin.org/status/200',
          },
        ],
      };

      const results = await runAllChecks(config);

      expect(results).toHaveLength(1);
      expect(results[0].serviceName).toBe('httpbin');
      expect(results[0].displayName).toBe('HTTPBin');
      expect(results[0].description).toBe('HTTP testing service');
      expect(results[0].status).toBe(0);
    }, 15000);

    it('should run command check and return result', async () => {
      const config: DpulseConfig = {
        timeout: 5000,
        services: [
          {
            name: 'echo-test',
            displayName: 'Echo Test',
            description: 'Echo command test',
            type: 'command',
            command: 'echo hello',
          },
        ],
      };

      const results = await runAllChecks(config);

      expect(results).toHaveLength(1);
      expect(results[0].serviceName).toBe('echo-test');
      expect(results[0].status).toBe(0);
    });

    it('should run multiple checks in parallel', async () => {
      const config: DpulseConfig = {
        timeout: 5000,
        services: [
          {
            name: 'echo1',
            displayName: 'Echo 1',
            description: 'First echo',
            type: 'command',
            command: 'echo one',
          },
          {
            name: 'echo2',
            displayName: 'Echo 2',
            description: 'Second echo',
            type: 'command',
            command: 'echo two',
          },
        ],
      };

      const results = await runAllChecks(config);

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.serviceName)).toContain('echo1');
      expect(results.map((r) => r.serviceName)).toContain('echo2');
    });

    it('should return down for failed HTTP check', async () => {
      const config: DpulseConfig = {
        timeout: 5000,
        services: [
          {
            name: 'failing-http',
            displayName: 'Failing HTTP',
            description: 'Will return 500',
            type: 'http',
            url: 'https://httpbin.org/status/500',
          },
        ],
      };

      const results = await runAllChecks(config);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe(2);
    }, 15000);

    it('should return down for failed command check', async () => {
      const config: DpulseConfig = {
        timeout: 5000,
        services: [
          {
            name: 'failing-cmd',
            displayName: 'Failing Command',
            description: 'Will exit 1',
            type: 'command',
            command: 'exit 1',
          },
        ],
      };

      const results = await runAllChecks(config);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe(2);
    });

    it('should throw for unknown service type', async () => {
      const config: DpulseConfig = {
        timeout: 5000,
        services: [
          {
            name: 'bad-service',
            displayName: 'Bad Service',
            description: 'Invalid type',
            type: 'http',
            url: 'https://example.com',
          } as any,
        ],
      };

      config.services[0].type = 'unknown' as any;

      await expect(runAllChecks(config)).rejects.toThrow(
        'Unknown service type: unknown',
      );
    });
  });

  describe('runChecksForService', () => {
    it('should find and run check for specific service', async () => {
      const config: DpulseConfig = {
        timeout: 5000,
        services: [
          {
            name: 'target',
            displayName: 'Target Service',
            description: 'Service to check',
            type: 'command',
            command: 'echo found',
          },
          {
            name: 'other',
            displayName: 'Other Service',
            description: 'Another service',
            type: 'command',
            command: 'echo other',
          },
        ],
      };

      const result = await runChecksForService(config, 'target');

      expect(result).not.toBeNull();
      expect(result?.serviceName).toBe('target');
    });

    it('should return null when service name is not found', async () => {
      const config: DpulseConfig = {
        timeout: 5000,
        services: [
          {
            name: 'existing',
            displayName: 'Existing',
            description: 'Existing service',
            type: 'command',
            command: 'echo test',
          },
        ],
      };

      const result = await runChecksForService(config, 'nonexistent');

      expect(result).toBeNull();
    });

    it('should use default timeout of 5000ms when not specified', async () => {
      const config: DpulseConfig = {
        services: [
          {
            name: 'service',
            displayName: 'Service',
            description: 'Test service',
            type: 'command',
            command: 'echo test',
          },
        ],
      };

      const result = await runChecksForService(config, 'service');

      expect(result).not.toBeNull();
      expect(result?.serviceName).toBe('service');
    });

    it('should throw error for unknown service type', async () => {
      const config: DpulseConfig = {
        timeout: 5000,
        services: [
          {
            name: 'bad-service',
            displayName: 'Bad Service',
            description: 'Invalid type',
            type: 'http',
            url: 'https://example.com',
          } as any,
        ],
      };

      config.services[0].type = 'unknown' as any;

      await expect(runChecksForService(config, 'bad-service')).rejects.toThrow(
        'Unknown service type: unknown',
      );
    });
  });
});
