import type { Config } from '../config/index.ts';
import type { StatusMessage } from '../protobuf/schema.ts';
import { ServiceState } from '../protobuf/schema.ts';

export async function runHttpCheck(
  service: Config['services'][0],
  timeoutMs: number,
  iconCid?: string,
): Promise<StatusMessage> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (!service.url) {
      throw new Error('URL is required for HTTP healthcheck');
    }

    const response = await fetch(service.url, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const elapsed = Date.now() - start;
    const status = determineStatus(
      response.status,
      elapsed,
      service.expect?.status,
    );

    if (status === ServiceState.OPERATIONAL && service.expect?.body_contains) {
      const body = await response.text();
      if (!body.includes(service.expect.body_contains)) {
        return {
          serviceName: service.name,
          displayName: service.displayName,
          description: service.description,
          status: ServiceState.DOWN,
          timestamp: Date.now(),
          iconCid,
        };
      }
    }

    return {
      serviceName: service.name,
      displayName: service.displayName,
      description: service.description,
      status,
      timestamp: Date.now(),
      iconCid: iconCid,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage === 'URL is required for HTTP healthcheck') {
      throw error;
    }

    return {
      serviceName: service.name,
      displayName: service.displayName,
      description: service.description,
      status: ServiceState.DOWN,
      timestamp: Date.now(),
      iconCid: iconCid,
    };
  }
}

function determineStatus(
  httpStatus: number,
  elapsedMs: number,
  expectedStatus?: number,
): 0 | 1 | 2 {
  const expected = expectedStatus ?? 200;

  if (httpStatus !== expected) {
    return ServiceState.DOWN;
  }

  if (elapsedMs > 5000) {
    return ServiceState.DEGRADED;
  }

  return ServiceState.OPERATIONAL;
}
