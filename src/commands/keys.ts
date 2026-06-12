import * as path from 'node:path';
import { Command } from 'commander';
import inquirer from 'inquirer';
import {
  exportPublicKey,
  generateKeyPair,
  getKeysPath,
  keysExist,
  loadKeyPair,
  saveKeyPair,
} from '../crypto/keys.js';
import logger from '../utils/logger.js';

function pemToArrayBuffer(
  pem: string,
  header: string,
  footer: string,
): ArrayBuffer {
  const pemContents = pem
    .substring(pem.indexOf(header) + header.length, pem.lastIndexOf(footer))
    .trim();

  const binaryDerString = atob(pemContents);
  const buf = new ArrayBuffer(binaryDerString.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0; i < binaryDerString.length; i++) {
    bufView[i] = binaryDerString.charCodeAt(i);
  }
  return buf;
}

const PUBLIC_KEY_HEADER = '-----BEGIN PUBLIC KEY-----';
const PUBLIC_KEY_FOOTER = '-----END PUBLIC KEY-----';

export async function generateFingerprint(
  publicKeyPem: string,
): Promise<string> {
  const publicKeyBytes = pemToArrayBuffer(
    publicKeyPem,
    PUBLIC_KEY_HEADER,
    PUBLIC_KEY_FOOTER,
  );
  const hashBuffer = await crypto.subtle.digest('SHA-256', publicKeyBytes);
  const hashArray = new Uint8Array(hashBuffer);
  const fingerprint = Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return fingerprint;
}

const keysCommand = new Command()
  .name('keys')
  .description('Manage cryptographic keys')
  .action(() => {
    keysCommand.help();
  });

const generateCommand = new Command()
  .name('generate')
  .description('Generate new Ed25519 key pair')
  .action(async () => {
    try {
      const keysAlreadyExist = await keysExist();

      if (keysAlreadyExist) {
        const confirm = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: 'Keys already exist. Overwrite?',
            default: false,
          },
        ]);

        if (!confirm.overwrite) {
          logger.status('Operation cancelled.');
          process.exit(0);
        }
      }

      const keyPair = await generateKeyPair();
      await saveKeyPair(keyPair);

      const keysDir = getKeysPath();
      logger.success('Key pair generated successfully');
      logger.success(`Private key: ${path.join(keysDir, 'private.pem')}`);
      logger.success(`Public key: ${path.join(keysDir, 'public.pem')}`);

      const publicKeyPem = await exportPublicKey(keyPair.publicKey);
      const fingerprint = await generateFingerprint(publicKeyPem);
      logger.success(`Fingerprint: ${fingerprint.substring(0, 32)}`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.fail(`Error generating keys: ${errorMessage}`);
      process.exit(1);
    }
  });

const exportPublicCommand = new Command()
  .name('public')
  .description('Export public key in PEM format')
  .action(async () => {
    try {
      const keyPair = await loadKeyPair();
      const publicKeyPem = await exportPublicKey(keyPair.publicKey);
      logger.status(publicKeyPem);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.fail(`Error: ${errorMessage}`);
      process.exit(1);
    }
  });

const exportCommand = new Command()
  .name('export')
  .description('Export key in various formats')
  .action(() => {
    exportCommand.help();
  });

exportCommand.addCommand(exportPublicCommand);

const fingerprintCommand = new Command()
  .name('fingerprint')
  .description('Display public key fingerprint for verification')
  .action(async () => {
    try {
      const keyPair = await loadKeyPair();
      const publicKeyPem = await exportPublicKey(keyPair.publicKey);
      const fingerprint = await generateFingerprint(publicKeyPem);
      logger.status(`Fingerprint: ${fingerprint.substring(0, 32)}`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.fail(`Error: ${errorMessage}`);
      process.exit(1);
    }
  });

keysCommand.addCommand(generateCommand);
keysCommand.addCommand(exportCommand);
keysCommand.addCommand(fingerprintCommand);

export { keysCommand as default };
