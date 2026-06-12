import { HealthStatus as WakuHealthStatus } from '@waku/sdk';
import { Command } from 'commander';
import { loadConfig } from '../config/index.js';
import { keysExist, loadKeyPair } from '../crypto/keys.js';
import {
  createFeedBatch,
  fetchAtomFeed,
  parseAtomFeed,
} from '../feed/index.js';
import {
  createAndSignFeedBatch,
  encodeFeedBatch,
} from '../protobuf/feed-codec.js';
import logger from '../utils/logger.js';
import { getHealthStatus } from '../waku/config.js';
import { WakuNodeManager } from '../waku/node.js';

interface ErrorWithCode extends Error {
  code?: string;
}

export const feedCommand = new Command()
  .name('feed')
  .description('Fetch and publish feed data to Waku')
  .option('-u, --url <url>', 'Feed URL')
  .option('-e, --env <name>', 'Override environment')
  .option('-t, --content-topic <topic>', 'Override feed content topic')
  .action(async (options) => {
    const wakuManager = new WakuNodeManager();

    try {
      const config = await loadConfig({
        env: options.env,
        feedContentTopic: options.contentTopic,
        feedUrl: options.url,
      });

      logger.setConfig(config);

      logger.success('Loaded configuration', {
        environment: config.environment,
        feedContentTopic: config.feedContentTopic,
        feedUrl: config.feedUrl,
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

      const feedUrl = config.feedUrl;
      if (!feedUrl) {
        throw new Error(
          'Feed URL is required. Provide it via -u, --url option or set feedUrl in the environment config.',
        );
      }

      const contentTopic = config.feedContentTopic;
      if (!contentTopic) {
        throw new Error(
          'Content topic is required. Provide it via -t, --content-topic option or set feedContentTopic in the environment config.',
        );
      }

      logger.status(`\nFetching feed from ${feedUrl}...\n`);

      const startTime = Date.now();
      const xml = await fetchAtomFeed(feedUrl);
      const entries = parseAtomFeed(xml);
      const batch = createFeedBatch(feedUrl, entries);
      const elapsed = Date.now() - startTime;

      logger.success(
        `Fetched ${batch.entries.length} entries in ${elapsed}ms`,
        {
          url: feedUrl,
          entriesCount: batch.entries.length,
        },
      );

      if (batch.entries.length === 0) {
        logger.status('\nNo entries to publish.');
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

      const encoder = node.createEncoder({ contentTopic });

      logger.info('Starting feed batch delivery', {
        contentTopic,
        entriesCount: batch.entries.length,
      });

      const signedBatch = await createAndSignFeedBatch(batch, keyPair);
      const payload = encodeFeedBatch(signedBatch);

      logger.info('Feed batch signed and encoded', {
        signatureLength: signedBatch.signature?.length,
        payloadSize: payload.length,
      });

      const result = await node.lightPush.send(encoder, { payload });

      const successes = result.successes || [];
      const failures = result.failures || [];

      if (successes.length > 0) {
        logger.success(
          `Published ${signedBatch.entries.length} entries to ${contentTopic}`,
          {
            successCount: successes.length,
            entriesCount: signedBatch.entries.length,
            contentTopic,
            peerIds: successes,
          },
        );
      }

      if (failures.length > 0) {
        logger.error('Failed to publish to some peers', {
          failureCount: failures.length,
          failures,
        });
        logger.fail(`Failed to publish to ${failures.length} peer(s)`);
      }

      if (successes.length === 0) {
        logger.error('Feed batch delivery failed - no successful peers', {
          contentTopic,
          failures,
        });
        logger.fail('Failed to publish feed batch: No successful deliveries');
        await wakuManager.stop();
        process.exit(1);
      }

      await wakuManager.stop();

      logger.summary('Summary', {
        Entries: signedBatch.entries.length,
        URL: feedUrl,
        Topic: contentTopic,
        Peers: `${successes.length} successful, ${failures.length} failed`,
      });

      process.exit(0);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorName =
        error instanceof Error ? error.constructor.name : 'UnknownError';
      const errorCode = (error as ErrorWithCode).code;

      logger.error('Fatal error in feed command', {
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
