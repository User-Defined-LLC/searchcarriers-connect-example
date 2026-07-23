import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildSetupGuide,
  findUnconfiguredVariables,
  updateEnvFileContent,
} from '../src/check-dev-setup.js';

describe('development setup check', () => {
  it('lists missing and placeholder environment variables', () => {
    assert.deepEqual(
      findUnconfiguredVariables({
        APP_BASE_URL: 'http://localhost:3000',
        SESSION_SECRET: 'replace-with-at-least-32-random-characters',
        SC_BASE_URL: 'https://searchcarriers.com',
        SC_CLIENT_ID: '',
        SC_CLIENT_SECRET: 'configured-client-secret',
      }),
      ['SESSION_SECRET', 'SC_CLIENT_ID'],
    );
  });

  it('explains how to create an env file and obtain every required value', () => {
    const guide = buildSetupGuide(['SC_CLIENT_ID', 'SC_CLIENT_SECRET'], false);

    assert.match(guide, /cp \.env\.example \.env/);
    assert.match(guide, /openssl rand -base64 48/);
    assert.match(guide, /Settings > Apps > Develop an app/);
    assert.match(guide, /http:\/\/localhost:3000\/auth\/callback/);
    assert.match(guide, /SC_BASE_URL=https:\/\/searchcarriers\.com/);
    assert.match(guide, /Run npm run dev again/);
  });

  it('does not tell the user to overwrite an existing env file', () => {
    const guide = buildSetupGuide(['SESSION_SECRET'], true);

    assert.match(guide, /Open the existing \.env file/);
    assert.doesNotMatch(guide, /cp \.env\.example \.env/);
  });

  it('updates existing env values, preserves comments, and appends missing values', () => {
    const content = [
      '# Local app',
      'APP_BASE_URL=http://old.example',
      'SC_CLIENT_ID=',
      '',
    ].join('\n');

    assert.equal(
      updateEnvFileContent(content, {
        APP_BASE_URL: 'http://localhost:3000',
        SC_CLIENT_ID: 'new-client-id',
        SC_CLIENT_SECRET: 'secret with spaces',
      }),
      [
        '# Local app',
        'APP_BASE_URL=http://localhost:3000',
        'SC_CLIENT_ID=new-client-id',
        '',
        'SC_CLIENT_SECRET="secret with spaces"',
        '',
      ].join('\n'),
    );
  });
});
