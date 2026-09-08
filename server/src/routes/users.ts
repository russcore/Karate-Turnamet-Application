import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireRole } from '../auth/guards.js';
import { hashPassword } from '../auth/passwords.js';
import { ROLES } from '../types.js';

export default async function userRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireRole('admin'));

  app.get('/', async () => {
    const users = await prisma.user.findMany({
      orderBy: { id: 'asc' },
      include: { tatamis: { select: { tatamiId: true } } },
    });
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      role: u.role,
      displayName: u.displayName,
      active: u.active,
      tatamiIds: u.tatamis.map((t) => t.tatamiId),
    }));
  });

  app.post('/', async (request, reply) => {
    const schema = z.object({
      username: z.string().min(1),
      password: z.string().min(4),
      role: z.enum(ROLES as [string, ...string[]]),
      displayName: z.string().nullable().optional(),
      tatamiIds: z.array(z.number().int()).optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const exists = await prisma.user.findUnique({ where: { username: parsed.data.username } });
    if (exists) return reply.code(409).send({ error: 'Username already exists' });
    const user = await prisma.user.create({
      data: {
        username: parsed.data.username,
        passwordHash: await hashPassword(parsed.data.password),
        role: parsed.data.role,
        displayName: parsed.data.displayName ?? null,
        tatamis: { create: (parsed.data.tatamiIds ?? []).map((tatamiId) => ({ tatamiId })) },
      },
    });
    return { id: user.id };
  });

  app.put('/:id', async (request, reply) => {
    const id = Number((request.params as any).id);
    const schema = z.object({
      password: z.string().min(4).optional(),
      role: z.enum(ROLES as [string, ...string[]]).optional(),
      displayName: z.string().nullable().optional(),
      active: z.boolean().optional(),
      tatamiIds: z.array(z.number().int()).optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const { password, tatamiIds, ...rest } = parsed.data;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { ...rest, ...(password ? { passwordHash: await hashPassword(password) } : {}) },
      });
      if (tatamiIds) {
        await tx.userTatami.deleteMany({ where: { userId: id } });
        for (const tatamiId of tatamiIds) await tx.userTatami.create({ data: { userId: id, tatamiId } });
      }
    });
    return { ok: true };
  });

  app.delete('/:id', async (request, reply) => {
    const id = Number((request.params as any).id);
    const user = await prisma.user.findUnique({ where: { id } });
    if (user?.role === 'admin') {
      const admins = await prisma.user.count({ where: { role: 'admin' } });
      if (admins <= 1) return reply.code(400).send({ error: 'Cannot delete the last admin' });
    }
    await prisma.user.delete({ where: { id } });
    return { ok: true };
  });
}
