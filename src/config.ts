import 'dotenv/config';

export type AppConfig = {
  port: number;
  appBaseUrl: string;
  sessionSecret: string;
  searchCarriersBaseUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  production: boolean;
};

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function loadConfig(): AppConfig {
  const port = Number(process.env.PORT ?? 3000);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be a valid TCP port.');
  }

  const scopes = (process.env.SC_SCOPES ?? 'search company:read')
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  return {
    port,
    appBaseUrl: withoutTrailingSlash(required('APP_BASE_URL')),
    sessionSecret: required('SESSION_SECRET'),
    searchCarriersBaseUrl: withoutTrailingSlash(required('SC_BASE_URL')),
    clientId: required('SC_CLIENT_ID'),
    clientSecret: required('SC_CLIENT_SECRET'),
    scopes,
    production: process.env.NODE_ENV === 'production',
  };
}
