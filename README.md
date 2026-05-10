# dpulse

Distributed pulse messaging CLI - Send signed status messages via the Waku decentralized network.

## Installation

```bash
pnpm install
```

## Usage

```bash
# Generate cryptographic keys (first time)
pnpm run dev keys generate

# Show current configuration
pnpm run dev config show

# Check Waku node health
pnpm run dev waku status

# List connected peers
pnpm run dev waku peers

# Send a status message
pnpm run dev send --service <name> --state <state> "<message>"

# Available states: operational, degraded, down
```

## Development

```bash
# Run CLI
pnpm run dev --help

# Type check
pnpm run typecheck
```

## Configuration

Configuration is loaded from:
- `.env` - Environment selector (dev/prod)
- `.env.dev` - Development content topic
- `.env.prod` - Production content topic
- `.env.example` - Template

## License

MIT
