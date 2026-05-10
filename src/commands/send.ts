import { Command } from "commander";
import { loadConfig } from "../config/index.ts";
import { loadKeyPair, keysExist } from "../crypto/keys.ts";
import { createAndSignStatusMessage, encodeSignedStatusMessage } from "../protobuf/codec.ts";
import { ServiceState } from "../protobuf/schema.ts";
import { WakuNodeManager } from "../waku/node.ts";
import { getHealthStatus } from "../waku/config.ts";
import { HealthStatus } from "@waku/sdk";

export const sendCommand = new Command()
  .name("send")
  .description("Send signed status message via Waku")
  .argument("<message>")
  .requiredOption("--service <name>", "Service name (e.g., 'element', 'ipfs', 'taiga')")
  .requiredOption("--state <state>", "Service state: 'operational', 'degraded', or 'down'")
  .action(async (message: string, options) => {
    const wakuManager = new WakuNodeManager();

    try {
      const config = await loadConfig();

      const keysDir = "./keys";
      const keysAvailable = await keysExist(keysDir);
      if (!keysAvailable) {
        throw new Error(
          "Keys not found. Run 'dpulse keys generate' to create them first.",
        );
      }

      const keyPair = await loadKeyPair(keysDir);

      const stateMap: Record<string, ServiceState> = {
        operational: ServiceState.OPERATIONAL,
        degraded: ServiceState.DEGRADED,
        down: ServiceState.DOWN,
      };

      const stateValue = stateMap[options.state.toLowerCase()];
      if (stateValue === undefined) {
        throw new Error(
          `Invalid state: '${options.state}'. Must be one of: ${Object.keys(stateMap).join(", ")}`,
        );
      }

      const statusMessage = await createAndSignStatusMessage(
        {
          serviceName: options.service,
          state: stateValue,
          timestamp: Date.now(),
          message: message,
        },
        keyPair,
      );

      const encodedMessage = await encodeSignedStatusMessage(statusMessage);

      await wakuManager.start();

      const health = wakuManager.getHealth();
      if (health !== HealthStatus.SufficientlyHealthy) {
        throw new Error(`Waku node not healthy: ${getHealthStatus(health)}`);
      }

      const node = wakuManager.getNode();
      if (!node) {
        throw new Error("Waku node not initialized after start");
      }

      const encoder = node.createEncoder({ contentTopic: config.contentTopic });

      const result = await node.lightPush.send(encoder, { payload: encodedMessage });

      // Check if the message was successfully sent to at least one peer
      if (!result.successes || result.successes.length === 0) {
        throw new Error(
          `Failed to send message (no successful deliveries). Failures: ${JSON.stringify(result.failures || [])}`,
        );
      }

      console.log(`✓ Message sent successfully! Peers: ${result.successes.join(", ")}`);
      console.log(`Topic: ${config.contentTopic}`);

      await wakuManager.stop();
      process.exit(0);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
      await wakuManager.stop();
      process.exit(1);
    }
  });
