import type { CreateNodeOptions } from "@waku/sdk";
import { HealthStatus } from "@waku/sdk";

export function createWakuConfig(): CreateNodeOptions {
  return {
    defaultBootstrap: true,
    autoStart: false,
    userAgent: 'dev.nipsys.dpulse'
  };
}

export function getHealthStatus(health: HealthStatus): string {
  switch (health) {
    case HealthStatus.Unhealthy:
      return "Unhealthy: No peer connections";
    case HealthStatus.MinimallyHealthy:
      return "Minimally Healthy: At least 1 peer supporting both Filter and LightPush protocols";
    case HealthStatus.SufficientlyHealthy:
      return "Sufficiently Healthy: At least 2 peers supporting both Filter and LightPush protocols";
    default:
      return `Unknown status: ${health}`;
  }
}
