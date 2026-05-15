# dpulse

A CLI tool that runs healthchecks and publishes signed status messages to the
Waku network.

## What it does

1. Runs healthchecks on your services (HTTP endpoints and shell commands)
2. Encodes status messages as Protocol Buffers
3. Signs messages with Ed25519 keys
4. Publishes to Waku decentralized network

Consumers can subscribe to these messages via Waku's Filter protocol or query
historical data via Store protocol.

## Quick Start

### Install

```bash
git clone https://github.com/yourusername/dpulse.git
cd dpulse
pnpm install
```

### Generate keys

```bash
dpulse keys generate
```

Keys are saved to `~/.config/dpulse/keys/` or `./keys/`

### Configure

Create `dpulse.yml`:

```yaml
# Global settings
timeout: 5000
environment: dev

# Environment-specific configs
environments:
  dev:
    contentTopic: "/dpulse_site/1.0.0/dev/proto"
    logLevel: info
  prod:
    contentTopic: "/dpulse_site/1.0.0/prod/proto"
    logLevel: info

# Services to monitor
services:
  - name: api-server
    displayName: "API Server"
    description: "Main REST API endpoint"
    type: http
    url: https://api.example.com/health
    expect:
      status: 200
      body_contains: "healthy"

  - name: database
    displayName: "PostgreSQL"
    description: "Primary database connection"
    type: command
    command: pg_isready -h localhost -p 5432
    expect:
      output_contains: "accepting connections"
```

### Run

```bash
dpulse check
```

## Configuration

### Global settings

```yaml
timeout: 5000 # Timeout for checks in milliseconds
environment: dev # Default environment
```

### Environments

```yaml
environments:
  dev:
    contentTopic: "/dpulse_site/1.0.0/dev/proto"
    logLevel: debug
  prod:
    contentTopic: "/dpulse_site/1.0.0/prod/proto"
    logLevel: info
```

`logLevel` can be: `debug`, `info`, `warn`, `error`

### HTTP services

```yaml
services:
  - name: website
    displayName: "Website"
    description: "Homepage health check"
    type: http
    url: https://example.com
    expect:
      status: 200 # Required HTTP status
      body_contains: "Welcome" # Optional text to find in response
```

HTTP requests taking > 5000ms are marked as DEGRADED instead of OPERATIONAL.

### Command services

```yaml
services:
  - name: redis
    displayName: "Redis"
    description: "Cache server"
    type: command
    command: redis-cli ping
    expect:
      output_contains: "PONG" # Text to find in command output
```

Command must exit with code 0 for success.

### Icons (optional)

Map services to IPFS CIDs for display in consumer dashboards:

```yaml
iconCids:
  api-server: "bafkreie7ohywtosou76tasm7j63yigtzxe7d5zqus4zu3j6oltvgtibeom"
```

## CLI Commands

### `dpulse check`

Run healthchecks and publish to Waku.

```bash
dpulse check
dpulse check --env prod
dpulse check --log-level debug
dpulse check --content-topic "/custom/topic"
```

### `dpulse config`

Display current configuration.

```bash
dpulse config show
```

### `dpulse keys`

Manage cryptographic keys.

```bash
dpulse keys generate                    # Generate Ed25519 key pair
dpulse keys export public               # Export public key in PEM format
dpulse keys fingerprint                 # Show public key fingerprint
```

## Status Messages

Messages are Protocol Buffers with this schema:

```protobuf
enum ServiceState {
  OPERATIONAL = 0;
  DEGRADED = 1;
  DOWN = 2;
}

message StatusMessage {
  string serviceName = 1;
  string displayName = 2;
  string description = 3;
  ServiceState status = 4;
  int64 timestamp = 5;
  string iconCid = 6;                    // optional
  string signature = 7;                  // base64-encoded Ed25519 signature
}
```

### Status states

- `OPERATIONAL (0)`: Check passed
- `DEGRADED (1)`: Check passed but slow (>5000ms for HTTP)
- `DOWN (2)`: Check failed

### Signature

Signature is created from concatenated fields:

```
serviceName + displayName + description + status + timestamp
```

Consumers can verify signatures using the Ed25519 public key.

## Consuming Messages

### Real-time subscription

```typescript
import { createDecoder, createNode } from "@waku/sdk";
import protobuf from "protobufjs";

// Define schema
const schema = protobuf.parse(`
  enum ServiceState { OPERATIONAL = 0; DEGRADED = 1; DOWN = 2; }
  message StatusMessage {
    string serviceName = 1;
    string displayName = 2;
    string description = 3;
    ServiceState status = 4;
    int64 timestamp = 5;
    string iconCid = 6;
    string signature = 7;
  }
`);

const StatusMessage = schema.root.lookupType("StatusMessage");

// Connect to Waku
const node = await createNode({ defaultBootstrap: true });
await node.start();

const decoder = createDecoder({ contentTopic: "/dpulse_site/1.0.0/dev/proto" });

// Subscribe
await node.filter.subscribe([decoder], async (wakuMessage) => {
  if (!wakuMessage.payload) return;

  const decoded = StatusMessage.decode(wakuMessage.payload);

  // Verify signature before using the message
  const isValid = await verifySignature(decoded, publicKeyPem);
  if (!isValid) return;

  console.log(`${decoded.displayName}: ${ServiceState[decoded.status]}`);
});
```

Have a look at my [personal site](https://github.com/nipsysdev/site) for a
complete example of consuming dpulse messages.

## Development

```bash
# Install dependencies
pnpm install

# Run CLI
pnpm run dev --help
pnpm run dev config show
pnpm run dev check

# Type checking
pnpm run typecheck

# Tests
pnpm run test
pnpm run test:watch

# Lint/format
pnpm run lint
pnpm run lint:fix
pnpm run format
```

## Project Structure

```
src/
├── cli/main.ts              # CLI entry point
├── commands/
│   ├── check.ts             # Health check command
│   ├── config.ts            # Config management
│   └── keys.ts              # Key management
├── config/
│   ├── index.ts             # Config loader
│   ├── schema.ts            # TypeScript types
│   └── yaml.ts              # YAML parsing
├── crypto/
│   ├── keys.ts              # Ed25519 key management
│   └── signature.ts         # Message signing
├── healthcheck/
│   ├── index.ts             # Health check runner
│   ├── http.ts              # HTTP checks
│   └── command.ts           # Command checks
├── protobuf/
│   ├── schema.ts            # Protobuf definitions
│   └── codec.ts             # Encoding/decoding
├── waku/
│   ├── config.ts            # Waku configuration
│   └── node.ts              # Waku node wrapper
└── utils/
    ├── logger.ts            # Logging utilities
    └── cid-validator.ts     # IPFS CID validation
```

## Troubleshooting

### Keys not found

```bash
dpulse keys generate
```

### No dpulse.yml found

```bash
cp dpulse.yml.example dpulse.yml
```

### Waku connection issues

- Check internet connection
- Verify Waku bootstrap nodes are accessible
- Increase peer wait timeout

### Service check timeout

```yaml
# In dpulse.yml
timeout: 10000 # 10 seconds
```

### Published: 0/X failures

No LightPush peers available. Retry later.

## License

GNU General Public License v3.0 - see [LICENSE](LICENSE) file
