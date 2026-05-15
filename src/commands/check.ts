import { randomUUID } from 'node:crypto';
import { HealthStatus as WakuHealthStatus } from '@waku/sdk';
import { Command } from 'commander';
import { loadConfig } from '../config/index.js';
import { keysExist, loadKeyPair } from '../crypto/keys.js';
import { runAllChecks } from '../healthcheck/index.js';
import {
  createAndSignStatusMessage,
  encodeSignedStatusMessage,
} from '../protobuf/codec.js';
import { ServiceState } from '../protobuf/schema.js';
import {
  debug,
  info,
  error as logError,
  setConfig,
  warn,
} from '../utils/logger.js';
import { getHealthStatus } from '../waku/config.js';
import { WakuNodeManager } from '../waku/node.js';

interface ErrorWithCode extends Error {
  code?: string;
  statusCode?: number;
}

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

      setConfig(config);

      info('Loaded configuration', {
        environment: config.environment,
        logLevel: config.logLevel,
        contentTopic: config.contentTopic,
        servicesCount: config.services.length,
      });

      console.log('✓ Loaded configuration');

      const keysAvailable = await keysExist();
      if (!keysAvailable) {
        logError('Cryptographic keys not found');
        throw new Error(
          "Keys not found. Run 'dpulse keys generate' to create them first.",
        );
      }

      const keyPair = await loadKeyPair();
      info('Cryptographic keys loaded');
      console.log('✓ Loaded cryptographic keys');

      console.log(`\nRunning ${config.services.length} healthcheck(s)...\n`);

      const startTime = Date.now();
      const results = await runAllChecks(config);
      const elapsed = Date.now() - startTime;

      info(`Health checks completed in ${elapsed}ms`, {
        elapsed,
        resultsCount: results.length,
      });

      console.log(`Completed in ${elapsed}ms\\n`);

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

      info('Health check results summary', {
        successCount,
        degradedCount,
        downCount,
      });

      if (results.length === 0) {
        console.log('\nNo healthchecks to publish.');
        await wakuManager.stop();
        process.exit(0);
      }

      console.log('\nPublishing signed results to Waku...');

      await wakuManager.start();

      const health = wakuManager.getHealth();
      if (health !== WakuHealthStatus.SufficientlyHealthy) {
        logError('Waku node not healthy', {
          healthStatus: getHealthStatus(health),
        });
        throw new Error(`Waku node not healthy: ${getHealthStatus(health)}`);
      }

      const node = wakuManager.getNode();
      if (!node) {
        logError('Waku node not initialized after start');
        throw new Error('Waku node not initialized after start');
      }

      const encoder = node.createEncoder({ contentTopic: config.contentTopic });

      info('Starting message delivery pipeline', {
        contentTopic: config.contentTopic,
        messagesToPublish: results.length,
      });

      let publishedCount = 0;
      let failedCount = 0;

      for (const result of results) {
        const messageStart = Date.now();
        const correlationId = randomUUID();

        info('Starting message delivery', {
          serviceName: result.serviceName,
          displayName: result.displayName,
          status: getStatusText(result.status),
          correlationId,
        });

        try {
          debug('Creating and signing message', {
            serviceName: result.serviceName,
            correlationId,
          });

          const signedMessage = await createAndSignStatusMessage(
            result,
            keyPair,
          );

          debug('Message signed, encoding...', {
            serviceName: result.serviceName,
            signatureLength: signedMessage.signature?.length,
            correlationId,
          });

          const encodedMessage = await encodeSignedStatusMessage(signedMessage);

          debug('Message encoded, publishing via LightPush...', {
            serviceName: result.serviceName,
            encodedSize: encodedMessage.length,
            correlationId,
          });

          const publishResult = await node.lightPush.send(encoder, {
            payload: encodedMessage,
          });

          const publishDuration = Date.now() - messageStart;

          // Check for successful deliveries
          const successes = publishResult.successes || [];
          const failures = publishResult.failures || [];

          if (successes.length === 0) {
            logError('Message delivery failed - no successful peers', {
              serviceName: result.serviceName,
              contentTopic: config.contentTopic,
              encodedSize: encodedMessage.length,
              failures,
              failureCount: failures.length,
              duration: publishDuration,
              correlationId,
            });

            // Log detailed failure information
            if (failures.length > 0) {
              failures.forEach((failure, index) => {
                logError('Peer-specific delivery failure', {
                  serviceName: result.serviceName,
                  failureIndex: index,
                  peerId: failure.peerId,
                  errorCode: failure.error,
                  errorMessage: String(failure.error),
                  correlationId,
                });
              });
            } else {
              logError(
                'Delivery failed with no peer information - possible network issue',
                {
                  serviceName: result.serviceName,
                  contentTopic: config.contentTopic,
                  hasSuccesses: successes.length > 0,
                  hasFailures: failures.length > 0,
                  correlationId,
                },
              );
            }

            console.error(
              `  ✗ Failed to publish ${result.serviceName}: No successful deliveries`,
            );
            failedCount++;
            continue;
          }

          // Successful delivery with partial failures
          if (failures.length > 0) {
            info('Message delivered with partial failures', {
              serviceName: result.serviceName,
              successCount: successes.length,
              failureCount: failures.length,
              successes,
              failures,
              duration: publishDuration,
              correlationId,
            });

            // Log failure details
            failures.forEach((failure, index) => {
              warn('Peer-specific failure in partial success delivery', {
                serviceName: result.serviceName,
                failureIndex: index,
                peerId: failure.peerId,
                errorCode: failure.error,
                errorMessage: String(failure.error),
                correlationId,
              });
            });
          } else {
            // Complete success
            info('Message delivered successfully to all peers', {
              serviceName: result.serviceName,
              successCount: successes.length,
              peerIds: successes,
              duration: publishDuration,
              correlationId,
            });
          }

          console.log(
            `  ✓ Published ${result.serviceName} to ${successes.length} peer(s)`,
          );
          publishedCount++;
        } catch (error) {
          const publishDuration = Date.now() - messageStart;
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const errorName =
            error instanceof Error ? error.constructor.name : 'UnknownError';
          const errorCode = (error as ErrorWithCode).code;

          logError('Message delivery threw exception', {
            serviceName: result.serviceName,
            error: errorMessage,
            errorType: errorName,
            errorCode,
            contentTopic: config.contentTopic,
            duration: publishDuration,
            correlationId,
            stack: error instanceof Error ? error.stack : undefined,
          });

          console.error(
            `  ✗ Failed to publish ${result.serviceName}: ${errorMessage}`,
          );
          failedCount++;
        }
      }

      await wakuManager.stop();

      info('Message delivery pipeline completed', {
        publishedCount,
        failedCount,
        totalMessages: results.length,
        contentTopic: config.contentTopic,
      });

      console.log('\\n=== Summary ===');
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
      const errorName =
        error instanceof Error ? error.constructor.name : 'UnknownError';
      const errorCode = (error as ErrorWithCode).code;

      logError('Fatal error in check command', {
        error: errorMessage,
        errorType: errorName,
        errorCode,
        stack: error instanceof Error ? error.stack : undefined,
      });

      console.error(`\\n✗ Error: ${errorMessage}`);
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
