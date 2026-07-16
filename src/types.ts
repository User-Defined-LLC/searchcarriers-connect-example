import type { SessionData } from 'express-session';

export type PendingAuthorization = {
  state: string;
  verifier: string;
  createdAt: number;
};

export type OAuthTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: string;
  scope: string[];
};

export type ConnectMe = {
  user: {
    id: number | string;
    name: string;
    email: string;
  };
  available_scopes: string[];
};

declare module 'express-session' {
  interface SessionData {
    pendingAuthorization?: PendingAuthorization;
    tokens?: OAuthTokenSet;
    me?: ConnectMe;
  }
}

export type MutableSession = SessionData;
