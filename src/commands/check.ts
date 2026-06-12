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
import logger from '../utils/logger.js';
import { getHealthStatus } from '../waku/config.js';
import { WakuNodeManager } from '../waku/node.js';

interface ErrorWithCode extends Error {
  code?: string;
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

      logger.setConfig(config);

      logger.success('Loaded configuration', {
        environment: config.environment,
        logLevel: config.logLevel,
        contentTopic: config.contentTopic,
        servicesCount: config.services.length,
      });

      const keysAvailable = await keysExist();
      if (!keysAvailable) {
        logger.error('Cryptographic keys not found');
        throw new Error(
          "Keys not found. Run 'dpulse keys generate' to create them first.",
        );
      }

      const keyPair = await loadKeyPair();
      logger.success('Loaded cryptographic keys');

      logger.status(`\nRunning ${config.services.length} healthcheck(s)...\n`);

      const startTime = Date.now();
      const results = await runAllChecks(config);
      const elapsed = Date.now() - startTime;

      logger.info(`Health checks completed in ${elapsed}ms`, {
        elapsed,
        resultsCount: results.length,
      });

      logger.status(`Completed in ${elapsed}ms\n`);

      let successCount = 0;
      let degradedCount = 0;
      let downCount = 0;

      for (const result of results) {
        const statusText = getStatusText(result.status);
        logger.status(
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

      logger.info('Health check results summary', {
        successCount,
        degradedCount,
        downCount,
      });

      if (results.length === 0) {
        logger.status('\nNo healthchecks to publish.');
        await wakuManager.stop();
        process.exit(0);
      }

      logger.status('\nPublishing signed results to Waku...');

      await wakuManager.start();

      const health = wakuManager.getHealth();
      if (health !== WakuHealthStatus.SufficientlyHealthy) {
        logger.error('Waku node not healthy', {
          healthStatus: getHealthStatus(health),
        });
        throw new Error(`Waku node not healthy: ${getHealthStatus(health)}`);
      }

      const node = wakuManager.getNode();
      if (!node) {
        logger.error('Waku node not initialized after start');
        throw new Error('Waku node not initialized after start');
      }

      const encoder = node.createEncoder({ contentTopic: config.contentTopic });

      logger.info('Starting message delivery pipeline', {
        contentTopic: config.contentTopic,
        messagesToPublish: results.length,
      });

      let publishedCount = 0;
      let failedCount = 0;

      for (const result of results) {
        const messageStart = Date.now();
        const correlationId = randomUUID();

        logger.info('Starting message delivery', {
          serviceName: result.serviceName,
          displayName: result.displayName,
          status: getStatusText(result.status),
          correlationId,
        });

        try {
          logger.debug('Creating and signing message', {
            serviceName: result.serviceName,
            correlationId,
          });

          const signedMessage = await createAndSignStatusMessage(
            result,
            keyPair,
          );

          logger.debug('Message signed, encoding...', {
            serviceName: result.serviceName,
            signatureLength: signedMessage.signature?.length,
            correlationId,
          });

          const encodedMessage = await encodeSignedStatusMessage(signedMessage);

          logger.debug('Message encoded, publishing via LightPush...', {
            serviceName: result.serviceName,
            encodedSize: encodedMessage.length,
            correlationId,
          });

          const publishResult = await node.lightPush.send(encoder, {
            payload: encodedMessage,
          });

          const publishDuration = Date.now() - messageStart;

          const successes = publishResult.successes || [];
          const failures = publishResult.failures || [];

          if (successes.length === 0) {
            logger.error('Message delivery failed - no successful peers', {
              serviceName: result.serviceName,
              contentTopic: config.contentTopic,
              encodedSize: encodedMessage.length,
              failures,
              failureCount: failures.length,
              duration: publishDuration,
              correlationId,
            });

            if (failures.length > 0) {
              failures.forEach((failure, index) => {
                logger.error('Peer-specific delivery failure', {
                  serviceName: result.serviceName,
                  failureIndex: index,
                  peerId: failure.peerId,
                  errorCode: failure.error,
                  errorMessage: String(failure.error),
                  correlationId,
                });
              });
            } else {
              logger.error(
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

            logger.fail(
              `Failed to publish ${result.serviceName}: No successful deliveries`,
            );
            failedCount++;
            continue;
          }

          if (failures.length > 0) {
            logger.info('Message delivered with partial failures', {
              serviceName: result.serviceName,
              successCount: successes.length,
              failureCount: failures.length,
              successes,
              failures,
              duration: publishDuration,
              correlationId,
            });

            failures.forEach((failure, index) => {
              logger.warn('Peer-specific failure in partial success delivery', {
                serviceName: result.serviceName,
                failureIndex: index,
                peerId: failure.peerId,
                errorCode: failure.error,
                errorMessage: String(failure.error),
                correlationId,
              });
            });
          } else {
            logger.info('Message delivered successfully to all peers', {
              serviceName: result.serviceName,
              successCount: successes.length,
              peerIds: successes,
              duration: publishDuration,
              correlationId,
            });
          }

          logger.success(
            `Published ${result.serviceName} to ${successes.length} peer(s)`,
          );
          publishedCount++;
        } catch (error) {
          const publishDuration = Date.now() - messageStart;
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const errorName =
            error instanceof Error ? error.constructor.name : 'UnknownError';
          const errorCode = (error as ErrorWithCode).code;

          logger.error('Message delivery threw exception', {
            serviceName: result.serviceName,
            error: errorMessage,
            errorType: errorName,
            errorCode,
            contentTopic: config.contentTopic,
            duration: publishDuration,
            correlationId,
            stack: error instanceof Error ? error.stack : undefined,
          });

          logger.fail(
            `Failed to publish ${result.serviceName}: ${errorMessage}`,
          );
          failedCount++;
        }
      }

      await wakuManager.stop();

      logger.info('Message delivery pipeline completed', {
        publishedCount,
        failedCount,
        totalMessages: results.length,
        contentTopic: config.contentTopic,
      });

      logger.summary('Summary', {
        Healthy: `${successCount}/${results.length}`,
        Degraded: `${degradedCount}/${results.length}`,
        Down: `${downCount}/${results.length}`,
        Published: `${publishedCount}/${results.length}`,
        Failed: `${failedCount}/${results.length}`,
        Topic: config.contentTopic,
      });

      process.exit(publishedCount > 0 ? 0 : 1);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorName =
        error instanceof Error ? error.constructor.name : 'UnknownError';
      const errorCode = (error as ErrorWithCode).code;

      logger.error('Fatal error in check command', {
        error: errorMessage,
        errorType: errorName,
        errorCode,
        stack: error instanceof Error ? error.stack : undefined,
      });

      logger.fail(`Error: ${errorMessage}`);
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
