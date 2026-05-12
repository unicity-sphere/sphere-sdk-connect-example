import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { verifySphereAuth, AuthVerificationError } from '@unicitylabs/sphere-sdk';

const CHALLENGE_TTL_MS = 5 * 60_000;
const challenges = new Map<string, { challenge: string; expiresAt: number }>();

export async function authRoutes(server: FastifyInstance): Promise<void> {
  server.post<{ Body: { chainPubkey: string } }>('/auth/challenge', async (req, reply) => {
    const { chainPubkey } = req.body;
    if (!chainPubkey) return reply.status(400).send({ error: 'chainPubkey required' });

    const nonce = randomBytes(16).toString('hex');
    const challenge = [
      'Sign in to Sphere Connect Example',
      `Domain: ${req.headers.host ?? 'localhost'}`,
      `Chain Public Key: ${chainPubkey}`,
      `Nonce: ${nonce}`,
      `Issued At: ${new Date().toISOString()}`,
    ].join('\n');

    challenges.set(chainPubkey, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
    return { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS };
  });

  server.post<{ Body: { chainPubkey: string; signature: string } }>('/auth/verify', async (req, reply) => {
    const { chainPubkey, signature } = req.body;
    const stored = challenges.get(chainPubkey);

    if (!stored) return reply.status(401).send({ error: 'No challenge — request a new one' });
    if (Date.now() > stored.expiresAt) {
      challenges.delete(chainPubkey);
      return reply.status(401).send({ error: 'Challenge expired' });
    }
    challenges.delete(chainPubkey);

    try {
      const { chainPubkey: pk, directAddress } = await verifySphereAuth({
        challenge: stored.challenge,
        signature,
        chainPubkey,
      });
      const jwt = await reply.jwtSign({ sub: pk, addr: directAddress }, { expiresIn: '24h' });
      return { jwt };
    } catch (err) {
      if (err instanceof AuthVerificationError) {
        return reply.status(401).send({ error: err.message, code: err.code });
      }
      throw err;
    }
  });

  server.get('/me', {
    preHandler: async (req, reply) => {
      try {
        await req.jwtVerify();
      } catch {
        reply.status(401).send({ error: 'Unauthorized' });
      }
    },
  }, async (req) => {
    const { sub, addr } = req.user as { sub: string; addr: string };
    return { chainPubkey: sub, directAddress: addr };
  });
}
