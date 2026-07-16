# Production checklist

The example keeps its dependencies and infrastructure intentionally small. Complete these items before adapting it for production.

## OAuth and credentials

- Register every production redirect URI exactly in the SearchCarriers developer app.
- Store `SC_CLIENT_SECRET` and `SESSION_SECRET` in a managed secret store, not an environment file committed to source control.
- Keep the OAuth token exchange and refresh grant on a trusted server.
- Generate a different PKCE verifier and `state` for every authorization attempt.
- Preserve refresh-token rotation: replace the stored refresh token whenever SearchCarriers returns a new one.
- Add a reauthentication path when refresh fails or the user revokes the app.

## Sessions and data

- Replace the `express-session` memory store with Redis, a database-backed store, or another durable encrypted store.
- Encrypt OAuth tokens at rest and restrict token access to the minimum application services.
- Set an intentional session lifetime and delete server-side session data on sign-out.
- Decide whether “disconnect” clears only the local session or also guides the user to revoke the SearchCarriers grant under **Settings > Apps**.
- Avoid logging authorization codes, client secrets, access tokens, refresh tokens, or full callback URLs.

## Web security

- Serve the application over HTTPS and set `APP_BASE_URL` to the exact public origin.
- Keep secure, HTTP-only, same-site cookies enabled.
- Add CSRF protection to application mutations as the app grows.
- Restrict proxy routes to a deliberate allowlist; never accept an arbitrary upstream URL from the browser.
- Validate and cap all user-controlled query parameters and request bodies.
- Review Helmet's Content Security Policy whenever adding third-party scripts or media.

## Connect behavior

- Call `/api/connect/v1/me` after token exchange and re-check it when a Connect request returns `403`.
- Treat `available_scopes` as dynamic. Do not assume scopes remain usable for the life of a refresh token.
- Continue to enforce feature access in server routes even when the browser hides unavailable controls.
- Handle `401`, `403`, `422`, and `429` distinctly.
- Add bounded retry behavior with jitter only for safe, idempotent requests.
- Monitor monthly usage and per-minute rate-limit responses.

## Operations

- Add structured logs with request IDs while redacting credentials and personal data.
- Monitor OAuth callback failures, token refresh failures, Connect API latency, `403` changes, and `429` responses.
- Run at least two application instances behind a health-checked load balancer when availability requires it.
- Pin and audit dependencies; run the tests, type check, and build in CI.
- Test reconnect, revocation, plan downgrade, suspended app, expired token, and unavailable SearchCarriers scenarios before launch.
