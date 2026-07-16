import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export type PkcePair = {
  verifier: string;
  challenge: string;
};

function base64Url(value: Buffer): string {
  return value.toString('base64url');
}

export function generatePkce(): PkcePair {
  const verifier = base64Url(randomBytes(64));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());

  return { verifier, challenge };
}

export function generateState(): string {
  return base64Url(randomBytes(32));
}

export function statesMatch(expected: string | undefined, received: string | undefined): boolean {
  if (!expected || !received) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}
