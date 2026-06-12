import type { Config } from '../config/index.js';
import type { StatusMessage } from '../protobuf/schema.js';
import { runCommandCheck } from './command.js';
import { runHttpCheck } from './http.js';

export async function runAllChecks(config: Config): Promise<StatusMessage[]> {
  // Use the timeout from config or default to 5000ms
  const timeoutMs = config.timeout;

  // Run all checks in parallel for efficiency
  const results = await Promise.all(
    config.services.map((service) => {
      const iconCid = config.iconCids?.[service.name];
      if (service.type === 'http') {
        return runHttpCheck(service, timeoutMs, iconCid);
      } else if (service.type === 'command') {
        return runCommandCheck(service, timeoutMs, iconCid);
      } else {
        // This should never happen due to config validation
        throw new Error(`Unknown service type: ${service.type}`);
      }
    }),
  );

  return results;
}

export async function runChecksForService(
  config: Config,
  serviceName: string,
): Promise<StatusMessage | null> {
  const service = config.services.find((s) => s.name === serviceName);

  if (!service) {
    return null;
  }

  const timeoutMs = config.timeout;
  const iconCid = config.iconCids?.[service.name];

  if (service.type === 'http') {
    return runHttpCheck(service, timeoutMs, iconCid);
  } else if (service.type === 'command') {
    return runCommandCheck(service, timeoutMs, iconCid);
  } else {
    throw new Error(`Unknown service type: ${service.type}`);
  }
}
