import { AccessToken } from 'livekit-server-sdk';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

export function registerLiveKitRoutes(app: FastifyInstance, getMemberName: (roomId: string, socketId: string) => string | null) {
  const schema = z.object({ roomId: z.string().min(1), socketId: z.string().min(1) });
  app.post('/api/livekit/token', async (request, reply) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success || !getMemberName(parsed.data.roomId, parsed.data.socketId)) {
      return reply.code(403).send({ error: 'Join the game room before connecting media' });
    }
    const url = process.env.LIVEKIT_URL;
    const key = process.env.LIVEKIT_API_KEY;
    const secret = process.env.LIVEKIT_API_SECRET;
    if (!url || !key || !secret) return reply.code(503).send({ error: 'LiveKit is not configured' });
    const token = new AccessToken(key, secret, { identity: parsed.data.socketId, name: getMemberName(parsed.data.roomId, parsed.data.socketId)!, ttl: '2h' });
    token.addGrant({ roomJoin: true, room: 'dndvtt-' + parsed.data.roomId, canPublish: true, canSubscribe: true });
    return { url, token: await token.toJwt() };
  });
}
