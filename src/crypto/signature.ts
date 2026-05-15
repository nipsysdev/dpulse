import * as crypto from 'node:crypto';

export async function signMessage(
  message: Uint8Array,
  privateKey: CryptoKey,
): Promise<Uint8Array> {
  const signature = await crypto.subtle.sign('Ed25519', privateKey, message);
  return new Uint8Array(signature);
}

export function signatureToBase64(signature: Uint8Array): string {
  let binary = '';
  const len = signature.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(signature[i]);
  }
  return btoa(binary);
}
