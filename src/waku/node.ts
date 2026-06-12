import {
  createLightNode,
  HealthStatus,
  type LightNode,
  Protocols,
} from '@waku/sdk';
import logger from '../utils/logger.js';
import { createWakuConfig, getHealthStatus } from './config.js';

export interface PeerCounts {
  total: number;
  lightPush: number;
  store: number;
  filter: number;
}

const HEALTH_CHECK_TIMEOUT_MS = 30000;
const HEALTH_CHECK_INTERVAL_MS = 1000;

export class WakuNodeManager {
  private node: LightNode | null = null;

  async start(): Promise<void> {
    if (this.node) {
      logger.error('Waku node is already started');
      throw new Error('Waku node is already started');
    }

    const startTime = Date.now();

    try {
      logger.info('Starting Waku node initialization...');

      const config = createWakuConfig();
      this.node = await createLightNode(config);

      logger.debug('Waku node created, starting...');

      await this.node.start();

      logger.info('Waku node started', {
        duration: Date.now() - startTime,
      });

      await this.waitForSufficientlyHealthy();

      logger.debug('Waiting for LightPush and Store peers...');
      await this.node.waitForPeers(
        [Protocols.LightPush, Protocols.Store],
        20000,
      );

      const peerCounts = await this.getPeerCounts();
      logger.info(`Connected to ${peerCounts.total} peer(s)`, {
        total: peerCounts.total,
        lightPush: peerCounts.lightPush,
        store: peerCounts.store,
        filter: peerCounts.filter,
      });

      if (peerCounts.store === 0) {
        logger.warn(
          'No Store peers connected - messages will NOT persist on the network',
        );
      }

      logger.debug('Starting LightPush protocol...');
      this.node.lightPush.start();

      logger.info('Waku node fully started and ready', {
        totalDuration: Date.now() - startTime,
        peerCounts,
      });
    } catch (error) {
      this.node = null;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('Waku node startup failed', {
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

    logger.debug('Waiting for SufficientlyHealthy status', {
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
          logger.info('Waku node reached SufficientlyHealthy status', {
            elapsed,
            healthStatus: getHealthStatus(HealthStatus.SufficientlyHealthy),
          });
          resolve();
          return;
        }

        const currentHealth = this.node
          ? this.node.health
          : HealthStatus.Unhealthy;

        logger.debug('Health status check', {
          elapsed,
          currentHealth: getHealthStatus(currentHealth),
        });

        if (elapsed >= HEALTH_CHECK_TIMEOUT_MS) {
          logger.error('Timeout waiting for SufficientlyHealthy status', {
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
      nodeToStop.lightPush.stop();
      await nodeToStop.stop();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('Error stopping Waku node', {
        error: errorMessage,
      });
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

  async getPeerCounts(): Promise<PeerCounts> {
    if (!this.node) {
      return { total: 0, lightPush: 0, store: 0, filter: 0 };
    }

    try {
      // Get multicodecs from the protocol instances
      const lightPushCodecs = this.node.lightPush.multicodec;
      const storeCodec = this.node.store.multicodec;
      const filterCodec = this.node.filter.multicodec;

      // Get all peers and filter by protocol support
      const allPeers = await this.node.getConnectedPeers();

      const lightPushPeers = allPeers.filter((p) =>
        lightPushCodecs.some((codec) => p.protocols.includes(codec)),
      );

      const storePeers = allPeers.filter((p) =>
        p.protocols.includes(storeCodec),
      );

      const filterPeers = allPeers.filter((p) =>
        p.protocols.includes(filterCodec),
      );

      return {
        total: allPeers.length,
        lightPush: lightPushPeers.length,
        store: storePeers.length,
        filter: filterPeers.length,
      };
    } catch (error) {
      logger.error('Failed to get peer counts', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { total: 0, lightPush: 0, store: 0, filter: 0 };
    }
  }
}
