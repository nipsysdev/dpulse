import { encodeStatusMessage, decodeStatusMessage, validateStatusMessage } from "../src/protobuf/codec.ts";
import { ServiceState } from "../src/protobuf/schema.ts";
import { assertEquals, assertThrows } from "@std/testing/asserts";

Deno.test("encodeStatusMessage should encode a valid message", () => {
  const message = {
    serviceName: "test-service",
    state: ServiceState.OPERATIONAL,
    timestamp: Date.now(),
    message: "All systems operational",
    signature: "test-signature",
    publicKey: new Uint8Array([1, 2, 3]),
  };

  const encoded = encodeStatusMessage(message);
  assertEquals(encoded instanceof Uint8Array, true);
  assertEquals(encoded.length > 0, true);
});

Deno.test("decodeStatusMessage should decode a valid message", () => {
  const original = {
    serviceName: "test-service",
    state: ServiceState.OPERATIONAL,
    timestamp: Date.now(),
    message: "All systems operational",
  };

  const encoded = encodeStatusMessage(original);
  const decoded = decodeStatusMessage(encoded);

  assertEquals(decoded.serviceName, original.serviceName);
  assertEquals(decoded.state, original.state);
  assertEquals(decoded.timestamp, original.timestamp);
  assertEquals(decoded.message, original.message);
});

Deno.test("validateStatusMessage should validate required fields", () => {
  const validMessage = {
    serviceName: "test-service",
    state: ServiceState.OPERATIONAL,
    timestamp: Date.now(),
  };

  assertEquals(validateStatusMessage(validMessage), true);

  const invalidMessage1 = {
    serviceName: "",
    state: ServiceState.OPERATIONAL,
    timestamp: Date.now(),
  };

  assertEquals(validateStatusMessage(invalidMessage1), false);

  const invalidMessage2 = {
    serviceName: "test-service",
    state: ServiceState.OPERATIONAL,
    timestamp: undefined as unknown as number,
  };

  assertEquals(validateStatusMessage(invalidMessage2), false);
});

Deno.test("validateStatusMessage should validate timestamp", () => {
  const now = Date.now();
  const validMessage = {
    serviceName: "test-service",
    state: ServiceState.OPERATIONAL,
    timestamp: now,
  };

  assertEquals(validateStatusMessage(validMessage), true);

  const oldMessage = {
    serviceName: "test-service",
    state: ServiceState.OPERATIONAL,
    timestamp: now - 10 * 60 * 1000,
  };

  assertEquals(validateStatusMessage(oldMessage), false);

  const futureMessage = {
    serviceName: "test-service",
    state: ServiceState.OPERATIONAL,
    timestamp: now + 10 * 60 * 1000,
  };

  assertEquals(validateStatusMessage(futureMessage), false);
});

Deno.test("encodeStatusMessage should throw on invalid message", () => {
  const invalidMessage = {
    serviceName: 123 as unknown as string,
    state: ServiceState.OPERATIONAL,
    timestamp: Date.now(),
  };

  assertThrows(
    () => encodeStatusMessage(invalidMessage),
    Error,
    "Invalid StatusMessage"
  );
});
