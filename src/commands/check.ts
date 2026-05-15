import { HealthStatus as WakuHealthStatus } from '@waku/sdk';
import { Command } from 'commander';
import { loadConfig } from '../config/index.ts';
import { keysExist, loadKeyPair } from '../crypto/keys.ts';
import { runAllChecks } from '../healthcheck/index.ts';
import {
  createAndSignStatusMessage,
  encodeSignedStatusMessage,
} from '../protobuf/codec.ts';
import { ServiceState } from '../protobuf/schema.ts';
import { getHealthStatus } from '../waku/config.ts';
import { WakuNodeManager } from '../waku/node.ts';

export const checkCommand = new Command()
  .name('check')
  .description('Run healthchecks and publish signed results via Waku')
  .option('-e, --env <name>', 'Override environment (dev/prod)')
  .option(
    '-l, --log-level <level>',
    'Override log level (debug/info/warn/error)',
  )
  .option('-t, --content-topic <topic>', 'Override content topic string')
  .action(async (options) => {
    const wakuManager = new WakuNodeManager();

    try {
      const config = await loadConfig({
        env: options.env,
        logLevel: options.logLevel,
        contentTopic: options.contentTopic,
      });

      console.log('✓ Loaded configuration');

      const keysAvailable = await keysExist();
      if (!keysAvailable) {
        throw new Error(
          "Keys not found. Run 'dpulse keys generate' to create them first.",
        );
      }

      const keyPair = await loadKeyPair();
      console.log('✓ Loaded cryptographic keys');

      console.log(`\nRunning ${config.services.length} healthcheck(s)...\n`);

      const startTime = Date.now();
      const results = await runAllChecks(config);
      const elapsed = Date.now() - startTime;

      console.log(`Completed in ${elapsed}ms\n`);

      let successCount = 0;
      let degradedCount = 0;
      let downCount = 0;

      for (const result of results) {
        const statusText = getStatusText(result.status);
        console.log(
          `${result.displayName} (${result.serviceName}): ${statusText}`,
        );

        if (result.status === ServiceState.OPERATIONAL) {
          successCount++;
        } else if (result.status === ServiceState.DEGRADED) {
          degradedCount++;
        } else {
          downCount++;
        }
      }

      if (results.length === 0) {
        console.log('\nNo healthchecks to publish.');
        await wakuManager.stop();
        process.exit(0);
      }

      console.log('\nPublishing signed results to Waku...');

      await wakuManager.start();

      const health = wakuManager.getHealth();
      if (health !== WakuHealthStatus.SufficientlyHealthy) {
        throw new Error(`Waku node not healthy: ${getHealthStatus(health)}`);
      }

      const node = wakuManager.getNode();
      if (!node) {
        throw new Error('Waku node not initialized after start');
      }

      const encoder = node.createEncoder({ contentTopic: config.contentTopic });

      let publishedCount = 0;
      let failedCount = 0;

      for (const result of results) {
        try {
          const signedMessage = await createAndSignStatusMessage(
            result,
            keyPair,
          );
          const encodedMessage = await encodeSignedStatusMessage(signedMessage);

          const publishResult = await node.lightPush.send(encoder, {
            payload: encodedMessage,
          });

          if (
            !publishResult.successes ||
            publishResult.successes.length === 0
          ) {
            console.error(
              `  ✗ Failed to publish ${result.serviceName}: No successful deliveries`,
            );
            failedCount++;
            continue;
          }

          console.log(
            `  ✓ Published ${result.serviceName} to ${publishResult.successes.length} peer(s)`,
          );
          publishedCount++;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            `  ✗ Failed to publish ${result.serviceName}: ${errorMessage}`,
          );
          failedCount++;
        }
      }

      await wakuManager.stop();

      console.log('\n=== Summary ===');
      console.log(`Healthy:     ${successCount}/${results.length}`);
      console.log(`Degraded:    ${degradedCount}/${results.length}`);
      console.log(`Down:        ${downCount}/${results.length}`);
      console.log(`Published:   ${publishedCount}/${results.length}`);
      console.log(`Failed:      ${failedCount}/${results.length}`);
      console.log(`Topic:       ${config.contentTopic}`);

      process.exit(publishedCount > 0 ? 0 : 1);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`\n✗ Error: ${errorMessage}`);
      await wakuManager.stop();
      process.exit(1);
    }
  });

function getStatusText(status: number): string {
  switch (status) {
    case ServiceState.OPERATIONAL:
      return 'OPERATIONAL';
    case ServiceState.DEGRADED:
      return 'DEGRADED';
    case ServiceState.DOWN:
      return 'DOWN';
    default:
      return 'UNKNOWN';
  }
}
