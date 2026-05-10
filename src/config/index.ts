import dotenv from 'dotenv';

export interface Config {
  environment: "dev" | "prod";
  logLevel: "debug" | "info" | "warn" | "error";
  contentTopic: string;
}

export async function loadConfig(): Promise<Config> {
  dotenv.config();
  const envBase = process.env;

  const environment = (envBase.ENVIRONMENT ?? "dev") as "dev" | "prod";
  
  if (environment !== "dev" && environment !== "prod") {
    throw new Error(`Invalid ENVIRONMENT: ${environment}. Must be "dev" or "prod".`);
  }

  let envSpecific: Record<string, string> = {};
  try {
    const envSpecificResult = dotenv.config({ path: `.env.${environment}` });
    envSpecific = envSpecificResult.parsed || {};
  } catch (error) {
    if ((error as Error).message.includes("not found")) {
      console.warn(`Warning: .env.${environment} file not found. Some values may be missing.`);
    } else {
      throw error;
    }
  }

  const merged = { ...envBase, ...envSpecific };

  const logLevel = (merged.LOG_LEVEL ?? "info") as Config["logLevel"];
  const validLogLevels = ["debug", "info", "warn", "error"];
  
  if (!validLogLevels.includes(logLevel)) {
    throw new Error(`Invalid LOG_LEVEL: ${logLevel}. Must be one of: ${validLogLevels.join(", ")}.`);
  }

  const contentTopic = merged.CONTENT_TOPIC ?? "";
  
  if (!contentTopic) {
    throw new Error(`CONTENT_TOPIC is not set in .env or .env.${environment}`);
  }

  return {
    environment,
    logLevel,
    contentTopic
  };
}
