import { describe, expect, it } from 'vitest';
import { generateKeyPair } from '../src/crypto/keys.js';
import {
  createAndSignStatusMessage,
  decodeStatusMessage,
  encodeStatusMessage,
  validateStatusMessage,
} from '../src/protobuf/codec.js';
import { ServiceState } from '../src/protobuf/schema.js';

describe('StatusMessage Protobuf', () => {
  it('should encode and decode a valid StatusMessage message', () => {
    const original = {
      serviceName: 'test-service',
      displayName: 'Test Service',
      description: 'A test service for demonstration',
      status: ServiceState.OPERATIONAL,
      timestamp: Date.now(),
      iconCid: 'bafkreie7ohywtosou76tasm7j63yigtzxe7d5zqus4zu3j6oltvgtibeom',
    };

    const encoded = encodeStatusMessage(original);
    const decoded = decodeStatusMessage(encoded);

    expect(decoded.serviceName).toBe(original.serviceName);
    expect(decoded.displayName).toBe(original.displayName);
    expect(decoded.description).toBe(original.description);
    expect(decoded.status).toBe(original.status);
    expect(decoded.timestamp).toBe(original.timestamp);
    expect(decoded.iconCid).toBe(original.iconCid);
  });

  it('should validate required fields', () => {
    const validMessage = {
      serviceName: 'test-service',
      displayName: 'Test Service',
      description: 'A test service for demonstration',
      status: ServiceState.OPERATIONAL,
      timestamp: Date.now(),
    };

    expect(validateStatusMessage(validMessage)).toBe(true);

    const invalidMessage1 = {
      serviceName: '',
      displayName: 'Test Service',
      description: 'A test service for demonstration',
      status: ServiceState.OPERATIONAL,
      timestamp: Date.now(),
    };

    expect(validateStatusMessage(invalidMessage1)).toBe(false);
  });

  it('should create and sign a StatusMessage message', async () => {
    const keyPair = await generateKeyPair();

    const data = {
      serviceName: 'test-service',
      displayName: 'Test Service',
      description: 'A test service for demonstration',
      status: ServiceState.OPERATIONAL,
      timestamp: Date.now(),
      iconCid: 'bafkreie7ohywtosou76tasm7j63yigtzxe7d5zqus4zu3j6oltvgtibeom',
    };

    const signedMessage = await createAndSignStatusMessage(data, keyPair);

    expect(signedMessage.serviceName).toBe(data.serviceName);
    expect(signedMessage.displayName).toBe(data.displayName);
    expect(signedMessage.description).toBe(data.description);
    expect(signedMessage.status).toBe(data.status);
    expect(signedMessage.timestamp).toBe(data.timestamp);
    expect(signedMessage.iconCid).toBe(data.iconCid);
    expect(typeof signedMessage.signature).toBe('string');
    expect(signedMessage.signature?.length).toBeGreaterThan(0);
  });

  it('should verify a signed StatusMessage message', async () => {
    const keyPair = await generateKeyPair();

    const data = {
      serviceName: 'test-service',
      displayName: 'Test Service',
      description: 'A test service for demonstration',
      status: ServiceState.OPERATIONAL,
      timestamp: Date.now(),
      iconCid: 'bafkreie7ohywtosou76tasm7j63yigtzxe7d5zqus4zu3j6oltvgtibeom',
    };

    const signedMessage = await createAndSignStatusMessage(data, keyPair);

    expect(signedMessage.serviceName).toBe(data.serviceName);
    expect(signedMessage.displayName).toBe(data.displayName);
    expect(signedMessage.description).toBe(data.description);
    expect(signedMessage.status).toBe(data.status);
    expect(signedMessage.iconCid).toBe(data.iconCid);
    expect(typeof signedMessage.signature).toBe('string');
  });
});
