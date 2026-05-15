import { spawn } from 'node:child_process';
import type { Config } from '../config/index.ts';
import type { StatusMessage } from '../protobuf/schema.ts';
import { ServiceState } from '../protobuf/schema.ts';

export async function runCommandCheck(
  service: Config['services'][0],
  timeoutMs: number,
  iconCid?: string,
): Promise<StatusMessage> {
  try {
    if (!service.command) {
      throw new Error('Command is required for command healthcheck');
    }

    const result = await execCommand(service.command, timeoutMs);

    const status = determineCommandStatus(
      result,
      service.expect?.output_contains,
    );

    return {
      serviceName: service.name,
      displayName: service.displayName,
      description: service.description,
      status,
      timestamp: Date.now(),
      iconCid: iconCid,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage === 'Command is required for command healthcheck') {
      throw error;
    }

    return {
      serviceName: service.name,
      displayName: service.displayName,
      description: service.description,
      status: ServiceState.DOWN,
      timestamp: Date.now(),
      iconCid,
    };
  }
}

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

async function execCommand(
  commandString: string,
  timeoutMs: number,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    // Split command string into args (simple implementation)
    // For production, use a proper shell parser
    const args = commandString.split(/\s+/);
    const command = args[0];
    const commandArgs = args.slice(1);

    const child = spawn(command, commandArgs);

    let stdout = '';
    let stderr = '';
    let timeoutHandle: NodeJS.Timeout | null = null;

    // Set up timeout
    timeoutHandle = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (exitCode) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      resolve({ exitCode, stdout, stderr });
    });

    child.on('error', (error) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      reject(error);
    });
  });
}

function determineCommandStatus(
  result: CommandResult,
  outputContains?: string,
): 0 | 1 | 2 {
  if (result.exitCode !== 0) {
    return ServiceState.DOWN;
  }

  if (outputContains) {
    const combinedOutput = result.stdout + result.stderr;
    if (!combinedOutput.includes(outputContains)) {
      return ServiceState.DOWN;
    }
  }

  return ServiceState.OPERATIONAL;
}
