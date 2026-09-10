import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../auth/guards.js';
import { getActiveEventId } from '../services/eventService.js';
import { applyGroups, proposeGroups } from '../services/grouping/index.js';
import { generateBracket, getBracketState, simulateBracket } from '../services/bracket.js';
import { notifyCategory, notifyConfig, notifyPodium } from '../ws/hub.js';

export default async function categoryRoutes(app: FastifyInstance): Promise<void> {
  // List (public read). Optional ?tatamiId filter.
  app.get('/', async (request) => {
    const eventId = await getActiveEventId();
    const tatamiId = (request.query as any)?.tatamiId;
    const categories = await prisma.category.findMany({
      where: { eventId, ...(tatamiId ? { tatamiId: Number(tatamiId) } : {}) },
      include: {
        tatami: true,
        allowedRanks: { select: { rankId: true } },
        _count: { select: { entries: true } },
      },
      orderBy: [{ tatamiId: 'asc' }, { order: 'asc' }],
    });
    return categories.map((c) => ({
      ...c,
      allowedRankIds: c.allowedRanks.map((a) => a.rankId),
      entryCount: c._count.entries,
    }));
  });

  // Results/scoreboard: every category with its podium (places 1-3) + a medal tally by school.
  app.get('/results', async () => {
    const eventId = await getActiveEventId();
    const cats = await prisma.category.findMany({
      where: { eventId },
      include: { tatami: { select: { id: true, name: true } }, placements: { orderBy: { place: 'asc' } } },
      orderBy: [{ tatamiId: 'asc' }, { order: 'asc' }],
    });
    const fighterIds = [...new Set(cats.flatMap((c) => c.placements.map((p) => p.fighterId)))];
    const fighters = fighterIds.length
      ? await prisma.fighter.findMany({ where: { id: { in: fighterIds } }, select: { id: true, firstName: true, lastName: true, school: true } })
      : [];
    const fmap = new Map(fighters.map((f) => [f.id, f]));

    const tally = new Map<string, { school: string; gold: number; silver: number; bronze: number }>();
    const categories = cats.map((c) => {
      const medals = c.placements
        .filter((p) => p.place <= 3)
        .map((p) => {
          const f = fmap.get(p.fighterId);
          const school = f?.school ?? '—';
          if (p.place <= 3) {
            const row = tally.get(school) ?? { school, gold: 0, silver: 0, bronze: 0 };
            if (p.place === 1) row.gold++;
            else if (p.place === 2) row.silver++;
            else row.bronze++;
            tally.set(school, row);
          }
          return { place: p.place, name: f ? `${f.firstName} ${f.lastName}` : String(p.fighterId), school };
        });
      return {
        id: c.id, name: c.name, status: c.status, isSpecial: c.isSpecial,
        tatamiId: c.tatamiId, tatamiName: c.tatami?.name ?? null, medals,
      };
    });
    const schools = [...tally.values()].sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze);
    return { categories, schools };
  });

  app.get('/:id', async (request, reply) => {
    const id = Number((request.params as any).id);
    const cat = await prisma.category.findUnique({
      where: { id },
      include: {
        tatami: true,
        allowedRanks: { select: { rankId: true } },
        entries: { include: { fighter: { include: { rank: true } } }, orderBy: { seed: 'asc' } },
      },
    });
    if (!cat) return reply.code(404).send({ error: 'Category not found' });
    return { ...cat, allowedRankIds: cat.allowedRanks.map((a) => a.rankId) };
  });

  // ---- AI auto-grouping ----
  app.get('/grouping/preview', { preHandler: requireRole('admin') }, async () => {
    const eventId = await getActiveEventId();
    return proposeGroups(eventId);
  });

  app.post('/grouping/apply', { preHandler: requireRole('admin') }, async (request, reply) => {
    const schema = z.object({
      groups: z.array(
        z.object({
          name: z.string(),
          discipline: z.enum(['kumite', 'kata']).default('kumite'),
          gender: z.string().nullable(),
          ageMin: z.number(),
          ageMax: z.number(),
          weightMin: z.number(),
          weightMax: z.number(),
          rankIds: z.array(z.number().int()),
          fighterIds: z.array(z.number().int()),
        }),
      ),
      replace: z.boolean().optional(),
      assignTatamis: z.boolean().optional(),
      generateBrackets: z.boolean().optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const eventId = await getActiveEventId();
    const count = await applyGroups(eventId, parsed.data.groups, { replace: parsed.data.replace, assignTatamis: parsed.data.assignTatamis, userId: request.user?.id });
    let bracketsMade = 0;
    if (parsed.data.generateBrackets) {
      const cats = await prisma.category.findMany({ where: { eventId, bracket: null }, include: { _count: { select: { entries: true } } } });
      for (const c of cats) {
        if (c._count.entries < 2) continue;
        try { await generateBracket(c.id, 'rank', request.user?.id); bracketsMade++; } catch { /* skip */ }
      }
    }
    notifyConfig();
    return { created: count, brackets: bracketsMade };
  });

  // ---- CRUD ----
  const upsertSchema = z.object({
    name: z.string().min(1),
    discipline: z.enum(['kumite', 'kata']).default('kumite'),
    gender: z.string().nullable().optional(),
    ageMin: z.number().nullable().optional(),
    ageMax: z.number().nullable().optional(),
    weightMin: z.number().nullable().optional(),
    weightMax: z.number().nullable().optional(),
    tatamiId: z.number().int().nullable().optional(),
    order: z.number().int().optional(),
    boutDurationSec: z.number().int().min(10).max(1800).optional(),
    isSpecial: z.boolean().optional(),
    allowedRankIds: z.array(z.number().int()).optional(),
  });

  app.post('/', { preHandler: requireRole('admin') }, async (request, reply) => {
    const parsed = upsertSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const eventId = await getActiveEventId();
    const { allowedRankIds, ...data } = parsed.data;
    const count = await prisma.category.count({ where: { eventId } });
    const cat = await prisma.category.create({
      data: {
        eventId,
        ...data,
        order: data.order ?? count,
        allowedRanks: { create: (allowedRankIds ?? []).map((rankId) => ({ rankId })) },
      },
    });
    notifyConfig();
    return cat;
  });

  app.put('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const parsed = upsertSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const { allowedRankIds, ...data } = parsed.data;
    await prisma.$transaction(async (tx) => {
      await tx.category.update({ where: { id }, data });
      if (allowedRankIds) {
        await tx.categoryAllowedRank.deleteMany({ where: { categoryId: id } });
        for (const rankId of allowedRankIds) await tx.categoryAllowedRank.create({ data: { categoryId: id, rankId } });
      }
    });
    const tatamiId = (await prisma.category.findUnique({ where: { id }, select: { tatamiId: true } }))?.tatamiId;
    notifyCategory(id, tatamiId);
    notifyConfig();
    return { ok: true };
  });

  app.delete('/:id', { preHandler: requireRole('admin') }, async (request) => {
    const id = Number((request.params as any).id);
    await prisma.category.delete({ where: { id } });
    notifyConfig();
    return { ok: true };
  });

  app.post('/reorder', { preHandler: requireRole('admin') }, async (request, reply) => {
    const schema = z.object({ orderedIds: z.array(z.number().int()) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    await prisma.$transaction(parsed.data.orderedIds.map((id, i) => prisma.category.update({ where: { id }, data: { order: i } })));
    notifyConfig();
    return { ok: true };
  });

  // ---- Entries ----
  app.post('/:id/entries', { preHandler: requireRole('admin') }, async (request, reply) => {
    const categoryId = Number((request.params as any).id);
    const schema = z.object({ fighterId: z.number().int(), seed: z.number().int().optional() });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const target = await prisma.category.findUnique({ where: { id: categoryId }, select: { isSpecial: true, gender: true } });
    if (!target) return reply.code(404).send({ error: 'Category not found' });

    // Regular (non-special) groups have two hard rules. Special bouts (exhibitions) are exempt.
    if (!target.isSpecial) {
      const fighter = await prisma.fighter.findUnique({ where: { id: parsed.data.fighterId }, select: { gender: true } });

      // 1) Gender: a mixed F-vs-M fight is only allowed in a special bout.
      if (target.gender && fighter?.gender && target.gender !== fighter.gender) {
        return reply.code(409).send({
          error: `Gender mismatch — this group is ${target.gender} only. F vs M is allowed in special bouts only.`,
        });
      }

      // 2) Avoid duplicate fights: a fighter may belong to only ONE regular group. To move a
      // fighter between regular groups, remove them from the current one first.
      const existing = await prisma.categoryEntry.findFirst({
        where: { fighterId: parsed.data.fighterId, category: { isSpecial: false } },
        include: { category: { select: { name: true } } },
      });
      if (existing) {
        return reply.code(409).send({
          error: `Already in "${existing.category.name}". Remove them there first — a fighter can be in only one regular group.`,
        });
      }
    }

    const count = await prisma.categoryEntry.count({ where: { categoryId } });
    const entry = await prisma.categoryEntry.create({
      data: { categoryId, fighterId: parsed.data.fighterId, seed: parsed.data.seed ?? count + 1 },
    });
    notifyConfig();
    return entry;
  });

  // Fill a group with all UNASSIGNED fighters matching its criteria (gender/age/weight/ranks).
  app.post('/:id/fill', { preHandler: requireRole('admin') }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const cat = await prisma.category.findUnique({ where: { id }, include: { allowedRanks: { select: { rankId: true } } } });
    if (!cat) return reply.code(404).send({ error: 'Category not found' });
    const rankIds = cat.allowedRanks.map((a) => a.rankId);
    const matches = await prisma.fighter.findMany({
      where: {
        eventId: cat.eventId,
        entries: { none: {} },
        ...(cat.gender ? { gender: cat.gender } : {}),
        ...(cat.ageMin != null ? { age: { gte: cat.ageMin, ...(cat.ageMax != null ? { lte: cat.ageMax } : {}) } } : cat.ageMax != null ? { age: { lte: cat.ageMax } } : {}),
        ...(cat.weightMin != null ? { weight: { gte: cat.weightMin, ...(cat.weightMax != null ? { lte: cat.weightMax } : {}) } } : cat.weightMax != null ? { weight: { lte: cat.weightMax } } : {}),
        ...(rankIds.length ? { rankId: { in: rankIds } } : {}),
      },
    });
    let seed = await prisma.categoryEntry.count({ where: { categoryId: id } });
    for (const f of matches) {
      await prisma.categoryEntry.create({ data: { categoryId: id, fighterId: f.id, seed: ++seed } });
    }
    notifyConfig();
    return { added: matches.length };
  });

  // Manual bout order: set seeds from an ordered list of fighter ids.
  app.post('/:id/entries/reorder', { preHandler: requireRole('admin') }, async (request, reply) => {
    const categoryId = Number((request.params as any).id);
    const schema = z.object({ orderedFighterIds: z.array(z.number().int()) });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    await prisma.$transaction(
      parsed.data.orderedFighterIds.map((fighterId, i) =>
        prisma.categoryEntry.updateMany({ where: { categoryId, fighterId }, data: { seed: i + 1 } }),
      ),
    );
    notifyConfig();
    return { ok: true };
  });

  app.delete('/:id/entries/:fighterId', { preHandler: requireRole('admin') }, async (request) => {
    const categoryId = Number((request.params as any).id);
    const fighterId = Number((request.params as any).fighterId);
    await prisma.categoryEntry.deleteMany({ where: { categoryId, fighterId } });
    notifyConfig();
    return { ok: true };
  });

  // ---- Bracket ----
  app.post('/:id/bracket', { preHandler: requireRole('admin') }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const schema = z.object({ mode: z.enum(['random', 'rank', 'manual', 'age', 'weight']).default('rank') });
    const parsed = schema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    try {
      await generateBracket(id, parsed.data.mode, request.user?.id);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
    const tatamiId = (await prisma.category.findUnique({ where: { id }, select: { tatamiId: true } }))?.tatamiId;
    notifyCategory(id, tatamiId);
    return getBracketState(id);
  });

  // Create a manual "special bout" — a small hand-picked category (e.g. a 2-fighter match).
  app.post('/special-bout', { preHandler: requireRole('admin') }, async (request, reply) => {
    const schema = z.object({
      fighterIds: z.array(z.number().int()).min(2).max(8),
      name: z.string().optional(),
      tatamiId: z.number().int().nullable().optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const eventId = await getActiveEventId();
    const order = await prisma.category.count({ where: { eventId } });
    const cat = await prisma.category.create({
      data: {
        eventId,
        name: parsed.data.name || 'Special bout',
        discipline: 'kumite',
        isSpecial: true,
        tatamiId: parsed.data.tatamiId ?? null,
        order,
        entries: { create: parsed.data.fighterIds.map((fighterId, i) => ({ fighterId, seed: i + 1 })) },
      },
    });
    try {
      await generateBracket(cat.id, 'manual', request.user?.id);
    } catch {
      /* leave without a bracket if generation fails */
    }
    notifyConfig();
    return { id: cat.id };
  });

  // Simulate a single category (auto-play with random winners).
  app.post('/:id/simulate', { preHandler: requireRole('admin') }, async (request, reply) => {
    const id = Number((request.params as any).id);
    try {
      await simulateBracket(id, request.user?.id);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
    const tatamiId = (await prisma.category.findUnique({ where: { id }, select: { tatamiId: true } }))?.tatamiId;
    notifyCategory(id, tatamiId);
    return getBracketState(id);
  });

  // Simulate every category (optionally on one tatami) — great for demoing a full tatami.
  app.post('/simulate-all', { preHandler: requireRole('admin') }, async (request, reply) => {
    const eventId = await getActiveEventId();
    const tatamiId = (request.body as any)?.tatamiId;
    const cats = await prisma.category.findMany({
      where: { eventId, ...(tatamiId ? { tatamiId: Number(tatamiId) } : {}), entries: { some: {} } },
      include: { _count: { select: { entries: true } } },
    });
    let done = 0;
    for (const c of cats) {
      if (c._count.entries < 2) continue;
      await simulateBracket(c.id, request.user?.id);
      notifyCategory(c.id, c.tatamiId);
      done++;
    }
    notifyConfig();
    return { simulated: done };
  });

  // Announce a category's podium — every projector screen shows the winners full-screen.
  app.post('/:id/announce', { preHandler: requireAuth }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const cat = await prisma.category.findUnique({ where: { id }, select: { id: true } });
    if (!cat) return reply.code(404).send({ error: 'Category not found' });
    notifyPodium(id);
    return { ok: true };
  });

  // Public read (projector needs it without login).
  app.get('/:id/bracket', async (request, reply) => {
    const id = Number((request.params as any).id);
    const state = await getBracketState(id);
    if (!state) return reply.code(404).send({ error: 'No bracket generated for this category' });
    return state;
  });
}
