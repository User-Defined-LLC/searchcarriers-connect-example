import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCompanyFields } from './connect-fields.js';
import { ConnectApiError, connectRequest, exchangeAuthorizationCode } from './connect-client.js';
import { loadConfig, type AppConfig } from './config.js';
import { generatePkce, generateState, statesMatch } from './oauth.js';
import type { ConnectMe } from './types.js';

const publicDirectory = path.resolve(process.cwd(), 'public');

function singleQueryValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof ConnectApiError) {
    const details = error.details as { message?: unknown; error_description?: unknown };
    const message = details?.message ?? details?.error_description;

    return typeof message === 'string' ? message : error.message;
  }

  return error instanceof Error ? error.message : 'Unexpected error.';
}

export function createApp(config: AppConfig): express.Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  app.use(
    session({
      name: 'sc_connect_example',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.production,
        maxAge: 8 * 60 * 60 * 1_000,
      },
    }),
  );

  app.get('/auth/connect', (request, response) => {
    const { verifier, challenge } = generatePkce();
    const state = generateState();

    request.session.pendingAuthorization = {
      state,
      verifier,
      createdAt: Date.now(),
    };

    const parameters = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: `${config.appBaseUrl}/auth/callback`,
      response_type: 'code',
      scope: config.scopes.join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    response.redirect(`${config.searchCarriersBaseUrl}/oauth/authorize?${parameters.toString()}`);
  });

  app.get('/auth/callback', async (request, response) => {
    const code = singleQueryValue(request.query.code);
    const state = singleQueryValue(request.query.state);
    const oauthError = singleQueryValue(request.query.error_description) ?? singleQueryValue(request.query.error);
    const pending = request.session.pendingAuthorization;
    delete request.session.pendingAuthorization;

    if (oauthError) {
      response.redirect(`/?error=${encodeURIComponent(oauthError)}`);
      return;
    }

    if (!pending || Date.now() - pending.createdAt > 10 * 60 * 1_000 || !statesMatch(pending.state, state)) {
      response.status(400).send('Invalid or expired OAuth state. Start the connection again.');
      return;
    }

    if (!code) {
      response.status(400).send('The authorization response did not include a code.');
      return;
    }

    try {
      const tokens = await exchangeAuthorizationCode(config, code, pending.verifier);

      await new Promise<void>((resolve, reject) => {
        request.session.regenerate((error) => (error ? reject(error) : resolve()));
      });

      request.session.tokens = tokens;
      request.session.me = await connectRequest<ConnectMe>(config, request.session, '/api/connect/v1/me');
      response.redirect('/?connected=1');
    } catch (error) {
      delete request.session.tokens;
      delete request.session.me;
      response.redirect(`/?error=${encodeURIComponent(errorMessage(error))}`);
    }
  });

  app.post('/auth/disconnect', (request, response, next) => {
    request.session.destroy((error) => {
      if (error) {
        next(error);
        return;
      }

      response.clearCookie('sc_connect_example');
      response.json({ ok: true });
    });
  });

  app.get('/api/session', async (request, response, next) => {
    if (!request.session.tokens) {
      response.json({ connected: false, available_scopes: [] });
      return;
    }

    try {
      const me = await connectRequest<ConnectMe>(config, request.session, '/api/connect/v1/me');
      request.session.me = me;
      response.json({ connected: true, ...me });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/search', async (request, response, next) => {
    const query = singleQueryValue(request.query.q)?.trim();

    if (!query || query.length > 200) {
      response.status(422).json({ message: 'Enter a search term between 1 and 200 characters.' });
      return;
    }

    try {
      const payload = await connectRequest(
        config,
        request.session,
        `/api/connect/v1/search?${new URLSearchParams({ superSearchTerm: query }).toString()}`,
      );
      response.json(payload);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/company/:dotNumber', async (request, response, next) => {
    const dotNumber = request.params.dotNumber;

    if (!dotNumber || !/^\d{1,10}$/.test(dotNumber)) {
      response.status(422).json({ message: 'DOT number must contain only digits.' });
      return;
    }

    const requested = (singleQueryValue(request.query.include) ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const availableScopes = request.session.me?.available_scopes ?? [];
    const fields = buildCompanyFields(requested, availableScopes);
    const parameters = new URLSearchParams({ fields: fields.join(',') });

    try {
      const payload = await connectRequest(
        config,
        request.session,
        `/api/connect/v1/company/${dotNumber}?${parameters.toString()}`,
      );
      response.json(payload);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/watches', async (request, response, next) => {
    try {
      response.json(await connectRequest(config, request.session, '/api/connect/v1/watches'));
    } catch (error) {
      next(error);
    }
  });

  app.use(express.static(publicDirectory, { extensions: ['html'] }));

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const status = error instanceof ConnectApiError ? error.status : 500;
    response.status(status).json({ message: errorMessage(error) });
  });

  return app;
}

const entryPoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;

if (entryPoint === import.meta.url) {
  const config = loadConfig();
  createApp(config).listen(config.port, () => {
    console.log(`SearchCarriers Connect example running at ${config.appBaseUrl}`);
  });
}
