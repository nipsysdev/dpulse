# dpulse

A CLI tool that publishes signed status messages and Atom feed data to the Waku
P2P network.

Built to power the status page and photo gallery on my
[personal site](https://github.com/nipsysdev/site).

## What it does

**Health checks** — Monitors HTTP endpoints and shell commands, publishing
signed status updates to Waku. The site subscribes to these messages and
displays real-time service health.

**Feed publishing** — Fetches Atom feeds (e.g., Pixelfed), signs the entries,
and publishes batches to Waku. The site renders these as a photo gallery.

Both features use Ed25519 signatures for message authenticity and Protocol
Buffers for efficient binary encoding.

## Installation

```bash
git clone https://github.com/nipsysdev/dpulse.git
cd dpulse
pnpm install
```

## Quick Start

1. Generate cryptographic keys:

```bash
pnpm dpulse keys generate
```

2. Copy and configure:

```bash
cp dpulse.yml.example dpulse.yml
```

3. Run a health check:

```bash
pnpm dpulse check
```

4. Publish a feed:

```bash
pnpm dpulse feed
```

## Configuration

Create `dpulse.yml` in your project directory or `~/.config/dpulse/`.

Define services to monitor:

- **HTTP services**: Check an endpoint URL and validate response status/body
- **Command services**: Run a shell command and check exit code/output

Define feed settings (optional):

- `feedUrl`: Atom feed URL to fetch
- `feedContentTopic`: Waku topic for feed batches

See `dpulse.yml.example` for a complete configuration reference.

## CLI Commands

| Command                     | Description                           |
| --------------------------- | ------------------------------------- |
| `dpulse check`              | Run health checks and publish to Waku |
| `dpulse feed`               | Fetch and publish Atom feed to Waku   |
| `dpulse config show`        | Display current configuration         |
| `dpulse keys generate`      | Generate Ed25519 key pair             |
| `dpulse keys export public` | Export public key in PEM format       |
| `dpulse keys fingerprint`   | Show public key fingerprint           |

Run `dpulse <command> --help` for options.

## Development

```bash
pnpm dpulse --help        # Run CLI
pnpm run typecheck         # Type checking
pnpm run test              # Run tests
pnpm run lint              # Lint code
```

## License

GNU General Public License v3.0 - see [LICENSE](LICENSE) file
