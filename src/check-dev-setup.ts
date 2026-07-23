import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface, emitKeypressEvents } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';

const requiredEnvironmentVariables = [
  'APP_BASE_URL',
  'SESSION_SECRET',
  'SC_BASE_URL',
  'SC_CLIENT_ID',
  'SC_CLIENT_SECRET',
] as const;

const placeholderValues = new Set([
  'replace-with-at-least-32-random-characters',
  'replace-with-the-generated-value',
  'your-client-id',
  'your-client-secret',
]);

type EnvironmentUpdates = Record<string, string>;

export function findUnconfiguredVariables(environment: NodeJS.ProcessEnv): string[] {
  return requiredEnvironmentVariables.filter((name) => {
    const value = environment[name]?.trim();
    return !value || placeholderValues.has(value);
  });
}

export function buildSetupGuide(missingVariables: string[], envFileExists: boolean): string {
  const envFileStep = envFileExists
    ? 'Open the existing .env file in this project.'
    : 'Create your local environment file:\n\n   cp .env.example .env';

  return `
SearchCarriers Connect setup is incomplete.

Missing or unconfigured:
${missingVariables.map((name) => `  - ${name}`).join('\n')}

Follow these steps:

1. ${envFileStep}

2. Generate a session secret:

   openssl rand -base64 48

   Copy the result into .env as SESSION_SECRET.

3. In SearchCarriers, go to Settings > Apps > Develop an app.
   Set the redirect URI to:

   http://localhost:3000/auth/callback

   Copy the new app's client ID and client secret into SC_CLIENT_ID and
   SC_CLIENT_SECRET in .env.

4. Make sure these local values are set in .env:

   APP_BASE_URL=http://localhost:3000
   SC_BASE_URL=https://searchcarriers.com

5. Run npm run dev again.
`.trim();
}

function encodeEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value)) return value;

  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/"/g, '\\"')}"`;
}

export function updateEnvFileContent(content: string, updates: EnvironmentUpdates): string {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.length > 0 ? content.split(/\r?\n/) : [];
  const updatedVariables = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    const name = match?.[1];

    if (name && Object.hasOwn(updates, name)) {
      lines[index] = `${name}=${encodeEnvValue(updates[name] ?? '')}`;
      updatedVariables.add(name);
    }
  }

  const missingEntries = Object.entries(updates).filter(([name]) => !updatedVariables.has(name));

  while (lines.at(-1) === '') lines.pop();
  if (missingEntries.length > 0 && lines.length > 0) lines.push('');

  for (const [name, value] of missingEntries) {
    lines.push(`${name}=${encodeEnvValue(value)}`);
  }

  return `${lines.join(newline)}${newline}`;
}

async function ask(message: string): Promise<string> {
  const interfaceInstance = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    return (await new Promise<string>((resolve) => interfaceInstance.question(message, resolve))).trim();
  } finally {
    interfaceInstance.close();
  }
}

async function confirm(message: string, defaultAnswer = true): Promise<boolean> {
  while (true) {
    const suffix = defaultAnswer ? ' [Y/n] ' : ' [y/N] ';
    const answer = (await ask(`${message}${suffix}`)).toLowerCase();

    if (!answer) return defaultAnswer;
    if (answer === 'y' || answer === 'yes') return true;
    if (answer === 'n' || answer === 'no') return false;

    console.log('Please answer yes or no.');
  }
}

async function askWithDefault(message: string, defaultValue: string): Promise<string> {
  const answer = await ask(`${message} [${defaultValue}] `);
  return answer || defaultValue;
}

async function askRequired(message: string): Promise<string> {
  while (true) {
    const answer = await ask(message);
    if (answer) return answer;

    console.log('A value is required.');
  }
}

async function askHidden(message: string): Promise<string> {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    return askRequired(message);
  }

  emitKeypressEvents(process.stdin);
  const wasRaw = process.stdin.isRaw;
  const wasPaused = process.stdin.isPaused();
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write(message);

  return new Promise<string>((resolve, reject) => {
    let value = '';

    const finish = (error?: Error) => {
      process.stdin.off('keypress', onKeypress);
      process.stdin.setRawMode(wasRaw);
      if (wasPaused) process.stdin.pause();
      process.stdout.write('\n');

      if (error) reject(error);
      else resolve(value);
    };

    const onKeypress = (character: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === 'c') {
        finish(new Error('Setup cancelled.'));
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        if (value) finish();
        else process.stdout.write('\u0007');
        return;
      }

      if (key.name === 'backspace') {
        value = value.slice(0, -1);
        return;
      }

      if (!key.ctrl && character) value += character;
    };

    process.stdin.on('keypress', onKeypress);
  });
}

async function askForSessionSecret(): Promise<string> {
  if (await confirm('Generate a secure SESSION_SECRET automatically?')) {
    return randomBytes(48).toString('base64');
  }

  while (true) {
    const secret = await askHidden('Enter SESSION_SECRET (input hidden, at least 32 characters): ');
    if (secret.length >= 32) return secret;

    console.log('SESSION_SECRET must contain at least 32 characters.');
  }
}

async function collectMissingValues(missingVariables: string[]): Promise<EnvironmentUpdates> {
  const missing = new Set(missingVariables);
  const updates: EnvironmentUpdates = {};

  if (missing.has('APP_BASE_URL')) {
    updates.APP_BASE_URL = await askWithDefault('Application URL:', 'http://localhost:3000');
  }

  if (missing.has('SESSION_SECRET')) {
    updates.SESSION_SECRET = await askForSessionSecret();
  }

  if (missing.has('SC_BASE_URL')) {
    updates.SC_BASE_URL = await askWithDefault('SearchCarriers URL:', 'https://searchcarriers.com');
  }

  if (missing.has('SC_CLIENT_ID') || missing.has('SC_CLIENT_SECRET')) {
    const appBaseUrl = updates.APP_BASE_URL ?? process.env.APP_BASE_URL ?? 'http://localhost:3000';
    const redirectUri = `${appBaseUrl.replace(/\/+$/, '')}/auth/callback`;

    console.log(`
Create or open your SearchCarriers Connect app:
  1. In SearchCarriers, go to Settings > Apps > Develop an app.
  2. Use ${redirectUri} as the redirect URI.
  3. Keep the app page open so you can copy its credentials.
`);
    await ask('Press Enter when the app is ready...');
  }

  if (missing.has('SC_CLIENT_ID')) {
    updates.SC_CLIENT_ID = await askRequired('Client ID: ');
  }

  if (missing.has('SC_CLIENT_SECRET')) {
    updates.SC_CLIENT_SECRET = await askHidden('Client secret (input hidden): ');
  }

  return updates;
}

async function saveEnvironmentUpdates(envPath: string, updates: EnvironmentUpdates): Promise<void> {
  const envFileExists = existsSync(envPath);
  const examplePath = path.resolve(process.cwd(), '.env.example');
  const sourcePath = envFileExists ? envPath : examplePath;
  const content = existsSync(sourcePath) ? await readFile(sourcePath, 'utf8') : '';
  const options = envFileExists ? undefined : { mode: 0o600 };

  await writeFile(envPath, updateEnvFileContent(content, updates), options);

  for (const [name, value] of Object.entries(updates)) {
    process.env[name] = value;
  }
}

async function runSetupWizard(missingVariables: string[]): Promise<void> {
  const envPath = path.resolve(process.cwd(), '.env');

  console.log(`
SearchCarriers Connect setup
----------------------------
Let's fill in the missing values. Press Ctrl+C at any time to cancel.
`);

  const updates = await collectMissingValues(missingVariables);

  if (!(await confirm(`Save ${Object.keys(updates).length} value(s) to .env?`))) {
    throw new Error('Setup cancelled without changing .env.');
  }

  await saveEnvironmentUpdates(envPath, updates);
  console.log('\nSetup complete. Starting the development server...\n');
}

export async function checkDevSetup(): Promise<void> {
  const missingVariables = findUnconfiguredVariables(process.env);

  if (missingVariables.length > 0) {
    const envFileExists = existsSync(path.resolve(process.cwd(), '.env'));

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error(buildSetupGuide(missingVariables, envFileExists));
    }

    await runSetupWizard(missingVariables);
  }

  loadConfig();
}

const entryPoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;

if (entryPoint === import.meta.url) {
  try {
    await checkDevSetup();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
