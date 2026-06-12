export interface AtomLink {
  '@_rel': string;
  '@_href': string;
}

export interface AtomMediaContent {
  '@_url': string;
  '@_type': string;
  '@_medium': string;
}

interface AtomAuthor {
  name: string;
  uri: string;
}

export interface AtomEntry {
  id: string;
  title: string;
  updated: string;
  published?: string;
  author?: AtomAuthor;
  content?: string | { '#text': string };
  summary?: string | { '#text': string };
  link?: AtomLink[] | AtomLink;
  'media:content'?: AtomMediaContent[] | AtomMediaContent;
}

export interface AtomFeed {
  feed: {
    entry: AtomEntry[] | AtomEntry;
  };
}
