import { describe, expect, it } from 'vitest';
import { runCommandCheck } from '../../src/healthcheck/command';

const HEALTH_STATUS = {
  HEALTHY: 0,
  DEGRADED: 1,
  DOWN: 2,
} as const;

describe('runCommandCheck', () => {
  it('should return healthy for successful command', async () => {
    const service = {
      name: 'test-service',
      displayName: 'Test Service',
      description: 'A test service',
      type: 'command' as const,
      command: 'echo hello',
    };

    const result = await runCommandCheck(service, 5000);

    expect(result.serviceName).toBe('test-service');
    expect(result.displayName).toBe('Test Service');
    expect(result.description).toBe('A test service');
    expect(result.status).toBe(HEALTH_STATUS.HEALTHY);
  });

  it('should return down for command with non-zero exit code', async () => {
    const service = {
      name: 'test-service',
      displayName: 'Test Service',
      description: 'A test service',
      type: 'command' as const,
      command: 'exit 1',
    };

    const result = await runCommandCheck(service, 5000);

    expect(result.status).toBe(HEALTH_STATUS.DOWN);
  });

  it("should return down if output doesn't contain expected string", async () => {
    const service = {
      name: 'test-service',
      displayName: 'Test Service',
      description: 'A test service',
      type: 'command' as const,
      command: 'echo world',
      expect: {
        output_contains: 'hello',
      },
    };

    const result = await runCommandCheck(service, 5000);

    expect(result.status).toBe(HEALTH_STATUS.DOWN);
  });

  it('should return healthy if output contains expected string', async () => {
    const service = {
      name: 'test-service',
      displayName: 'Test Service',
      description: 'A test service',
      type: 'command' as const,
      command: 'echo hello world',
      expect: {
        output_contains: 'hello',
      },
    };

    const result = await runCommandCheck(service, 5000);

    expect(result.status).toBe(HEALTH_STATUS.HEALTHY);
  });

  it('should return down on command error', async () => {
    const service = {
      name: 'test-service',
      displayName: 'Test Service',
      description: 'A test service',
      type: 'command' as const,
      command: 'nonexistent-command-that-does-not-exist',
    };

    const result = await runCommandCheck(service, 5000);

    expect(result.status).toBe(HEALTH_STATUS.DOWN);
  });

  it('should return down on timeout', async () => {
    const service = {
      name: 'test-service',
      displayName: 'Test Service',
      description: 'A test service',
      type: 'command' as const,
      command: 'sleep 10',
    };

    const result = await runCommandCheck(service, 100);

    expect(result.status).toBe(HEALTH_STATUS.DOWN);
  });

  it('should throw if command is missing', async () => {
    const service = {
      name: 'test-service',
      displayName: 'Test Service',
      description: 'A test service',
      type: 'command' as const,
    } as any;

    await expect(runCommandCheck(service, 5000)).rejects.toThrow(
      'Command is required',
    );
  });
});
