import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runHttpCheck } from '../../src/healthcheck/http';

const HEALTH_STATUS = {
  HEALTHY: 0,
  DEGRADED: 1,
  DOWN: 2,
} as const;

let mockFetch: ReturnType<typeof vi.fn>;
let originalFetch: typeof global.fetch;

beforeEach(() => {
  originalFetch = global.fetch;
  mockFetch = vi.fn();
  global.fetch = mockFetch as any;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('runHttpCheck', () => {
  it('should return healthy for 200 status code', async () => {
    const service = {
      name: 'test-service',
      displayName: 'Test Service',
      description: 'A test service',
      type: 'http' as const,
      url: 'https://example.com/health',
    };

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('OK'),
    });

    const result = await runHttpCheck(service, 5000);

    expect(result.serviceName).toBe('test-service');
    expect(result.displayName).toBe('Test Service');
    expect(result.description).toBe('A test service');
    expect(result.status).toBe(HEALTH_STATUS.HEALTHY);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/health', {
      signal: expect.any(AbortSignal),
    });
  });

  it('should return healthy for custom accepted status code', async () => {
    const service = {
      name: 'test-service',
      displayName: 'Test Service',
      description: 'A test service',
      type: 'http' as const,
      url: 'https://example.com/health',
      expect: {
        status: 204,
      },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      status: 204,
      text: () => Promise.resolve(''),
    });

    const result = await runHttpCheck(service, 5000);

    expect(result.status).toBe(HEALTH_STATUS.HEALTHY);
  });

  it('should return down for unexpected status code', async () => {
    const service = {
      name: 'test-service',
      displayName: 'Test Service',
      description: 'A test service',
      type: 'http' as const,
      url: 'https://example.com/health',
    };

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    const result = await runHttpCheck(service, 5000);

    expect(result.status).toBe(HEALTH_STATUS.DOWN);
  });

  it('should return down for 404 status code', async () => {
    const service = {
      name: 'test-service',
      displayName: 'Test Service',
      description: 'A test service',
      type: 'http' as const,
      url: 'https://example.com/health',
    };

    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not Found'),
    });

    const result = await runHttpCheck(service, 5000);

    expect(result.status).toBe(HEALTH_STATUS.DOWN);
  });

  it('should return degraded for response time > 5 seconds', async () => {
    const service = {
      name: 'test-service',
      displayName: 'Test Service',
      description: 'A test service',
      type: 'http' as const,
      url: 'https://example.com/health',
    };

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('OK'),
    });

    const realDateNow = Date.now;
    let callCount = 0;
    const startTime = Date.now();
    Date.now = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return startTime;
      } else if (callCount === 2) {
        return startTime + 5100;
      }
      return startTime;
    });

    const result = await runHttpCheck(service, 10000);

    Date.now = realDateNow;

    expect(result.status).toBe(HEALTH_STATUS.DEGRADED);
  }, 10000);

  it('should return down on timeout', async () => {
    const service = {
      name: 'test-service',
      displayName: 'Test Service',
      description: 'A test service',
      type: 'http' as const,
      url: 'https://example.com/health',
    };

    const abortError = new Error('Request aborted');
    abortError.name = 'AbortError';

    mockFetch.mockImplementation(async (_, options) => {
      setTimeout(() => {
        options?.signal?.dispatchEvent(
          new Event('abort', { cancelable: false }),
        );
      }, 100);

      return Promise.reject(abortError);
    });

    const result = await runHttpCheck(service, 100);

    expect(result.status).toBe(HEALTH_STATUS.DOWN);
  });

  it('should return down on network error', async () => {
    const service = {
      name: 'test-service',
      displayName: 'Test Service',
      description: 'A test service',
      type: 'http' as const,
      url: 'https://example.com/health',
    };

    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await runHttpCheck(service, 5000);

    expect(result.status).toBe(HEALTH_STATUS.DOWN);
  });

  it('should return down if body does not contain expected string', async () => {
    const service = {
      name: 'test-service',
      displayName: 'Test Service',
      description: 'A test service',
      type: 'http' as const,
      url: 'https://example.com/health',
      expect: {
        body_contains: 'healthy',
        status: 200,
      },
    };

    const mockText = vi.fn().mockResolvedValue('bad-status-error');
    const mockResponse = {
      ok: true,
      status: 200,
      text: mockText,
    };

    mockFetch.mockResolvedValue(mockResponse);

    const result = await runHttpCheck(service, 5000);

    expect(mockText).toHaveBeenCalled();
    expect(result.status).toBe(HEALTH_STATUS.DOWN);
  });

  it('should return healthy if body contains expected string', async () => {
    const service = {
      name: 'test-service',
      displayName: 'Test Service',
      description: 'A test service',
      type: 'http' as const,
      url: 'https://example.com/health',
      expect: {
        body_contains: 'healthy',
      },
    };

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('service is healthy'),
    });

    const result = await runHttpCheck(service, 5000);

    expect(result.status).toBe(HEALTH_STATUS.HEALTHY);
  });

  it('should throw if URL is missing', async () => {
    const service = {
      name: 'test-service',
      displayName: 'Test Service',
      description: 'A test service',
      type: 'http' as const,
    } as any;

    await expect(runHttpCheck(service, 5000)).rejects.toThrow(
      'URL is required',
    );
  });
});
