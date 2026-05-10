# dpulse Initialisation Plan

## Phase 1:Goal — Send Signed Custom Messages via CLI

### Project Structure

```
dpulse/
├── deno.json                    # Deno configuration
├── deps.ts                      # Dependencies import map
├── .env.example                 # Environment variables template
├── src/
│   ├── cli/
│   │   └── main.ts              # CLI entry point with command routing
│   ├── commands/
│   │   ├── send.ts              # Send signed message command
│   │   ├── keys.ts              # Key management commands
│   │   └── config.ts            # Config management commands
│   ├── crypto/
│   │   ├── keys.ts              # Key pair generation/loading
│   │   ├── signature.ts         # Message signing
│   │   └── verification.ts      # Signature verification
│   ├── waku/
│   │   ├── node.ts              # Waku node management
│   │   ├── publisher.ts         # Message publishing via LightPush
│   │   └── config.ts            # Waku configuration
│   ├── protobuf/
│   │   ├── schema.ts            # Protobuf schema definitions
│   │   └── codec.ts             # Encoding/decoding utilities
│   ├── config/
│   │   ├── index.ts            # Configuration loader
│   │   └── types.ts            # Configuration types
│   ├── utils/
│   │   ├── logger.ts           # Logging utilities
│   │   └── env.ts              # Environment variable handling
│   └── types/
│       └── index.ts            # Shared type definitions
├── keys/
│   ├── public.pem              # Public key (verifiable, generated)
│   └── private.pem             # Private key (generated, .gitignore)
└── tests/
    ├── units/                  # Unit tests
    └── integration/            # Integration tests with real Waku
```

### Dependencies

**Core:**
- `cliffy/command` — CLI framework
- `cliffy/prompt` — User prompts for first-run setup
- `protobufjs` — Protobuf schema handling (from jsr: `jsr:@protobuf/protobufjs`)

**Networking:**
- `@waku/sdk@0.0.37` — Waku/Logos messaging SDK (via npm import in Deno)

**Crypto:**
- Deno native `crypto.subtle` API (no external deps)

**Utilities:**
- `std/dotenv` — Environment variables from `.env` files
- `std/path` — Path operations

### Key Management Strategy

**First-run Detection:**
- Check `keys/private.pem` existence on startup
- If missing, trigger `keys generate` workflow
- Ask user confirmation before generating new key pair
- Store keys in project root `keys/` directory

**Key Storage:**
| File        | Purpose                          | Git Status |
|-------------|----------------------------------|------------|
| `private.pem` | Ed25519 private key for signing  | `.gitignore` |
| `public.pem`  | Ed25519 public key for verification | Tracked   |

**CLI Commands:**
```bash
dpulse keys generate          # Generate new key pair (interactive)
dpulse keys export public     # Export public key in PEM format
dpulse keys fingerprint       # Display public key fingerprint for verification
```

### Protobuf Schema

**Initial Schema (Status Message):**

```protobuf
message StatusMessage {
  string service_name = 1;      // e.g., "element", "ipfs", "llm-proxy", "taiga"
  enum ServiceState {
    UNKNOWN = 0;
    OPERATIONAL = 1;
    DEGRADED = 2;
    DOWN = 3;
  }
  ServiceState state = 2;
  int64 timestamp = 3;          // Unix timestamp (milliseconds)
  string message = 4;           // Optional human-readable status message
  string signature = 5;         // Ed25519 signature of all above fields
  bytes public_key = 6;         // Ed25519 public key (base64-encoded)
}
```

**Content Topics:**
- Development: `/nipsys/dpulse/1.0.0/dev/proto`
- Production: `/nipsys/dpulse/1.0.0/prod/proto`

### Command Structure

**Initial CLI Commands:**

```bash
# Send signed message (primary goal)
dpulse send <message> \
    --service <name> \
    --state <operational|degraded|down> \
    [--topic <content-topic>] \
    [--env <dev|prod>]

# Key management
dpulse keys generate
dpulse keys export public
dpulse keys fingerprint

# Waku node management
dpulse waku status              # Check Waku node health
dpulse waku peers               # List connected peers

# Configuration
dpulse config init              # Initialise config with .env setup
dpulse config show              # Display current configuration
```

### Environment Configuration

**`.env` Structure:**

```env
# Content Topics
CONTENT_TOPIC_DEV="/nipsys/dpulse/1.0.0/dev/proto"
CONTENT_TOPIC_PROD="/nipsys/dpulse/1.0.0/prod/proto"

# Service Configuration
ENVIRONMENT=dev                 # dev or prod
POLL_INTERVAL_MS=60000          # 60 seconds (for future daemon mode)
LOG_LEVEL=info                  # debug, info, warn, error
```

### CLI Flags vs Environment Variables Priority

| Setting              | CLI Flag                 | Env Variable       | Default     |
|----------------------|--------------------------|--------------------|-------------|
| Content Topic        | `--topic`                | `CONTENT_TOPIC_*`  | Dev topic   |
| Environment          | `--env`                  | `ENVIRONMENT`      | `dev`       |
| Service Name         | `--service`              | —                  | Required    |
| Service State        | `--state`                | —                  | Required    |
| Log Level            | `--log-level`            | `LOG_LEVEL`        | `info`      |

### Waku Integration Plan

**Node Setup:**
1. Create light node with `defaultBootstrap: true` (connects to Waku's default peer network)
2. Wait for `SufficientlyHealthy` status before allowing message sending
3. Expose health check via `dpulse waku status`

**Message Publishing:**
1. Create encoder for configured content topic
2. Encode Protobuf `StatusMessage`
3. Sign message payload
4. Send via `lightPush.send()`
5. Log success/failure with message ID

**Error Handling:**
- Waku node not healthy → Block message sending, explain issue
- No peers connected → Show peer count, suggest troubleshooting
- Signature verification fail → Log error, don't send invalid message

### Implementation Sequence

**Step 1: Project Setup**
1. Create Deno project structure
2. Configure `deno.json` with proper imports
3. Set up `.env.example` and `deps.ts`

**Step 2: Key Management**
1. Implement Ed25519 key generation via `crypto.subtle`
2. Create `keys/` directory handling
3. Implement `keys generate` command
4. Add key loading utilities

**Step 3: Cryptographic Operations**
1. Implement message signing function
2. Implement signature verification function
3. Create test cases for sign/verify cycle

**Step 4: Protobuf Integration**
1. Define `StatusMessage` schema
2. Implement encoding utilities
3. Create helper to sign protobuf payloads

**Step 5: Waku Node Management**
1. Set up `@waku/sdk@0.0.37` via npm import
2. Implement node creation with `defaultBootstrap: true`
3. Add health monitoring for `SufficientlyHealthy` status
4. Create `waku status` and `waku peers` commands

**Step 6: Send Command (Goal)**
1. Implement `send` command with argument parsing
2. Wire up message generation → signing → protobuf encoding → Waku publish
3. Add proper error handling and logging
4. Test with real Waku peer network

**Step 7: Testing & Validation**
1. Unit tests for crypto operations
2. Integration tests send/verify cycle
3. Manual testing with Waku default peer network
4. Validate signature verification works independently

### Verification Strategy (Frontend Prep)

**What needs to be verified:**
1. Message signature matches public key
2. Public key fingerprint matches trusted key
3. Message timestamp is recent (prevent replay attacks)
4. Service name and state are valid enum values

**Frontend integration path:**
- Export public key from CLI: `dpulse keys export public`
- Embed in frontend `config/`
- Use Web Crypto API for verification (same as Deno's `crypto.subtle`)
- Parse Protobuf message in browser

### Open Questions to Resolve

1. **Private Key Protection:** For production, do you want passphrase encryption on `private.pem`?

2. **Message Deduplication:** For daemon mode, do we need to track last status sent per service to avoid spamming?

3. **Frontend Key Distribution:** How should we implement public key distribution for frontend verification?
   - Option A: Update site config with public key
   - Option B: Distribute via IPFS/IPNS alongside other configs
   - Option C: Other approach you have in mind

### Success Criteria - Phase 1

✅ Generate Ed25519 key pair on first run
✅ Create and sign Protobuf `StatusMessage`
✅ Initialize Waku node with ash peer list
✅ Publish signed message via LightPush
✅ Verify signature independently (testing only)
✅ CLI handles all error cases gracefully

---

**Next Steps:**
1. Answer open questions (private key protection, message deduplication, frontend key distribution)
2. Create initial project structure
3. Begin implementation of Step 1 (Setup)
