import { decodeHTML } from 'entities';
import { XMLParser } from 'fast-xml-parser';
import type { FeedBatch, FeedEntry, FeedImage } from '../protobuf/schema.js';
import type {
  AtomEntry,
  AtomFeed,
  AtomLink,
  AtomMediaContent,
} from './types.js';

function decodeHtmlEntities(str: string): string {
  return decodeHTML(str);
}

export async function fetchAtomFeed(
  url: string,
  timeoutMs = 30000,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch feed: ${response.status} ${response.statusText}`,
      );
    }
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function extractTextContent(
  content: string | { '#text': string } | undefined,
): string | undefined {
  if (!content) return undefined;
  if (typeof content === 'string') return content;
  return content['#text'];
}

function extractLink(link: AtomLink[] | AtomLink | undefined): string {
  if (!link) return '';
  const links = Array.isArray(link) ? link : [link];
  const alternate = links.find((l) => l['@_rel'] === 'alternate');
  return alternate?.['@_href'] ?? links[0]?.['@_href'] ?? '';
}

function extractImages(
  mediaContent: AtomMediaContent[] | AtomMediaContent | undefined,
): FeedImage[] {
  if (!mediaContent) return [];
  const items = Array.isArray(mediaContent) ? mediaContent : [mediaContent];
  return items
    .filter((item) => item['@_medium'] === 'image')
    .map((item) => ({
      url: item['@_url'],
      mimeType: item['@_type'],
    }));
}

export function parseAtomFeed(xml: string): FeedEntry[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
  });

  try {
    const parsed = parser.parse(xml) as AtomFeed;
    const rawEntries = parsed.feed?.entry;
    if (!rawEntries) return [];

    const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];

    return entries.slice(0, 20).map((entry: AtomEntry) => {
      const timestamp = entry.published
        ? new Date(entry.published).getTime()
        : entry.updated
          ? new Date(entry.updated).getTime()
          : undefined;
      const validatedTs =
        timestamp !== undefined && !Number.isNaN(timestamp)
          ? timestamp
          : undefined;

      const title = entry.title ? decodeHtmlEntities(entry.title) : '';
      const rawContent =
        extractTextContent(entry.content) ?? extractTextContent(entry.summary);
      const content = rawContent ? decodeHtmlEntities(rawContent) : undefined;

      return {
        id: entry.id,
        title,
        link: extractLink(entry.link),
        content,
        author: entry.author?.name,
        published: validatedTs,
        images: extractImages(entry['media:content']),
      };
    });
  } catch (error) {
    throw new Error(
      `Failed to parse Atom feed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function createFeedBatch(
  source: string,
  entries: FeedEntry[],
): Omit<FeedBatch, 'signature'> {
  return {
    source,
    fetchedAt: Date.now(),
    entries,
  };
}
