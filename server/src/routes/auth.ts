import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { verifyPassword } from '../auth/passwords.js';
import { clearSession, issueSession } from '../auth/session.js';
import { requireAuth } from '../auth/guards.js';

const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'username and password required' });
    const { username, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { username }, include: { tatamis: true } });
    if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: 'Invalid username or password' });
    }
    issueSession(reply, user.id);
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.displayName,
      tatamiIds: user.tatamis.map((t) => t.tatamiId),
    };
  });

  app.post('/logout', async (_request, reply) => {
    clearSession(reply);
    return { ok: true };
  });

  app.get('/me', { preHandler: requireAuth }, async (request) => {
    return request.user;
  });
}
