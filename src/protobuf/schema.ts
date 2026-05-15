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

const root = new protobuf.Root().define('dpulse').add(StatusMessageType);

export const StatusMessage = root.lookupType(
  'dpulse.StatusMessage',
) as unknown as Type;
