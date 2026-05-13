# Healthcheck Implementation Plan

## Overview

Implement healthcheck feature in dpulse CLI to monitor self-hosted services and publish status via Waku protocol.

## Current State

- Config: dotenv-based (`.env`, `.env.dev`, `.env.prod`)
- Protobuf: `StatusMessage` with `serviceName`, `state` (enum), `timestamp`, `message`
- Commands: `config init/show`, `keys`, `waku status/peers`, `send`
- Waku: LightPush + Store integrated in `src/waku/node.ts`

## Target State

- Config: YAML-based via `env-paths` (`~/.config/dpulse/dpulse.yaml`)
- Payload: `HealthStatus` with `name`, `displayName`, `description`, `status`, `timestamp`, `icon`
- Commands: `config init/show`, `keys`, `check`
- Healthchecks: HTTP and command types

---

## Implementation Steps

### 1. Add Dependencies

```bash
pnpm add env-paths js-yaml
pnpm add -D @types/js-yaml
```

### 2. Create Config Schema (`src/config/schema.ts`)

```typescript
export interface ServiceConfig {
  name: string;
  displayName: string;
  description: string;
  type: "http" | "command";
  url?: string;           // for http
  command?: string[];     // for command
  expect?: {
    status?: number;      // HTTP status (default 200)
    body_contains?: string;
    output_contains?: string;
  };
}

export interface DpulseConfig {
  timeout: string;        // e.g., "10s"
  interval: string;       // e.g., "60s" (for future daemon mode)
  services: ServiceConfig[];
  icons?: Record<string, string>;
}
```

### 3. Create YAML Loader (`src/config/yaml.ts`)

- Use `env-paths` for cross-platform config directory
- Load `dpulse.yaml` from config dir
- Parse with `js-yaml`
- Validate schema, provide defaults
- Fallback to `./dpulse.yaml` for dev/portability

```typescript
import envPaths from 'env-paths';
import * as yaml from 'js-yaml';

const paths = envPaths('dpulse');
// Linux: ~/.config/dpulse/dpulse.yaml
// macOS: ~/Library/Application Support/dpulse/dpulse.yaml
// Windows: %APPDATA%\dpulse\Config\dpulse.yaml
```

### 4. Update Protobuf Schema (`src/protobuf/schema.ts`)

Replace `StatusMessage` with `HealthStatus`:

```typescript
// OLD
StatusMessage: serviceName, state (enum), timestamp, message, signature, publicKey

// NEW
HealthStatus: name, displayName, description, status, timestamp, icon
```

Options:
- **Option A**: New protobuf message type (breaking change, clean)
- **Option B**: Keep JSON payload (simpler, no protobuf schema changes)

**Recommendation:** Option B - JSON payload. The HealthStatus is small, schema is flexible, and frontend already handles decoding.

### 5. Create Healthcheck Runner

#### 5.1 HTTP Healthcheck (`src/healthcheck/http.ts`)

```typescript
export async function runHttpCheck(
  service: ServiceConfig,
  timeout: number
): Promise<HealthStatus> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(service.url, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    const elapsed = Date.now() - start;
    const status = determineStatus(response.status, elapsed, service.expect);
    
    return {
      name: service.name,
      displayName: service.displayName,
      description: service.description,
      status,
      timestamp: new Date().toISOString(),
      icon: service.icon
    };
  } catch (error) {
    clearTimeout(timeoutId);
    return { ...base, status: "down" };
  }
}

function determineStatus(httpStatus: number, elapsedMs: number, expect?: ExpectConfig): HealthStatusValue {
  if (httpStatus !== (expect?.status ?? 200)) return "down";
  if (elapsedMs > 5000) return "degraded";
  return "healthy";
}
```

#### 5.2 Command Healthcheck (`src/healthcheck/command.ts`)

```typescript
import { spawn } from 'child_process';

export async function runCommandCheck(
  service: ServiceConfig,
  timeout: number
): Promise<HealthStatus> {
  // Use spawn with timeout
  // Check exit code and output_contains
}
```

#### 5.3 Orchestrator (`src/healthcheck/index.ts`)

```typescript
export async function runAllChecks(config: DpulseConfig): Promise<HealthStatus[]> {
  const timeoutMs = parseDuration(config.timeout);
  
  const results = await Promise.all(
    config.services.map(service => {
      if (service.type === 'http') {
        return runHttpCheck(service, timeoutMs);
      } else {
        return runCommandCheck(service, timeoutMs);
      }
    })
  );
  
  return results;
}
```

### 6. Create Check Command (`src/commands/check.ts`)

```typescript
export const checkCommand = new Command()
  .name('check')
  .description('Run healthchecks and publish results')
  .option('-c, --config <path>', 'Custom config path')
  .action(async (options) => {
    // 1. Load config
    const config = await loadYamlConfig(options.config);
    
    // 2. Run healthchecks
    const results = await runAllChecks(config);
    
    // 3. Initialize Waku node
    const manager = new WakuNodeManager();
    await manager.start();
    
    // 4. Publish each result
    for (const status of results) {
      await manager.publish(status);
      console.log(`✓ ${status.displayName}: ${status.status}`);
    }
    
    // 5. Cleanup
    await manager.stop();
  });
```

### 7. Update Config Init (`src/commands/config.ts`)

Add YAML scaffolding to `init` command:

```typescript
const DEFAULT_CONFIG = `# dpulse configuration
timeout: 10s
interval: 60s

services:
  - name: example-service
    displayName: "Example Service"
    description: "An example service to monitor"
    type: http
    url: https://example.com/health
    expect:
      status: 200

icons:
  example-service: |
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="10"/>
    </svg>
`;

// Create config directory and file
const configDir = envPaths('dpulse').config;
await fs.mkdir(configDir, { recursive: true });
await fs.writeFile(path.join(configDir, 'dpulse.yaml'), DEFAULT_CONFIG);
```

### 8. Update CLI Entry (`src/cli/main.ts`)

```diff
- import { statusCommand, peersCommand } from "../commands/waku.ts";
- import { sendCommand } from "../commands/send.ts";
+ import { checkCommand } from "../commands/check.ts";

- wakuCommand.addCommand(statusCommand);
- wakuCommand.addCommand(peersCommand);
- program.addCommand(wakuCommand);
- program.addCommand(sendCommand);
+ program.addCommand(checkCommand);
```

### 9. Remove Deprecated Files

```
src/commands/waku.ts  → DELETE
src/commands/send.ts  → DELETE
```

---

## File Changes Summary

| Action | File |
|--------|------|
| CREATE | `src/config/schema.ts` |
| CREATE | `src/config/yaml.ts` |
| CREATE | `src/healthcheck/http.ts` |
| CREATE | `src/healthcheck/command.ts` |
| CREATE | `src/healthcheck/index.ts` |
| CREATE | `src/commands/check.ts` |
| MODIFY | `src/config/index.ts` - integrate YAML loader |
| MODIFY | `src/commands/config.ts` - add YAML scaffolding |
| MODIFY | `src/cli/main.ts` - remove old commands, add check |
| MODIFY | `src/protobuf/schema.ts` - HealthStatus message OR remove |
| MODIFY | `package.json` - add dependencies |
| DELETE | `src/commands/waku.ts` |
| DELETE | `src/commands/send.ts` |

---

## Open Decisions

1. **Wire Format**: Protobuf vs JSON payload?
   - Protobuf: More efficient, existing infrastructure
   - JSON: Simpler, flexible schema
   
2. **Signature**: Should `check` command sign payloads?
   - Current `send` signs with Ed25519
   - If yes, add signature fields back to HealthStatus

3. **Content Topic**: Where to configure?
   - Hardcode in code
   - Add to YAML config
   - Keep environment-based (`.env`)

4. **Key Location**: Move keys to `~/.config/dpulse/keys/`?

---

## Testing Checklist

- [ ] Config loader finds YAML in expected location
- [ ] Config loader falls back to `./dpulse.yaml`
- [ ] HTTP healthcheck returns correct status for 200, 5xx, timeout
- [ ] HTTP healthcheck marks degraded for >5s response
- [ ] Command healthcheck parses exit code correctly
- [ ] Command healthcheck matches `output_contains`
- [ ] Waku publishes HealthStatus to correct topic
- [ ] CLI outputs human-readable results
- [ ] `config init` creates valid YAML scaffold
