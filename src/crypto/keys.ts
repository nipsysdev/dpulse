import * as fs from "node:fs/promises";

export interface KeyPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

const PRIVATE_KEY_HEADER = "-----BEGIN PRIVATE KEY-----";
const PRIVATE_KEY_FOOTER = "-----END PRIVATE KEY-----";
const PUBLIC_KEY_HEADER = "-----BEGIN PUBLIC KEY-----";
const PUBLIC_KEY_FOOTER = "-----END PUBLIC KEY-----";

export async function generateKeyPair(): Promise<KeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "Ed25519",
    },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;

  return {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
  };
}

export async function exportPrivateKey(privateKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey("pkcs8", privateKey);
  const exportedAsString = ab2str(exported);
  const exportedAsBase64 = btoa(exportedAsString);
  
  return `${PRIVATE_KEY_HEADER}\n${exportedAsBase64}\n${PRIVATE_KEY_FOOTER}`;
}

export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey("spki", publicKey);
  const exportedAsString = ab2str(exported);
  const exportedAsBase64 = btoa(exportedAsString);
  
  return `${PUBLIC_KEY_HEADER}\n${exportedAsBase64}\n${PUBLIC_KEY_FOOTER}`;
}

export async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const binaryDer = pemToArrayBuffer(pem, PRIVATE_KEY_HEADER, PRIVATE_KEY_FOOTER);
  
  return await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    {
      name: "Ed25519",
    },
    true,
    ["sign"],
  );
}

export async function importPublicKey(pem: string): Promise<CryptoKey> {
  const binaryDer = pemToArrayBuffer(pem, PUBLIC_KEY_HEADER, PUBLIC_KEY_FOOTER);
  
  return await crypto.subtle.importKey(
    "spki",
    binaryDer,
    {
      name: "Ed25519",
    },
    true,
    ["verify"],
  );
}

export async function saveKeyPair(keyPair: KeyPair, dir: string): Promise<void> {
  const privateKeyPem = await exportPrivateKey(keyPair.privateKey);
  const publicKeyPem = await exportPublicKey(keyPair.publicKey);
  
  const privateKeyPath = `${dir}/private.pem`;
  const publicKeyPath = `${dir}/public.pem`;
  
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(privateKeyPath, privateKeyPem);
  await fs.writeFile(publicKeyPath, publicKeyPem);
}

export async function loadKeyPair(dir: string): Promise<KeyPair> {
  const privateKeyPath = `${dir}/private.pem`;
  const publicKeyPath = `${dir}/public.pem`;
  
  const privateKeyPem = await fs.readFile(privateKeyPath, "utf-8");
  const publicKeyPem = await fs.readFile(publicKeyPath, "utf-8");
  
  const privateKey = await importPrivateKey(privateKeyPem);
  const publicKey = await importPublicKey(publicKeyPem);
  
  return {
    privateKey,
    publicKey,
  };
}

export async function keysExist(dir: string): Promise<boolean> {
  const privateKeyPath = `${dir}/private.pem`;
  const publicKeyPath = `${dir}/public.pem`;
  
  const privateExists = await fileExists(privateKeyPath);
  const publicExists = await fileExists(publicKeyPath);
  
  return privateExists && publicExists;
}

function ab2str(buf: ArrayBuffer): string {
  return String.fromCharCode.apply(null, Array.from(new Uint8Array(buf)));
}

function str2ab(str: string): ArrayBuffer {
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i);
  }
  return buf;
}

function pemToArrayBuffer(pem: string, header: string, footer: string): ArrayBuffer {
  const pemHeader = header;
  const pemFooter = footer;
  const pemContents = pem.substring(
    pem.indexOf(pemHeader) + pemHeader.length,
    pem.lastIndexOf(pemFooter),
  ).trim();
  
  const binaryDerString = atob(pemContents);
  return str2ab(binaryDerString);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}
