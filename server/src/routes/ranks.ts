import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireRole } from '../auth/guards.js';
import { getActiveEventId } from '../services/eventService.js';
import { notifyConfig } from '../ws/hub.js';

export default async function rankRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async () => {
    const eventId = await getActiveEventId();
    const ranks = await prisma.rank.findMany({
      where: { eventId },
      orderBy: { order: 'asc' },
      include: { aliases: true, _count: { select: { fighters: true } } },
    });
    return ranks.map((r) => ({
      id: r.id,
      name: r.name,
      beltColor: r.beltColor,
      stripeColor: r.stripeColor,
      stripeCount: r.stripeCount,
      order: r.order,
      shortCode: r.shortCode,
      aliases: r.aliases.map((a) => ({ id: a.id, value: a.value })),
      inUse: r._count.fighters,
    }));
  });

  app.post('/', { preHandler: requireRole('admin') }, async (request, reply) => {
    const schema = z.object({
      name: z.string().min(1),
      beltColor: z.string().optional(),
      stripeColor: z.string().nullable().optional(),
      stripeCount: z.number().int().min(0).max(10).optional(),
      shortCode: z.string().nullable().optional(),
      aliases: z.array(z.string()).optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const eventId = await getActiveEventId();
    const count = await prisma.rank.count({ where: { eventId } });
    const rank = await prisma.rank.create({
      data: {
        eventId,
        name: parsed.data.name,
        beltColor: parsed.data.beltColor ?? '#000000',
        stripeColor: parsed.data.stripeColor ?? null,
        stripeCount: parsed.data.stripeCount ?? 0,
        shortCode: parsed.data.shortCode ?? null,
        order: count,
        aliases: { create: (parsed.data.aliases ?? []).map((value) => ({ value })) },
      },
    });
    notifyConfig();
    return rank;
  });

  app.put('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const schema = z.object({
      name: z.string().min(1).optional(),
      beltColor: z.string().optional(),
      stripeColor: z.string().nullable().optional(),
      stripeCount: z.number().int().min(0).max(10).optional(),
      shortCode: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const rank = await prisma.rank.update({ where: { id }, data: parsed.data });
    notifyConfig();
    return rank;
  });

  // Drag-and-drop reorder: full ordered list of ids.
  app.post('/reorder', { preHandler: requireRole('admin') }, async (request, reply) => {
    const schema = z.object({ orderedIds: z.array(z.number().int()) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    await prisma.$transaction(
      parsed.data.orderedIds.map((id, i) => prisma.rank.update({ where: { id }, data: { order: i } })),
    );
    notifyConfig();
    return { ok: true };
  });

  app.post('/:id/aliases', { preHandler: requireRole('admin') }, async (request, reply) => {
    const rankId = Number((request.params as any).id);
    const schema = z.object({ value: z.string().min(1) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const alias = await prisma.rankAlias.create({ data: { rankId, value: parsed.data.value } });
    return alias;
  });

  app.delete('/aliases/:aliasId', { preHandler: requireRole('admin') }, async (request) => {
    const aliasId = Number((request.params as any).aliasId);
    await prisma.rankAlias.delete({ where: { id: aliasId } });
    return { ok: true };
  });

  // A rank in use cannot be hard-deleted; offer merge instead.
  app.delete('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const inUse = await prisma.fighter.count({ where: { rankId: id } });
    if (inUse > 0) {
      return reply.code(409).send({ error: `Rank is used by ${inUse} fighter(s). Merge it into another rank instead.`, inUse });
    }
    await prisma.rank.delete({ where: { id } });
    notifyConfig();
    return { ok: true };
  });

  app.post('/:id/merge', { preHandler: requireRole('admin') }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const schema = z.object({ targetRankId: z.number().int() });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const target = parsed.data.targetRankId;
    if (target === id) return reply.code(400).send({ error: 'Cannot merge a rank into itself' });
    await prisma.$transaction(async (tx) => {
      await tx.fighter.updateMany({ where: { rankId: id }, data: { rankId: target } });
      await tx.fighter.updateMany({ where: { teacherRankId: id }, data: { teacherRankId: target } });
      // Move allowed-rank links, ignoring duplicates.
      const links = await tx.categoryAllowedRank.findMany({ where: { rankId: id } });
      for (const l of links) {
        await tx.categoryAllowedRank.deleteMany({ where: { categoryId: l.categoryId, rankId: id } });
        await tx.categoryAllowedRank.upsert({
          where: { categoryId_rankId: { categoryId: l.categoryId, rankId: target } },
          create: { categoryId: l.categoryId, rankId: target },
          update: {},
        });
      }
      await tx.rank.delete({ where: { id } });
    });
    notifyConfig();
    return { ok: true };
  });
}
