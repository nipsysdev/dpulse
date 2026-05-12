# dpulse Review Findings

**Project:** dpulse — Decentralized Service Health Monitor  
**Commit:** fafe353 (feature/initialisation-plan)  
**Date:** 2026-05-11  
**Review Date:** 2026-05-11

---

## Critical Issues (Must Fix Before Production)

### 1. Test Infrastructure Broken

**Severity:** 🔴 CRITICAL  
**Location:** `package.json`, `tests/` directory

**Issue:**
- Tests use Deno framework (`@std/testing/asserts`, `Deno.test()`)
- Package.json configures Vitest but it's not installed
- No `vitest.config.ts` exists
- Zero tests can execute; validation impossible

**Evidence:**
```typescript
// tests/protobuf_test.ts
import { assertEquals } from "@std/testing/asserts";
Deno.test("encodes status message", ...);  // ← Deno syntax
```

```json
// package.json
{
  "scripts": {
    "test": "vitest"  // ← Referenced but not in devDependencies
  }
}
```

**Impact:**
- Cannot verify code quality
- No regression protection
- Zero confidence in deployment

**Fix:**
1. Install Vitest: `pnpm add -D vitest @vitest/coverage-v8`
2. Create `vitest.config.ts`:
   ```typescript
   import { defineConfig } from 'vitest/config';
   export default defineConfig({
     test: {
       environment: 'node',
     },
   });
   ```
3. Migrate Deno tests to Vitest syntax:
   ```typescript
   import { expect, test } from 'vitest';

   test('encodes status message', () => {
     expect(encoded).toBeDefined();
   });
   ```

---

### 2. Keys Marked Extractable — Security Vulnerability

**Severity:** 🔴 CRITICAL  
**Location:** `src/crypto/keys.ts` (lines 18, 53, 67)

**Issue:**
All Ed25519 keys generated and imported with `extractable: true`, allowing Web Crypto API to export raw private key material.

```typescript
// src/crypto/keys.ts:14-20
const keyPair = await crypto.subtle.generateKey(
  { name: "Ed25519" },
  true,  // ← CRITICAL: extractable = true
  ["sign", "verify"]
);
```

**Impact:**
- Private key material can be extracted by malicious code in the same process
- Compromises Ed25519 signing security fundamentally
- Violates principle that private keys should never be extractable

**Fix:**
```typescript
// Set extractable to false
const keyPair = await crypto.subtle.generateKey(
  { name: "Ed25519" },
  false,  // Private key cannot be extracted
  ["sign", "verify"]
);

// Import with extractable: false
await crypto.subtle.importKey(
  "pkcs8", 
  binaryDer, 
  { name: "Ed25519" }, 
  false,  // ← extractable: false
  ["sign"]
);
```

**Trade-off:** Keys must be re-imported from PEM files for signing (export once at creation only).

---

### 3. Insecure Private Key Permissions

**Severity:** 🔴 CRITICAL  
**Location:** `src/crypto/keys.ts` (line 80)

**Issue:**
Private key files written with default filesystem permissions (typically `644`), allowing group and world readability.

```typescript
// src/crypto/keys.ts:80
await fs.writeFile(privateKeyPath, privateKeyPem);  // No permission restrictions
```

**Impact:**
- Any user on the system can read private keys
- Violates security best practices for cryptographic material

**Fix:**
```typescript
// Set restrictive permissions (owner read/write only)
await fs.writeFile(privateKeyPath, privateKeyPem, { mode: 0o600 });
await fs.writeFile(publicKeyPath, publicKeyPem, { mode: 0o644 });
```

---

### 4. Waku Protocols Import Wrong

**Severity:** 🔴 CRITICAL  
**Location:** `src/waku/node.ts` (line 1)

**Issue:**
`Protocols` imported from `@waku/sdk` instead of `@waku/core`.

```typescript
// src/waku/node.ts:1-12
import { createLightNode, Protocols, WakuEvent, ... } from "@waku/sdk";
//                                              ^^^^^^^^ Should be from @waku/core
```

**Impact:**
- Runtime error or incorrect protocol usage
- Incompatible with Waku SDK 0.0.36+ where `Protocols` moved to `@waku/core`

**Fix:**
```typescript
import { createLightNode, WakuEvent, HealthStatus } from "@waku/sdk";
import { Protocols } from "@waku/core";  // ← Add this import
```

---

### 5. Dependency Version Mismatch

**Severity:** 🔴 CRITICAL  
**Location:** `package.json` (line containing `@waku/sdk`)

**Issue:**
```json
{
  "dependencies": {
    "@waku/sdk": "^0.0.36"  // ← Should be ^0.0.37 per spec
  }
}
```

**Impact:**
- Incompatible with spec requirements
- May have protocol differences

**Fix:**
```bash
pnpm add @waku/sdk@^0.0.37
```

---

### 6. Scalar Payload Construction — Ambiguity Attack

**Severity:** 🔴 CRITICAL  
**Location:** `src/protobuf/codec.ts` (lines 69-73, 121-125)

**Issue:**
Messages signed using string concatenation without delimiters between fields.

```typescript
const payload = serviceName + state.toString() + timestamp.toString();
```

**Impact:**
- Ambiguity attacks: `"test" + "1" + "100"` = `"test110"` yields same signature as `"test1" + "0" + "100"`
- Malicious actors could craft semantically different but cryptographically identical messages
- Enables status message forgery

**Fix:**
```typescript
// Use delimiters
const payload = `${serviceName}|${state}|${timestamp}`;

// Or structured binary serialization
const payload = Buffer.concat([
  Buffer.from(serviceName),
  Buffer.from([state]),
  Buffer.from(timestamp.toString())
]);
```

---

### 7. Missing Message Receive Path

**Severity:** 🔴 CRITICAL  
**Location:** `src/commands/*.ts`, `src/waku/`

**Issue:**
dpulse cannot receive messages — send-only:
- No `node.createDecoder()` usage
- No Filter/Relay protocol subscription
- No message listening or callback handlers
- No `node.filter.start()` or `node.filter.subscribe()` calls

**Impact:**
- Cannot operation as distributed health monitoring network
- Only broadcasts status, cannot monitor others
- Unidirectional communication defeats purpose

**Path Forward:**
Implement receive path matching `dpulse-reader` pattern:
```typescript
// src/waku/listener.ts
export async function startListening(
  node: LightNode,
  contentTopic: string,
  callback: (message: StatusMessage) => void
): Promise<void> {
  await node.waitForPeers([Protocols.Filter]);
  const decoder = node.createDecoder({ contentTopic });
  await node.filter.subscribe([decoder], handleWakuMessage);
}
```

---

## High Priority Issues

### 8. Timestamp Validation Too Strict

**Severity:** 🟠 HIGH  
**Location:** `src/protobuf/codec.ts` (lines 48-56)

**Issue:**
24-hour hard window rejects messages outside narrow range.

```typescript
const twentyFourHours = 24 * 60 * 60 * 1000;
if (message.timestamp > now + twentyFourHours) return false;
if (message.timestamp < now - twentyFourHours) return false;
```

**Impact:**
- Fails in offline scenarios
- Clock drift causes valid rejections
- Message queue delays break validation

**Fix:**
```typescript
const sevenDays = 7 * 24 * 60 * 60 * 1000;
// ↑ Increase or make configurable
```

---

### 9. Inconsistent CLI Exit Codes

**Severity:** 🟠 HIGH  
**Location:** `src/commands/waku.ts` (status, peers commands)

**Issue:**
Error exits return code 0 instead of 1.

```typescript
// src/commands/waku.ts
await action(program.optsWithGlobals());
return;  // ↑ Exits with 0 even on error
```

**Impact:**
- CI/CD cannot detect failures
- Automation assumes success

**Fix:**
```typescript
try {
  await action(program.optsWithGlobals());
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);  // ← Exit with error code
}
```

**Command → Exit Code Mapping:**
| Command | On Error |
|---------|----------|
| `keys generate` | ✅ 1 |
| `send` | ✅ 1 |
| `waku status` | ❌ 0 → should be 1 |
| `waku peers` | ❌ 0 → should be 1 |

---

### 10. No Retry Logic for Message Sending

**Severity:** 🟠 HIGH  
**Location:** `src/commands/send.ts` (lines 71-78)

**Issue:**
Single-shot send; exits on any network failure.

```typescript
const result = await node.lightPush.send(encoder, { payload });
if (!result.successes || result.successes.length === 0) {
  console.error("Failed to send message");
  process.exit(1);
}
```

**Impact:**
- Flaky networks cause premature failure
- User must manually retry
- Poor reliability

**Fix:**
```typescript
const MAX_RETRIES = 5;
const INITIAL_DELAY = 1000;

for (let i = 0; i < MAX_RETRIES; i++) {
  try {
    const result = await node.lightPush.send(encoder, { payload });
    if (result.successes?.length > 0) return;
  } catch (error) {
    if (i === MAX_RETRIES - 1) throw error;
    await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY * 2 ** i));
  }
}
```

---

### 11. Missing Content Topic Validation

**Severity:** 🟠 HIGH  
**Location:** `src/config/index.ts` (lines 40-44)

**Issue:**
`CONTENT_TOPIC` only checked for non-empty; no format validation.

```typescript
if (!contentTopic) {
  throw new Error("CONTENT_TOPIC is required");
}
```

**Impact:**
- Malformed topics (no leading `/`, invalid chars) cause runtime errors
- Invalid messages sent to Waku network

**Fix:**
```typescript
import { config } from "dotenv";
import { z } from "zod";

const topicSchema = z.string().regex(/^\/[a-zA-Z0-9\/\-_]+$/, {
  message: "Invalid content topic format: must start with / and contain only alphanumeric, /, -, _"
});

const contentTopic = process.env.CONTENT_TOPIC;
const validatedTopic = topicSchema.parse(contentTopic);
```

---

### 12. keys Directory in Distribution

**Severity:** 🟠 HIGH  
**Location:** `package.json` (line 35)

**Issue:**
```json
{
  "files": ["dist", "keys", "src"]
}
```

**Impact:**
- Keys published to npm if present at publish time
- Security risk

**Fix:**
```json
{
  "files": ["dist", "src"]  // Remove "keys"
}
```

---

### 13. Incomplete .gitignore Configuration

**Severity:** 🟠 HIGH  
**Location:** `.gitignore` (line 16)

**Issue:**
```gitignore
# Keys
keys/private.pem  // ← Only specific file excluded
```

**Impact:**
- Other files in `keys/` (e.g., `keys/derived.json`, `keys/temp.txt`) may be committed unintentionally

**Fix:**
```gitignore
# Keys - private only
keys/private.pem
keys/secret/*
```

---

## Medium Priority Issues

### 14. No Message Ordering

**Severity:** 🟡 MEDIUM  
**Location:** `src/protobuf/schema.ts`

**Issue:**
No sequence numbers or guaranteed ordering in messages.

**Impact:**
- Cannot deduplicate messages from same service
- Multiple messages with same timestamp cause confusion

**Fix:**
```protobuf
// src/protobuf/schema.ts
.add(new protobuf.Field('sequence', 7, 'int64', 'optional'));
```

```typescript
// Increment before encoding
message.sequence = nextSequenceNumber(serviceName);
```

---

### 15. No Message Deduplication

**Severity:** 🟡 MEDIUM  
**Location:** `src/commands/send.ts`, `src/waku/`

**Issue:**
Same message may be received multiple times via LightPush/Relay.

**Impact:**
- Redundant processing
- Potential duplicate alerting

**Fix:**
```typescript
// Track message hashes to prevent duplicates
const seenMessages = new Set<string>();

function handleMessage(message: StatusMessage) {
  const hash = `${message.signature}:${message.timestamp}`;
  if (seenMessages.has(hash)) return;
  seenMessages.add(hash);
  // Process message
}
```

---

### 16. Silent Error Swallowing

**Severity:** 🟡 MEDIUM  
**Location:** `src/crypto/signature.ts` (lines 19-24)

**Issue:**
Errors silently converted to `false`; no logging.

```typescript
try {
  const isValid = await crypto.subtle.verify("Ed25519", publicKey, signature, message);
  return isValid;
} catch (_error) {
  return false;  // ← Error details discarded
}
```

**Impact:**
- Cannot distinguish signature failures from parsing errors
- Impossible to debug cryptographic issues

**Fix:**
```typescript
try {
  return await crypto.subtle.verify("Ed25519", publicKey, signature, message);
} catch (error) {
  console.debug('Verification error:', error instanceof Error ? error.message : error);
  return false;
}
```

---

### 17. No Key Rotation Support

**Severity:** 🟡 MEDIUM  
**Location:** `src/crypto/keys.ts`

**Issue:**
No mechanism for key rotation, versioning, or expiry.

**Impact:**
- Keys cannot be rotated without manual intervention
- No graceful key transition
- Compromised keys cannot be revoked

**Fix:**
```typescript
// src/types/keys.ts
export interface KeyMetadata {
  version: number;
  createdAt: number;
  expiresAt?: number;
  fingerprint: string;
}

// Store alongside keys
const metadataPath = path.join(keysDir, 'metadata.json');
await fs.writeFile(metadataPath, JSON.stringify({
  version: 1,
  createdAt: Date.now(),
  fingerprint: calculateFingerprint(publicKey),
}));
```

---

### 18. CLI Help Text Gaps

**Severity:** 🟡 MEDIUM  
**Location:** `src/commands/*.ts`

**Issue:**
Commands lack usage examples or hints.

**Impact:**
- Users may not know available subcommands
- Discoverability issues

**Fix:**
```typescript
program
  .command('keys')
  .description('Manage cryptographic keys. Try 'dpulse keys generate'')
  .action(() => {
    // ... command logic
  });
```

---

### 19. Limited Error Context

**Severity:** 🟡 MEDIUM  
**Location:** `src/commands/send.ts` (lines 74-77)

**Issue:**
Failures reported as JSON string without actionable details.

```typescript
if (!result.successes || result.successes.length === 0) {
  console.error(JSON.stringify(result.failures));  // Not user-friendly
  process.exit(1);
}
```

**Fix:**
```typescript
if (!result.successes?.length) {
  console.error('Failed to send message. Reasons:');
  for (const failure of result.failures || []) {
    console.error(`  - ${failure.code}: ${failure.message}`);
  }
  process.exit(1);
}
```

---

### 20. Hardcoded keys Directory

**Severity:** 🟡 MEDIUM  
**Location:** `src/crypto/keys.ts` (multiple), `src/commands/keys.ts`

**Issue:**
Keys directory hardcoded as `"./keys"` in multiple places.

**Impact:**
- No configuration flexibility
- Not environment-aware

**Fix:**
```typescript
// src/config/index.ts
export function getKeysDir(): string {
  return process.env.DPULSE_KEYS_DIR || "./keys";
}
```

```typescript
// src/crypto/keys.ts
import { getKeysDir } from '../config';
const keysDir = getKeysDir();
```

---

## Low Priority Issues

### 21. Code Duplication

**Severity:** 🟢 LOW  
**Location:** `src/crypto/keys.ts:114-133` and `src/commands/keys.ts:8-21`

**Issue:**
PEM parsing logic duplicated.

**Fix:**
```typescript
// src/crypto/keys.ts
export function parsePemContent(pem: string, marker: string): Uint8Array {
  const pemContents = pem
    .replace(`-----BEGIN ${marker}-----`, '')
    .replace(`-----END ${marker}-----`, '')
    .replace(/\s/g, '');
  
  const binaryString = atob(pemContents);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
```

---

## Immediate Action Plan

1. **Install Vitest** (Critical #1)
   ```bash
   cd /development/dpulse
   pnpm add -D vitest @vitest/coverage-v8
   ```

2. **Fix Security Issues** (Critical #2, #3, #6)
   ```bash
   # Update keys extraction
   # Add file permissions
   # Add delimiters to payload
   ```

3. **Fix Waku Import** (Critical #4)
   ```bash
   # Update src/waku/node.ts import
   ```

4. **Update Dependency** (Critical #5)
   ```bash
   pnpm add @waku/sdk@^0.0.37
   ```

5. **Implement Receive Path** (Critical #7)
   ```bash
   # Create src/waku/listener.ts
   # Add Filter protocol subscription
   ```

6. **Fix Exit Codes** (High #9)
   ```bash
   # Update src/commands/waku.ts
   ```

7. **Add Retry Logic** (High #10)
   ```bash
   # Update src/commands/send.ts
   ```

---

## Testing Strategy

### Phase 1: Infrastructure
- Install and configure Vitest
- Migrate existing Deno tests
- Create test utilities for mocking

### Phase 2: Crypto Tests
- Key generation and storage
- Signature verification
- PEM parsing edge cases

### Phase 3: CLI Tests
- All commands with mock inputs
- Exit code verification
- Error message clarity

### Phase 4: Waku Tests
- Integration tests with local Waku node
- Message send/receive
- Connection health handling

---

## Production Readiness Checklist

- [x] Clean architecture and module organization
- [ ] Tests run and pass (Vitest migrated)
- [ ] Security vulnerabilities fixed (extractable, permissions, payload)
- [ ] Waku protocols imported correctly
- [ ] Dependency versions aligned with spec
- [ ] Consistent CLI exit codes
- [ ] Retry logic implemented
- [ ] Receive path implemented
- [ ] Content topic validation added
- [ ] Timestamp validation relaxed
- [ ] Message ordering and deduplication added

---

## Summary

**Overall Assessment:** B+ (85/100)

The dpulse project demonstrates strong architectural fundamentals with clean, modular code organization. The migration from Deno to Node.js is architecturally successful but operationally incomplete due to critical test infrastructure failures and security vulnerabilities.

**What Works Well:**
- Excellent code organization and separation of concerns
- Modern TypeScript and Node.js best practices
- Proper cryptographic primitives implementation
- Well-designed CLI structure with Commander.js

**Must Fix Before Production:**
1. Test infrastructure broken (Vitest, migration from Deno)
2. Security vulnerabilities (extractable flags, file permissions, payload construction)
3. Dependency version mismatches
4. Missing receive path

**Recommendation:** Fix critical testing and security issues, then proceed to pre-production testing. The codebase is ready for next phase development once immediate blockers are resolved.

---

**Reviewed by:** Echo (CT-1409)  
**Date:** 2026-05-11
