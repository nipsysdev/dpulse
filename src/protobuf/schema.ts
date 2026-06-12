import type { Type } from 'protobufjs';
import protobuf from 'protobufjs';

export enum ServiceState {
  OPERATIONAL = 0,
  DEGRADED = 1,
  DOWN = 2,
}

export interface StatusMessage {
  serviceName: string;
  displayName: string;
  description: string;
  status: ServiceState;
  timestamp: number;
  iconCid?: string;
  signature?: string;
}

export interface FeedImage {
  url: string;
  mimeType: string;
}

export interface FeedEntry {
  id: string;
  title: string;
  link: string;
  content?: string;
  author?: string;
  published?: number;
  images: FeedImage[];
}

export interface FeedBatch {
  source: string;
  fetchedAt: number;
  entries: FeedEntry[];
  signature?: string;
}

const StatusMessageType = new protobuf.Type('StatusMessage')
  .add(
    new protobuf.Enum('ServiceState', {
      OPERATIONAL: 0,
      DEGRADED: 1,
      DOWN: 2,
    }),
  )
  .add(new protobuf.Field('serviceName', 1, 'string'))
  .add(new protobuf.Field('displayName', 2, 'string'))
  .add(new protobuf.Field('description', 3, 'string'))
  .add(new protobuf.Field('status', 4, 'ServiceState'))
  .add(new protobuf.Field('timestamp', 5, 'int64'))
  .add(new protobuf.Field('iconCid', 6, 'string', 'optional'))
  .add(new protobuf.Field('signature', 7, 'string', 'optional'));

const FeedImageType = new protobuf.Type('FeedImage')
  .add(new protobuf.Field('url', 1, 'string'))
  .add(new protobuf.Field('mimeType', 2, 'string'));

const FeedEntryType = new protobuf.Type('FeedEntry')
  .add(new protobuf.Field('id', 1, 'string'))
  .add(new protobuf.Field('title', 2, 'string'))
  .add(new protobuf.Field('link', 3, 'string'))
  .add(new protobuf.Field('content', 4, 'string', 'optional'))
  .add(new protobuf.Field('author', 5, 'string', 'optional'))
  .add(new protobuf.Field('published', 6, 'int64', 'optional'))
  .add(new protobuf.Field('images', 7, 'FeedImage', 'repeated'));

const FeedBatchType = new protobuf.Type('FeedBatch')
  .add(new protobuf.Field('source', 1, 'string'))
  .add(new protobuf.Field('fetchedAt', 2, 'int64'))
  .add(new protobuf.Field('entries', 3, 'FeedEntry', 'repeated'))
  .add(new protobuf.Field('signature', 4, 'string', 'optional'));

const root = new protobuf.Root()
  .define('dpulse')
  .add(StatusMessageType)
  .add(FeedImageType)
  .add(FeedEntryType)
  .add(FeedBatchType);

export const StatusMessage = root.lookupType(
  'dpulse.StatusMessage',
) as unknown as Type;

export const FeedBatch = root.lookupType('dpulse.FeedBatch') as unknown as Type;
