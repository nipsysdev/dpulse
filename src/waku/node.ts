import { createLightNode, LightNode, HealthStatus, Protocols } from "@waku/sdk";
import { createWakuConfig, getHealthStatus } from "./config.ts";

const HEALTH_CHECK_TIMEOUT_MS = 30000;
const HEALTH_CHECK_INTERVAL_MS = 1000;

export class WakuNodeManager {
  private node: LightNode | null = null;

  constructor() {}

  async start(): Promise<void> {
    if (this.node) {
      throw new Error("Waku node is already started");
    }

    try {
      const config = createWakuConfig();
      this.node = await createLightNode(config);
      
      await this.node.start();

      await this.waitForSufficientlyHealthy();

      // Ensure LightPush and Store peers are connected before starting the service
      await this.node.waitForPeers([Protocols.LightPush, Protocols.Store], 20000);

      await this.node.lightPush.start();
      
    } catch (error) {
      this.node = null;
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to start Waku node: ${errorMessage}`);
    }
  }

  private async waitForSufficientlyHealthy(): Promise<void> {
    if (!this.node) {
      throw new Error("Waku node not initialized");
    }

    const startTime = Date.now();
    
    return new Promise<void>((resolve, reject) => {
      const checkHealth = () => {
        const elapsed = Date.now() - startTime;
        
        if (this.node && this.node.health === HealthStatus.SufficientlyHealthy) {
          resolve();
          return;
        }
        
        if (elapsed >= HEALTH_CHECK_TIMEOUT_MS) {
          const currentHealth = this.node ? this.node.health : HealthStatus.Unhealthy;
          reject(new Error(
            `Timeout waiting for SufficientlyHealthy status. Current health: ${getHealthStatus(currentHealth)}`
          ));
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
