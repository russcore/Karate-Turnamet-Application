import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireMatchTatamiAccess } from '../auth/guards.js';
import { clearMatchResult, getBracketState, reorderMatch, setMatchResult, VersionConflictError } from '../services/bracket.js';
import { DECISIONS } from '../types.js';
import { notifyCategory } from '../ws/hub.js';

async function tatamiOf(categoryId: number): Promise<number | null> {
  const c = await prisma.category.findUnique({ where: { id: categoryId }, select: { tatamiId: true } });
  return c?.tatamiId ?? null;
}

export default async function matchRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.post('/:id/result', async (request, reply) => {
    const id = Number((request.params as any).id);
    const access = await requireMatchTatamiAccess(request, reply, id);
    if (!access.ok) return;
    const schema = z.object({
      winnerId: z.number().int(),
      decision: z.enum(DECISIONS as unknown as [string, ...string[]]).nullable().optional(),
      scoreA: z.number().int().nullable().optional(),
      scoreB: z.number().int().nullable().optional(),
      durationSec: z.number().int().nullable().optional(),
      notes: z.string().nullable().optional(),
      extensions: z.array(z.any()).optional(),
      expectedVersion: z.number().int().optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    try {
      const { categoryId } = await setMatchResult(id, parsed.data, request.user?.id);
      notifyCategory(categoryId, await tatamiOf(categoryId));
      return getBracketState(categoryId);
    } catch (err) {
      if (err instanceof VersionConflictError) return reply.code(409).send({ error: err.message });
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post('/:id/revert', async (request, reply) => {
    const id = Number((request.params as any).id);
    const access = await requireMatchTatamiAccess(request, reply, id);
    if (!access.ok) return;
    try {
      const { categoryId } = await clearMatchResult(id, request.user?.id);
      notifyCategory(categoryId, await tatamiOf(categoryId));
      return getBracketState(categoryId);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // Reorder a bout within its round (postpone a late fighter's bout, or bring one forward).
  app.post('/:id/reorder', async (request, reply) => {
    const id = Number((request.params as any).id);
    const access = await requireMatchTatamiAccess(request, reply, id);
    if (!access.ok) return;
    const schema = z.object({ direction: z.enum(['now', 'later']) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    try {
      const { categoryId } = await reorderMatch(id, parsed.data.direction, request.user?.id);
      notifyCategory(categoryId, await tatamiOf(categoryId));
      return getBracketState(categoryId);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // Append an extension/round entry before a winner is set ("if this round" chains).
  app.post('/:id/extension', async (request, reply) => {
    const id = Number((request.params as any).id);
    const access = await requireMatchTatamiAccess(request, reply, id);
    if (!access.ok) return;
    const schema = z.object({ scoreA: z.number().int().optional(), scoreB: z.number().int().optional(), note: z.string().optional() });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const match = await prisma.match.findUnique({ where: { id } });
    if (!match) return reply.code(404).send({ error: 'Match not found' });
    let extensions: any[] = [];
    try {
      extensions = JSON.parse(match.extensions);
    } catch {
      extensions = [];
    }
    extensions.push({ round: extensions.length + 1, ...parsed.data });
    await prisma.match.update({ where: { id }, data: { extensions: JSON.stringify(extensions) } });
    notifyCategory(access.categoryId!, await tatamiOf(access.categoryId!));
    return { extensions };
  });
}
