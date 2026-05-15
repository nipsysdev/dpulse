import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { KeyPair } from '../../src/crypto/keys.js';
import {
  ensureKeysDirectory,
  exportPublicKey,
  generateKeyPair,
  getKeysPath,
  keysExist,
  loadKeyPair,
  saveKeyPair,
} from '../../src/crypto/keys.js';

describe('Key Management', () => {
  let tempConfigDir: string;
  let tempProjectDir: string;
  let originalConfigHome: string | undefined;
  let originalCwd: string;

  beforeEach(() => {
    tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dpulse-config-'));
    tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dpulse-project-'));
    originalConfigHome = process.env.XDG_CONFIG_HOME;
    originalCwd = process.cwd();
    process.env.XDG_CONFIG_HOME = tempConfigDir;
    process.chdir(tempProjectDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalConfigHome !== undefined) {
      process.env.XDG_CONFIG_HOME = originalConfigHome;
    } else {
      delete process.env.XDG_CONFIG_HOME;
    }
    if (fs.existsSync(tempConfigDir)) {
      fs.rmSync(tempConfigDir, { recursive: true, force: true });
    }
    if (fs.existsSync(tempProjectDir)) {
      fs.rmSync(tempProjectDir, { recursive: true, force: true });
    }
  });

  describe('Keys directory location', () => {
    it('should return correct keys path in config directory', () => {
      const keysPath = getKeysPath();
      expect(keysPath).toContain('dpulse');
      expect(keysPath).toContain('keys');
    });

    it('should create keys directory automatically', () => {
      const keysDir = ensureKeysDirectory();
      expect(fs.existsSync(keysDir)).toBe(true);
      expect(keysDir).toContain('keys');
      expect(fs.readdirSync(keysDir).length).toBe(0);
    });
  });

  describe('Key generation and storage', () => {
    it('should generate keys in correct location', async () => {
      const keyPair: KeyPair = await generateKeyPair();
      await saveKeyPair(keyPair);

      const keysPath = getKeysPath();
      const privateKeyPath = path.join(keysPath, 'private.pem');
      const publicKeyPath = path.join(keysPath, 'public.pem');

      expect(fs.existsSync(privateKeyPath)).toBe(true);
      expect(fs.existsSync(publicKeyPath)).toBe(true);
    });

    it('should save keys with correct PEM format', async () => {
      const keyPair: KeyPair = await generateKeyPair();
      await saveKeyPair(keyPair);

      const keysPath = getKeysPath();
      const privateKeyContent = fs.readFileSync(
        path.join(keysPath, 'private.pem'),
        'utf-8',
      );
      const publicKeyContent = fs.readFileSync(
        path.join(keysPath, 'public.pem'),
        'utf-8',
      );

      expect(privateKeyContent).toContain('-----BEGIN PRIVATE KEY-----');
      expect(privateKeyContent).toContain('-----END PRIVATE KEY-----');
      expect(publicKeyContent).toContain('-----BEGIN PUBLIC KEY-----');
      expect(publicKeyContent).toContain('-----END PUBLIC KEY-----');
    });

    it('should read keys from new location', async () => {
      const originalKeyPair: KeyPair = await generateKeyPair();
      await saveKeyPair(originalKeyPair);

      const loadedKeyPair: KeyPair = await loadKeyPair();

      const originalPublicKeyPem = await exportPublicKey(
        originalKeyPair.publicKey,
      );
      const loadedPublicKeyPem = await exportPublicKey(loadedKeyPair.publicKey);

      expect(loadedPublicKeyPem).toBe(originalPublicKeyPem);
    });

    it('should detect key existence in new location', async () => {
      const keyPair: KeyPair = await generateKeyPair();

      expect(await keysExist()).toBe(false);

      await saveKeyPair(keyPair);
      expect(await keysExist()).toBe(true);
    });
  });

  describe('Backward compatibility', () => {
    it('should fallback to ./keys/ directory if keys exist there', async () => {
      const localKeysDir = path.join(tempProjectDir, 'keys');
      fs.mkdirSync(localKeysDir, { recursive: true });

      const originalKeyPair: KeyPair = await generateKeyPair();
      await saveKeyPair(originalKeyPair, localKeysDir);

      expect(await keysExist()).toBe(true);

      const loadedKeyPair: KeyPair = await loadKeyPair();
      const originalPublicKeyPem = await exportPublicKey(
        originalKeyPair.publicKey,
      );
      const loadedPublicKeyPem = await exportPublicKey(loadedKeyPair.publicKey);

      expect(loadedPublicKeyPem).toBe(originalPublicKeyPem);
    });

    it('should prefer new location over ./keys/ when both exist', async () => {
      const localKeysDir = path.join(tempProjectDir, 'keys');
      fs.mkdirSync(localKeysDir, { recursive: true });

      const localKeyPair: KeyPair = await generateKeyPair();
      await saveKeyPair(localKeyPair, localKeysDir);

      const systemKeyPair: KeyPair = await generateKeyPair();
      await saveKeyPair(systemKeyPair);

      const loadedKeyPair: KeyPair = await loadKeyPair();
      const loadedPublicKeyPem = await exportPublicKey(loadedKeyPair.publicKey);
      const systemPublicKeyPem = await exportPublicKey(systemKeyPair.publicKey);
      const localPublicKeyPem = await exportPublicKey(localKeyPair.publicKey);

      expect(loadedPublicKeyPem).toBe(systemPublicKeyPem);
      expect(loadedPublicKeyPem).not.toBe(localPublicKeyPem);
    });

    it('should create directory structure when saving to new location', async () => {
      const keysPath = getKeysPath();
      expect(fs.existsSync(keysPath)).toBe(false);

      const keyPair: KeyPair = await generateKeyPair();
      await saveKeyPair(keyPair);

      expect(fs.existsSync(keysPath)).toBe(true);
    });
  });

  describe('Key operations', () => {
    it('should load only keys that exist together', async () => {
      const keysPath = getKeysPath();
      fs.mkdirSync(keysPath, { recursive: true });
      fs.writeFileSync(path.join(keysPath, 'private.pem'), 'invalid');

      expect(await keysExist()).toBe(false);
      await expect(loadKeyPair()).rejects.toThrow();
    });

    it('should export public key in correct format', async () => {
      const keyPair: KeyPair = await generateKeyPair();
      const publicKeyPem = await exportPublicKey(keyPair.publicKey);

      expect(publicKeyPem).toContain('-----BEGIN PUBLIC KEY-----');
      expect(publicKeyPem).toContain('-----END PUBLIC KEY-----');
      expect(publicKeyPem.split('\n').length).toBeGreaterThan(2);
    });

    it('should generate different key pairs each time', async () => {
      const keyPair1: KeyPair = await generateKeyPair();
      const keyPair2: KeyPair = await generateKeyPair();

      const publicKeyPem1 = await exportPublicKey(keyPair1.publicKey);
      const publicKeyPem2 = await exportPublicKey(keyPair2.publicKey);

      expect(publicKeyPem1).not.toBe(publicKeyPem2);
    });
  });

  describe('Directory structure creation', () => {
    it('should create nested directory structure automatically', async () => {
      const testConfigHome = path.join(os.tmpdir(), 'dpulse-test-config');
      process.env.XDG_CONFIG_HOME = testConfigHome;

      const keysDir = ensureKeysDirectory();
      const expectedPath = path.join(testConfigHome, 'dpulse', 'keys');

      expect(keysDir).toBe(expectedPath);
      expect(fs.existsSync(expectedPath)).toBe(true);

      if (fs.existsSync(testConfigHome)) {
        fs.rmSync(testConfigHome, { recursive: true, force: true });
      }
    });

    it('should not error if directory already exists', async () => {
      ensureKeysDirectory();
      expect(() => ensureKeysDirectory()).not.toThrow();
    });
  });
});
