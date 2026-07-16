import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHash } from 'node:crypto';
import { generatePkce, generateState, statesMatch } from '../src/oauth.js';

describe('OAuth helpers', () => {
  it('creates an RFC 7636 S256 PKCE pair', () => {
    const { verifier, challenge } = generatePkce();
    const expected = createHash('sha256').update(verifier).digest('base64url');

    assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
    assert.equal(challenge, expected);
  });

  it('creates unpredictable state values and compares them safely', () => {
    const first = generateState();
    const second = generateState();

    assert.notEqual(first, second);
    assert.equal(statesMatch(first, first), true);
    assert.equal(statesMatch(first, second), false);
    assert.equal(statesMatch(first, undefined), false);
  });
});
