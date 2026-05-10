import { StatusMessage } from "./schema.ts";
import type { StatusMessage as StatusMessageType } from "./schema.ts";
import { signMessage, verifyMessage, signatureToBase64, base64ToSignature } from "../crypto/signature.ts";
import { importPublicKey, exportPublicKey } from "../crypto/keys.ts";

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

  if (!message.serviceName || typeof message.serviceName !== "string") {
    return false;
  }

  if (message.state === undefined || message.state === null) {
    return false;
  }

  const validStates = [0, 1, 2, 3];
  if (!validStates.includes(message.state)) {
    return false;
  }

  if (!message.timestamp || typeof message.timestamp !== "number") {
    return false;
  }

  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;

  if (message.timestamp > now + twentyFourHours) {
    return false;
  }

  if (message.timestamp < now - twentyFourHours) {
    return false;
  }

  return true;
}

export async function createAndSignStatusMessage(
  data: Omit<StatusMessageType, "signature" | "publicKey">,
  keyPair: { privateKey: CryptoKey; publicKey: CryptoKey },
): Promise<StatusMessageType> {
  const { serviceName, state, timestamp, message } = data;

  const encoder = new TextEncoder();
  const payload =
    serviceName +
    state.toString() +
    timestamp.toString();
  const payloadBytes = encoder.encode(payload);

  const signature = await signMessage(payloadBytes, keyPair.privateKey);
  const signatureBase64 = signatureToBase64(signature);

  const publicKeyPem = await exportPublicKey(keyPair.publicKey);
  const publicKeyBytes = Buffer.from(
    publicKeyPem
      .replace("-----BEGIN PUBLIC KEY-----", "")
      .replace("-----END PUBLIC KEY-----", "")
      .replace(/\s/g, ""),
    'base64',
  );

  return {
    serviceName,
    state,
    timestamp,
    message,
    signature: signatureBase64,
    publicKey: publicKeyBytes,
  };
}

export async function encodeSignedStatusMessage(
  message: StatusMessageType,
): Promise<Uint8Array> {
  const isValid = validateStatusMessage(message);
  if (!isValid) {
    throw new Error("Invalid StatusMessage");
  }

  return encodeStatusMessage(message);
}

export async function decodeAndVerifyStatusMessage(
  bytes: Uint8Array,
  publicKeyPem: string,
): Promise<StatusMessageType | null> {
  const message = decodeStatusMessage(bytes);

  if (!message.signature || !message.publicKey) {
    return null;
  }

  const publicKey = await importPublicKey(publicKeyPem);

  const encoder = new TextEncoder();
  const payload =
    message.serviceName +
    message.state.toString() +
    message.timestamp.toString();
  const payloadBytes = encoder.encode(payload);

  const signature = base64ToSignature(message.signature);

  const isValid = await verifyMessage(payloadBytes, signature, publicKey);

  return isValid ? message : null;
}
