import { Command } from "commander";
import inquirer from 'inquirer';
import * as fs from "node:fs/promises";
import { generateKeyPair, saveKeyPair, loadKeyPair, keysExist, exportPublicKey } from "../crypto/keys.ts";

const KEYS_DIR = "./keys";

function pemToArrayBuffer(pem: string, header: string, footer: string): ArrayBuffer {
  const pemContents = pem.substring(
    pem.indexOf(header) + header.length,
    pem.lastIndexOf(footer),
  ).trim();

  const binaryDerString = atob(pemContents);
  const buf = new ArrayBuffer(binaryDerString.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0; i < binaryDerString.length; i++) {
    bufView[i] = binaryDerString.charCodeAt(i);
  }
  return buf;
}

const PUBLIC_KEY_HEADER = "-----BEGIN PUBLIC KEY-----";
const PUBLIC_KEY_FOOTER = "-----END PUBLIC KEY-----";

export async function generateFingerprint(publicKeyPem: string): Promise<string> {
  const publicKeyBytes = pemToArrayBuffer(publicKeyPem, PUBLIC_KEY_HEADER, PUBLIC_KEY_FOOTER);
  const hashBuffer = await crypto.subtle.digest("SHA-256", publicKeyBytes);
  const hashArray = new Uint8Array(hashBuffer);
  const fingerprint = Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return fingerprint;
}

const keysCommand = new Command()
  .name("keys")
  .description("Manage cryptographic keys")
  .action(() => {
    keysCommand.help();
  });

const generateCommand = new Command()
  .name("generate")
  .description("Generate new Ed25519 key pair")
  .action(async () => {
    try {
      const keysAlreadyExist = await keysExist(KEYS_DIR);

      if (keysAlreadyExist) {
        const confirm = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: 'Keys already exist. Overwrite?',
            default: false,
          }
        ]);

        if (!confirm.overwrite) {
          console.log("Operation cancelled.");
          process.exit(0);
        }
      }

      const keyPair = await generateKeyPair();
      await saveKeyPair(keyPair, KEYS_DIR);

      console.log("✓ Key pair generated successfully");
      console.log(`✓ Private key: ${KEYS_DIR}/private.pem`);
      console.log(`✓ Public key: ${KEYS_DIR}/public.pem`);

      const publicKeyPem = await exportPublicKey(keyPair.publicKey);
      const fingerprint = await generateFingerprint(publicKeyPem);
      console.log(`✓ Fingerprint: ${fingerprint.substring(0, 32)}`);
    } catch (error: any) {
      console.error(`✗ Error generating keys: ${error.message}`);
      process.exit(1);
    }
  });

const exportPublicCommand = new Command()
  .name("public")
  .description("Export public key in PEM format")
  .action(async () => {
    try {
      const keyPair = await loadKeyPair(KEYS_DIR);
      const publicKeyPem = await exportPublicKey(keyPair.publicKey);
      console.log(publicKeyPem);
    } catch (error: any) {
      console.error(`✗ Error: ${error.message}`);
      process.exit(1);
    }
  });

const exportCommand = new Command()
  .name("export")
  .description("Export key in various formats")
  .action(() => {
    exportCommand.help();
  });

exportCommand.addCommand(exportPublicCommand);

const fingerprintCommand = new Command()
  .name("fingerprint")
  .description("Display public key fingerprint for verification")
  .action(async () => {
    try {
      const publicKeyPath = `${KEYS_DIR}/public.pem`;
      const publicKeyPem = await fs.readFile(publicKeyPath, "utf-8");
      const fingerprint = await generateFingerprint(publicKeyPem);
      console.log(`Fingerprint: ${fingerprint.substring(0, 32)}`);
    } catch (error: any) {
      console.error(`✗ Error: ${error.message}`);
      process.exit(1);
    }
  });

keysCommand.addCommand(generateCommand);
keysCommand.addCommand(exportCommand);
keysCommand.addCommand(fingerprintCommand);

export { keysCommand as default, generateCommand, exportCommand, exportPublicCommand, fingerprintCommand };
