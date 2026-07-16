import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import request from 'supertest';
import type { AppConfig } from '../src/config.js';
import { createApp } from '../src/server.js';

const originalFetch = global.fetch;
const config: AppConfig = {
  port: 3000,
  appBaseUrl: 'http://localhost:3000',
  sessionSecret: 'test-session-secret-that-is-long-enough',
  searchCarriersBaseUrl: 'https://searchcarriers.test',
  clientId: 'example-client-id',
  clientSecret: 'example-client-secret',
  scopes: ['search', 'company:read', 'risk:read', 'vetting:read'],
  oauthPrompt: 'login consent',
  production: false,
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe('reference app OAuth flow', () => {
  it('starts authorization with state and S256 PKCE', async () => {
    const response = await request(createApp(config)).get('/auth/connect').expect(302);
    assert.ok(response.headers.location);
    const location = new URL(response.headers.location);

    assert.equal(location.origin, config.searchCarriersBaseUrl);
    assert.equal(location.pathname, '/oauth/authorize');
    assert.equal(location.searchParams.get('client_id'), config.clientId);
    assert.equal(location.searchParams.get('redirect_uri'), 'http://localhost:3000/auth/callback');
    assert.equal(location.searchParams.get('response_type'), 'code');
    assert.equal(location.searchParams.get('scope'), config.scopes.join(' '));
    assert.equal(location.searchParams.get('prompt'), 'login consent');
    assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(location.searchParams.get('state'));
    assert.ok(location.searchParams.get('code_challenge'));
  });

  it('rejects a callback whose state does not match the session', async () => {
    const agent = request.agent(createApp(config));
    await agent.get('/auth/connect').expect(302);
    await agent.get('/auth/callback?code=test-code&state=wrong-state').expect(400);
  });

  it('exchanges the code server-side and gates optional fields with available scopes', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    global.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      calls.push({ url, init });

      if (url.endsWith('/oauth/token')) {
        return jsonResponse({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: config.scopes.join(' '),
        });
      }

      if (url.endsWith('/api/connect/v1/me')) {
        return jsonResponse({
          user: { id: '42', name: 'Test Developer', email: 'developer@example.com' },
          available_scopes: ['search', 'company:read', 'risk:read'],
        });
      }

      if (url.includes('/api/connect/v1/company/123456')) {
        return jsonResponse({ data: { dot_number: '123456', legal_name: 'Example Carrier' } });
      }

      return jsonResponse({ message: 'Unexpected test URL.' }, 500);
    };

    const agent = request.agent(createApp(config));
    const authorize = await agent.get('/auth/connect').expect(302);
    assert.ok(authorize.headers.location);
    const state = new URL(authorize.headers.location).searchParams.get('state');

    await agent.get(`/auth/callback?code=test-code&state=${encodeURIComponent(state ?? '')}`).expect(302);
    const companyResponse = await agent.get('/api/company/123456?include=risk,vetting').expect(200);

    const tokenCall = calls.find((call) => call.url.endsWith('/oauth/token'));
    assert.ok(tokenCall);
    assert.equal((tokenCall.init?.body as URLSearchParams).get('client_secret'), config.clientSecret);
    assert.ok((tokenCall.init?.body as URLSearchParams).get('code_verifier'));

    const companyCall = calls.find((call) => call.url.includes('/api/connect/v1/company/123456'));
    assert.ok(companyCall);
    const fields = new URL(companyCall.url).searchParams.get('fields')?.split(',');
    assert.deepEqual(fields, [
      'contact',
      'logo',
      'operation',
      'service_areas',
      'risk_factors',
      'basic_scores',
    ]);
    assert.equal(companyCall.init?.headers instanceof Headers, false);
    assert.equal((companyCall.init?.headers as Record<string, string>).Authorization, 'Bearer access-token');
    assert.equal(companyResponse.body.data.example_score.rating, 'Elevated');
    assert.equal(companyResponse.body.data.example_score.coverage, 'Limited');
  });
});
