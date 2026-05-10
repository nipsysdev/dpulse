import { Command } from "commander";
import { WakuNodeManager } from "../waku/node.ts";
import { getHealthStatus } from "../waku/config.ts";
import { HealthStatus } from "@waku/sdk";

export const statusCommand = new Command()
  .name("status")
  .description("Check Waku node health and connection status")
  .action(async () => {
    const manager = new WakuNodeManager();

    try {
      await manager.start();

      const node = manager.getNode();
      if (!node) {
        throw new Error("Node not initialized after start");
      }

      const health = manager.getHealth();
      if (health !== HealthStatus.SufficientlyHealthy) {
        const healthStatus = getHealthStatus(health);
        throw new Error(`Node is not sufficiently healthy: ${healthStatus} (status: ${health})`);
      }

      const isStarted = node.isStarted();
      const isConnected = manager.isConnected();
      const peerCount = await manager.getPeerCount();
      const peers = await node.getConnectedPeers();

      console.log("Waku Node Health Status:");
      console.log("=======================");
      console.log(`Node Status: ${isStarted ? "Started" : "Stopped"}`);
      console.log(`Connection: ${isConnected ? "Connected" : "Disconnected"}`);
      console.log(`Health Level: ${HealthStatus[health]} (${health})`);
      console.log(`Health Description: ${getHealthStatus(health)}`);
      console.log(`Connected Peers: ${peerCount}`);

      if (peerCount > 0) {
        console.log("\nPeer Details:");
        console.log("--------------");
        peers.forEach((peer, index) => {
          const peerId = peer?.id?.toString() || "Unknown";
          const protocols = peer?.protocols ? Array.from(peer.protocols).join(", ") : "None";
          console.log(`${index + 1}. ID: ${peerId}`);
          console.log(`   Protocols: ${protocols}`);
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    } finally {
      await manager.stop();
    }
  });

export const peersCommand = new Command()
  .name("peers")
  .description("List connected Waku peers")
  .action(async () => {
    const manager = new WakuNodeManager();

    try {
      await manager.start();

      const node = manager.getNode();
      if (!node) {
        throw new Error("Node not initialized after start");
      }

      const health = manager.getHealth();
      if (health !== HealthStatus.SufficientlyHealthy) {
        const healthStatus = getHealthStatus(health);
        throw new Error(`Node is not sufficiently healthy: ${healthStatus} (status: ${health})`);
      }

      const peers = await node.getConnectedPeers();
      const peerCount = peers.length;

      if (peerCount === 0) {
        console.log("No connected peers found");
        return;
      }

      console.log(`Connected Peers (${peerCount}):`);
      console.log("=================".padEnd(20 + peerCount.toString().length, "="));

      for (let i = 0; i < peers.length; i++) {
        const peer = peers[i];
        const peerId = peer?.id?.toString() ?? "Unknown";
        console.log(`${i + 1}. ${peerId}`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${errorMessage}`);
    } finally {
      await manager.stop();
    }
  });
