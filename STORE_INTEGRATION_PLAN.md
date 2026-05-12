# dpulse Store Integration Plan

**Goal:** Ensure heartbeats persist to Waku Store nodes for frontend retrieval.

## Changes

### 1. Remove `@waku/core` dependency (if present)

**File:** `package.json`

The `Protocols` enum is available in `@waku/sdk` v0.0.36. No need for `@waku/core`.

---

### 2. Update peer waiting logic

**File:** `src/waku/node.ts`

Wait for both LightPush and Store peers in a single combined call:

```typescript
// Before sending, wait for both protocols
await node.waitForPeers([Protocols.LightPush, Protocols.Store], 20000);
```

**Update `waitForPeers` if needed** to handle combined protocol array.

---

### 3. Add Store peer detection before send

**File:** `src/commands/send.ts`

```typescript
// After node starts, wait for peers
try {
  await wakuNode.waitForPeers([Protocols.LightPush, Protocols.Store], 20000);
} catch (error) {
  // If timeout, log warning but continue
  logger.warn('Peer wait timeout — message sent but persistence not guaranteed');
}
```

**Behavior:**
- Wait up to 20s for both LightPush and Store peers
- If timeout, log warning and send anyway (fire-and-forget fallback)
- Success = message sent + Store peer available for persistence

---

### 4. Keep Store out of health status

**File:** `src/waku/node.ts` — no changes to health check logic

Health status (`SufficientlyHealthy`, `MinimallyHealthy`, `Unhealthy`) remains based on Filter + LightPush peers only. Store is a send-time requirement, not a node health indicator.

---

## Summary

| File | Change |
|------|--------|
| `package.json` | Remove `@waku/core` if present |
| `src/waku/node.ts` | Combined peer wait: `[Protocols.LightPush, Protocols.Store]` |
| `src/commands/send.ts` | Wait for Store peer before send, warn on timeout |

**Effort:** ~30 min

---

## Verification

After implementation:
```bash
# Send a heartbeat
pnpm run dev send --service test --state operational "Test message"

# Should see in logs:
# - Waiting for LightPush + Store peers...
# - Connected to Store peer (or timeout warning)
# - Message sent
```

Frontend can then query Store nodes for historical messages.
