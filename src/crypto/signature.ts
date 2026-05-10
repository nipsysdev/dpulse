import * as crypto from "node:crypto";

export async function signMessage(message: Uint8Array, privateKey: CryptoKey): Promise<Uint8Array> {
  const signature = await crypto.subtle.sign("Ed25519", privateKey, message);
  return new Uint8Array(signature);
}

export async function signString(message: string, privateKey: CryptoKey): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const messageBytes = encoder.encode(message);
  return signMessage(messageBytes, privateKey);
}

export async function verifyMessage(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: CryptoKey,
): Promise<boolean> {
  try {
    const isValid = await crypto.subtle.verify("Ed25519", publicKey, signature, message);
    return isValid;
  } catch (_error) {
    return false;
  }
}

export async function verifyString(
  message: string,
  signature: Uint8Array,
  publicKey: CryptoKey,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const messageBytes = encoder.encode(message);
  return verifyMessage(messageBytes, signature, publicKey);
}

export function signatureToHex(signature: Uint8Array): string {
  return Array.from(signature)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToSignature(hex: string): Uint8Array {
  const hexLength = hex.length;
  const signature = new Uint8Array(hexLength / 2);
  for (let i = 0; i < hexLength; i += 2) {
    signature[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return signature;
}

export function signatureToBase64(signature: Uint8Array): string {
  let binary = "";
  const len = signature.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(signature[i]);
  }
  return btoa(binary);
}

export function base64ToSignature(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const signature = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    signature[i] = binaryString.charCodeAt(i);
  }
  return signature;
}
