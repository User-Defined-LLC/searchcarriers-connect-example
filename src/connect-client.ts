import type { AppConfig } from './config.js';
import type { MutableSession, OAuthTokenSet } from './types.js';

type TokenEndpointResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
};

export class ConnectApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly details: unknown,
  ) {
    super(`SearchCarriers Connect request failed with status ${status}.`);
  }
}

function tokenSet(payload: TokenEndpointResponse, previousRefreshToken?: string): OAuthTokenSet {
  if (!payload.access_token || !Number.isFinite(payload.expires_in)) {
    throw new Error('The OAuth token response was missing required fields.');
  }

  const refreshToken = payload.refresh_token ?? previousRefreshToken;

  if (!refreshToken) {
    throw new Error('The OAuth token response did not include a refresh token.');
  }

  return {
    accessToken: payload.access_token,
    refreshToken,
    expiresAt: Date.now() + payload.expires_in * 1_000,
    tokenType: payload.token_type ?? 'Bearer',
    scope: payload.scope?.split(/\s+/).filter(Boolean) ?? [],
  };
}

async function tokenRequest(config: AppConfig, parameters: URLSearchParams): Promise<TokenEndpointResponse> {
  const response = await fetch(`${config.searchCarriersBaseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: parameters,
  });

  const payload = (await response.json().catch(() => ({}))) as TokenEndpointResponse & { message?: string };

  if (!response.ok) {
    throw new ConnectApiError(response.status, payload);
  }

  return payload;
}

export async function exchangeAuthorizationCode(
  config: AppConfig,
  code: string,
  verifier: string,
): Promise<OAuthTokenSet> {
  const payload = await tokenRequest(
    config,
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: `${config.appBaseUrl}/auth/callback`,
      code,
      code_verifier: verifier,
    }),
  );

  return tokenSet(payload);
}

export async function refreshAccessToken(config: AppConfig, current: OAuthTokenSet): Promise<OAuthTokenSet> {
  const payload = await tokenRequest(
    config,
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: current.refreshToken,
    }),
  );

  return tokenSet(payload, current.refreshToken);
}

async function currentAccessToken(config: AppConfig, session: MutableSession): Promise<string> {
  if (!session.tokens) {
    throw new ConnectApiError(401, { message: 'Connect your SearchCarriers account first.' });
  }

  if (session.tokens.expiresAt <= Date.now() + 30_000) {
    session.tokens = await refreshAccessToken(config, session.tokens);
  }

  return session.tokens.accessToken;
}

export async function connectRequest<T>(
  config: AppConfig,
  session: MutableSession,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const send = async (): Promise<Response> => {
    const accessToken = await currentAccessToken(config, session);

    return fetch(`${config.searchCarriersBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...init.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    });
  };

  let response = await send();

  if (response.status === 401 && session.tokens) {
    session.tokens = await refreshAccessToken(config, session.tokens);
    response = await send();
  }

  const payload = (await response.json().catch(() => ({}))) as T;

  if (!response.ok) {
    throw new ConnectApiError(response.status, payload);
  }

  return payload;
}
