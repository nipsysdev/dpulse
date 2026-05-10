import protobuf from "protobufjs";
import type { Type } from "protobufjs";

export enum ServiceState {
  UNKNOWN = 0,
  OPERATIONAL = 1,
  DEGRADED = 2,
  DOWN = 3,
}

export interface StatusMessage {
  serviceName: string;
  state: ServiceState;
  timestamp: number;
  message?: string;
  signature?: string;
  publicKey?: Uint8Array;
}

const StatusMessageType = new protobuf.Type("StatusMessage")
  .add(new protobuf.Field("serviceName", 1, "string"))
  .add(new protobuf.Enum("ServiceState", {
    UNKNOWN: 0,
    OPERATIONAL: 1,
    DEGRADED: 2,
    DOWN: 3,
  }))
  .add(new protobuf.Field("state", 2, "ServiceState", "optional"))
  .add(new protobuf.Field("timestamp", 3, "int64", "optional"))
  .add(new protobuf.Field("message", 4, "string", "optional"))
  .add(new protobuf.Field("signature", 5, "string", "optional"))
  .add(new protobuf.Field("publicKey", 6, "bytes", "optional"));

const root = new protobuf.Root()
  .define("dpulse")
  .add(StatusMessageType);

export const StatusMessage = root.lookupType("dpulse.StatusMessage") as unknown as Type;
