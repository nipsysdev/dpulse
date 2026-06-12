export interface ExpectConfig {
  status?: number;
  body_contains?: string;
  output_contains?: string;
}

export interface EnvironmentConfig {
  contentTopic: string;
  feedContentTopic?: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export interface ServiceConfig {
  name: string;
  displayName: string;
  description: string;
  type: 'http' | 'command';
  url?: string;
  command?: string;
  expect?: ExpectConfig;
}

export interface DpulseConfig {
  timeout?: number;
  environment?: string;
  feedUrl?: string;
  environments?: Record<string, EnvironmentConfig>;
  services: ServiceConfig[];
  iconCids?: Record<string, string>;
}
