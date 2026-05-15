import {
  createLightNode,
  HealthStatus,
  type LightNode,
  Protocols,
} from '@waku/sdk';
import { debug, info, error as logError } from '../utils/logger.js';
import { createWakuConfig, getHealthStatus } from './config.js';

const HEALTH_CHECK_TIMEOUT_MS = 30000;
const HEALTH_CHECK_INTERVAL_MS = 1000;

export class WakuNodeManager {
  private node: LightNode | null = null;

  async start(): Promise<void> {
    if (this.node) {
      logError('Waku node is already started');
      throw new Error('Waku node is already started');
    }

    const startTime = Date.now();

    try {
      info('Starting Waku node initialization...');

      const config = createWakuConfig();
      this.node = await createLightNode(config);

      debug('Waku node created, starting...');

      await this.node.start();

      info('Waku node started', {
        duration: Date.now() - startTime,
      });

      await this.waitForSufficientlyHealthy();

      // Ensure LightPush and Store peers are connected before starting the service
      debug('Waiting for LightPush and Store peers...');
      await this.node.waitForPeers(
        [Protocols.LightPush, Protocols.Store],
        20000,
      );

      const peerCount = await this.getPeerCount();
      info(`Connected to ${peerCount} peer(s)`, {
        peerCount,
      });

      debug('Starting LightPush protocol...');
      await this.node.lightPush.start();

      info('Waku node fully started and ready', {
        totalDuration: Date.now() - startTime,
        peerCount,
      });
    } catch (error) {
      this.node = null;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logError('Waku node startup failed', {
        error: errorMessage,
        duration: Date.now() - startTime,
      });
      throw new Error(`Failed to start Waku node: ${errorMessage}`);
    }
  }

  private async waitForSufficientlyHealthy(): Promise<void> {
    if (!this.node) {
      throw new Error('Waku node not initialized');
    }

    const startTime = Date.now();

    debug('Waiting for SufficientlyHealthy status', {
      timeout: HEALTH_CHECK_TIMEOUT_MS,
      interval: HEALTH_CHECK_INTERVAL_MS,
    });

    return new Promise<void>((resolve, reject) => {
      const checkHealth = () => {
        const elapsed = Date.now() - startTime;

        if (
          this.node &&
          this.node.health === HealthStatus.SufficientlyHealthy
        ) {
          info('Waku node reached SufficientlyHealthy status', {
            elapsed,
            healthStatus: getHealthStatus(HealthStatus.SufficientlyHealthy),
          });
          resolve();
          return;
        }

        const currentHealth = this.node
          ? this.node.health
          : HealthStatus.Unhealthy;

        debug('Health status check', {
          elapsed,
          currentHealth: getHealthStatus(currentHealth),
        });

        if (elapsed >= HEALTH_CHECK_TIMEOUT_MS) {
          logError('Timeout waiting for SufficientlyHealthy status', {
            elapsed,
            currentHealth: getHealthStatus(currentHealth),
            timeout: HEALTH_CHECK_TIMEOUT_MS,
          });
          reject(
            new Error(
              `Timeout waiting for SufficientlyHealthy status. Current health: ${getHealthStatus(currentHealth)}`,
            ),
          );
          return;
        }

        setTimeout(checkHealth, HEALTH_CHECK_INTERVAL_MS);
      };

      checkHealth();
    });
  }

  async stop(): Promise<void> {
    if (!this.node) {
      return;
    }

    const nodeToStop = this.node;
    this.node = null;

    try {
      await nodeToStop.lightPush.stop();
      await nodeToStop.stop();
    } catch (error) {
      console.error('Error stopping Waku node:', error);
    }
  }

  isConnected(): boolean {
    return this.node?.isConnected() ?? false;
  }

  getNode(): LightNode | null {
    return this.node;
  }

  setNode(node: LightNode): void {
    this.node = node;
  }

  getHealth(): HealthStatus {
    return this.node?.health ?? HealthStatus.Unhealthy;
  }

  async getPeerCount(): Promise<number> {
    if (!this.node) {
      return 0;
    }

    try {
      const peers = await this.node.getConnectedPeers();
      return peers.length;
    } catch (_error) {
      return 0;
    }
  }
}
