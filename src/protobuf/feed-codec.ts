import { signatureToBase64, signMessage } from '../crypto/signature.js';
import type { FeedBatch, FeedEntry, FeedImage } from './schema.js';
import { FeedBatch as FeedBatchType } from './schema.js';

export function encodeFeedBatch(batch: FeedBatch): Uint8Array {
  const errMsg = FeedBatchType.verify(batch);
  if (errMsg) throw new Error(`Invalid FeedBatch: ${errMsg}`);
  return FeedBatchType.encode(batch).finish();
}

function serializeEntryForSigning(entry: FeedEntry): string {
  const imagesStr = entry.images
    .map((img: FeedImage) => `${img.url}:${img.mimeType}`)
    .join(',');
  return `${entry.id}:${entry.title}:${entry.link}:${entry.content || ''}:${entry.author || ''}:${entry.published?.toString() || ''}:${imagesStr}`;
}

export async function createAndSignFeedBatch(
  batch: Omit<FeedBatch, 'signature'>,
  keyPair: { privateKey: CryptoKey; publicKey: CryptoKey },
): Promise<FeedBatch> {
  const { source, entries, fetchedAt } = batch;
  const encoder = new TextEncoder();
  const entriesStr = entries.map(serializeEntryForSigning).join('|');
  const payload = `${source}:${entriesStr}:${fetchedAt.toString()}`;
  const payloadBytes = encoder.encode(payload);
  const signature = await signMessage(payloadBytes, keyPair.privateKey);
  const signatureBase64 = signatureToBase64(signature);

  return {
    source,
    entries,
    fetchedAt,
    signature: signatureBase64,
  };
}
