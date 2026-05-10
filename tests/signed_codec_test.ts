import {
  createAndSignStatusMessage,
  encodeSignedStatusMessage,
  decodeAndVerifyStatusMessage,
} from "../src/protobuf/codec.ts";
import { ServiceState } from "../src/protobuf/schema.ts";
import { generateKeyPair, exportPublicKey } from "../src/crypto/keys.ts";
import { assertEquals, assertExists, assertIsNull } from "@std/testing/asserts";

Deno.test("createAndSignStatusMessage should create and sign a message", async () => {
  const keyPair = await generateKeyPair();

  const data = {
    serviceName: "test-service",
    state: ServiceState.OPERATIONAL,
    timestamp: Date.now(),
    message: "All systems operational",
  };

  const signedMessage = await createAndSignStatusMessage(data, keyPair);

  assertExists(signedMessage.signature);
  assertExists(signedMessage.publicKey);
  assertEquals(signedMessage.serviceName, data.serviceName);
  assertEquals(signedMessage.state, data.state);
  assertEquals(signedMessage.timestamp, data.timestamp);
  assertEquals(signedMessage.message, data.message);
});

Deno.test("encodeSignedStatusMessage should validate and encode", async () => {
  const keyPair = await generateKeyPair();

  const data = {
    serviceName: "test-service",
    state: ServiceState.OPERATIONAL,
    timestamp: Date.now(),
  };

  const signedMessage = await createAndSignStatusMessage(data, keyPair);
  const encoded = await encodeSignedStatusMessage(signedMessage);

  assertEquals(encoded instanceof Uint8Array, true);
  assertEquals(encoded.length > 0, true);
});

Deno.test("decodeAndVerifyStatusMessage should verify correct signature", async () => {
  const keyPair = await generateKeyPair();
  const publicKeyPem = await exportPublicKey(keyPair.publicKey);

  const data = {
    serviceName: "test-service",
    state: ServiceState.OPERATIONAL,
    timestamp: Date.now(),
    message: "All systems operational",
  };

  const signedMessage = await createAndSignStatusMessage(data, keyPair);
  const encoded = await encodeSignedStatusMessage(signedMessage);

  const decoded = await decodeAndVerifyStatusMessage(encoded, publicKeyPem);

  assertExists(decoded);
  assertEquals(decoded?.serviceName, data.serviceName);
  assertEquals(decoded?.state, data.state);
  assertEquals(decoded?.message, data.message);
});

Deno.test("decodeAndVerifyStatusMessage should reject wrong public key", async () => {
  const keyPair = await generateKeyPair();
  const wrongKeyPair = await generateKeyPair();
  const wrongPublicKeyPem = await exportPublicKey(wrongKeyPair.publicKey);

  const data = {
    serviceName: "test-service",
    state: ServiceState.OPERATIONAL,
    timestamp: Date.now(),
  };

  const signedMessage = await createAndSignStatusMessage(data, keyPair);
  const encoded = await encodeSignedStatusMessage(signedMessage);

  const decoded = await decodeAndVerifyStatusMessage(encoded, wrongPublicKeyPem);

  assertIsNull(decoded);
});

Deno.test("decodeAndVerifyStatusMessage should reject missing signature", async () => {
  const keyPair = await generateKeyPair();
  const publicKeyPem = await exportPublicKey(keyPair.publicKey);

  const data = {
    serviceName: "test-service",
    state: ServiceState.OPERATIONAL,
    timestamp: Date.now(),
    message: "test",
    signature: undefined,
    publicKey: new Uint8Array([]),
  };

  const encoded = await encodeSignedStatusMessage(data);
  const decoded = await decodeAndVerifyStatusMessage(encoded, publicKeyPem);

  assertIsNull(decoded);
});
