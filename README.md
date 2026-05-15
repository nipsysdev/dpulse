# dpulse

Distributed pulse messaging CLI - Send signed status messages via the Waku decentralized network.

## Installation

```bash
pnpm install
```

## Usage

```bash
# Show current configuration
bun run dev config show

# Run healthchecks
bun run dev check

# Available states: healthy (0), degraded (1), down (2)
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
