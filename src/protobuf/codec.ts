import { signatureToBase64, signMessage } from '../crypto/signature.ts';
import type { StatusMessage as StatusMessageType } from './schema.ts';
import { StatusMessage } from './schema.ts';

export function encodeStatusMessage(message: StatusMessageType): Uint8Array {
  const errMsg = StatusMessage.verify(message);
  if (errMsg) {
    throw new Error(`Invalid StatusMessage: ${errMsg}`);
  }

  const encoded = StatusMessage.encode(message).finish();
  return encoded;
}

export function decodeStatusMessage(bytes: Uint8Array): StatusMessageType {
  const decoded = StatusMessage.decode(bytes);
  return StatusMessage.toObject(decoded, {
    longs: Number,
    enums: Number,
    bytes: Uint8Array,
  }) as unknown as StatusMessageType;
}

export function validateStatusMessage(message: StatusMessageType): boolean {
  const errMsg = StatusMessage.verify(message);
  if (errMsg) {
    return false;
  }

  if (!message.serviceName || typeof message.serviceName !== 'string') {
    return false;
  }

  if (!message.displayName || typeof message.displayName !== 'string') {
    return false;
  }

  if (!message.description || typeof message.description !== 'string') {
    return false;
  }

  if (message.status === undefined || message.status === null) {
    return false;
  }

  const validStates = [0, 1, 2];
  if (!validStates.includes(message.status)) {
    return false;
  }

  if (!message.timestamp || typeof message.timestamp !== 'number') {
    return false;
  }

  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  if (message.timestamp > now + oneHour) {
    return false;
  }

  if (message.timestamp < now - oneHour) {
    return false;
  }

  return true;
}

export async function createAndSignStatusMessage(
  data: Omit<StatusMessageType, 'signature'>,
  keyPair: { privateKey: CryptoKey; publicKey: CryptoKey },
): Promise<StatusMessageType> {
  const { serviceName, displayName, description, status, timestamp, iconCid } =
    data;

  const encoder = new TextEncoder();
  const payload =
    serviceName +
    displayName +
    description +
    status.toString() +
    timestamp.toString();
  const payloadBytes = encoder.encode(payload);

  const signature = await signMessage(payloadBytes, keyPair.privateKey);
  const signatureBase64 = signatureToBase64(signature);

  return {
    serviceName,
    displayName,
    description,
    status,
    timestamp,
    iconCid,
    signature: signatureBase64,
  };
}

export async function encodeSignedStatusMessage(
  message: StatusMessageType,
): Promise<Uint8Array> {
  const isValid = validateStatusMessage(message);
  if (!isValid) {
    throw new Error('Invalid StatusMessage');
  }

  return encodeStatusMessage(message);
}
