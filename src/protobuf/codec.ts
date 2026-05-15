import { signatureToBase64, signMessage } from '../crypto/signature.js';
import { debug, error as logError } from '../utils/logger.js';
import type { StatusMessage as StatusMessageType } from './schema.js';
import { StatusMessage } from './schema.js';

export function encodeStatusMessage(message: StatusMessageType): Uint8Array {
  debug('Encoding StatusMessage to protobuf', {
    serviceName: message.serviceName,
    status: message.status,
    timestamp: message.timestamp,
    hasSignature: !!message.signature,
  });

  const errMsg = StatusMessage.verify(message);
  if (errMsg) {
    logError('StatusMessage verification failed', {
      serviceName: message.serviceName,
      validationError: errMsg,
      message,
    });
    throw new Error(`Invalid StatusMessage: ${errMsg}`);
  }

  const encoded = StatusMessage.encode(message).finish();

  debug('StatusMessage encoded successfully', {
    serviceName: message.serviceName,
    encodedSize: encoded.length,
  });

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

  debug('Creating and signing StatusMessage', {
    serviceName,
    displayName,
    status,
    timestamp,
  });

  const encoder = new TextEncoder();
  const payload =
    serviceName +
    displayName +
    description +
    status.toString() +
    timestamp.toString();
  const payloadBytes = encoder.encode(payload);

  debug('Signing message payload', {
    serviceName,
    payloadSize: payloadBytes.length,
  });

  const signature = await signMessage(payloadBytes, keyPair.privateKey);
  const signatureBase64 = signatureToBase64(signature);

  debug('Message signed successfully', {
    serviceName,
    signatureLength: signatureBase64.length,
  });

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
  debug('Validating and encoding signed StatusMessage', {
    serviceName: message.serviceName,
    hasSignature: !!message.signature,
  });

  const isValid = validateStatusMessage(message);
  if (!isValid) {
    logError('Signed message validation failed', {
      serviceName: message.serviceName,
      message,
    });
    throw new Error('Invalid StatusMessage');
  }

  debug('Signed message validation passed, encoding...', {
    serviceName: message.serviceName,
  });

  return encodeStatusMessage(message);
}
