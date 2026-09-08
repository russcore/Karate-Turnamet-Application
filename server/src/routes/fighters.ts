import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireRole } from '../auth/guards.js';
import { getActiveEventId } from '../services/eventService.js';
import { bracketOf, genderLabelOf } from '../services/grouping/local.js';
import { getAiSettings } from '../services/grouping/index.js';

const fighterSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  school: z.string().nullable().optional(),
  teacherName: z.string().nullable().optional(),
  teacherRankId: z.number().int().nullable().optional(),
  rankId: z.number().int(),
  age: z.number().int().positive(),
  weight: z.number().positive(),
  gender: z.enum(['M', 'F']).nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export default async function fighterRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', async (request) => {
    const eventId = await getActiveEventId();
    const q = ((request.query as any)?.q ?? '').toString().trim();
    const fighters = await prisma.fighter.findMany({
      where: {
        eventId,
        ...(q
          ? { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { school: { contains: q } }] }
          : {}),
      },
      include: {
        rank: { select: { name: true, beltColor: true, stripeColor: true, stripeCount: true } },
        entries: { include: { category: { select: { id: true, name: true, tatami: { select: { name: true } } } } } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return fighters.map((f) => {
      const cat = f.entries[0]?.category;
      const { entries, ...rest } = f;
      return { ...rest, categoryName: cat?.name ?? null, categoryId: cat?.id ?? null, tatamiName: cat?.tatami?.name ?? null };
    });
  });

  app.get('/count', async () => {
    const eventId = await getActiveEventId();
    return { count: await prisma.fighter.count({ where: { eventId } }) };
  });

  // Fighters not in any category — candidates for a manual "special bout", with the reason why.
  app.get('/unassigned', async () => {
    const eventId = await getActiveEventId();
    const unassigned = await prisma.fighter.findMany({
      where: { eventId, entries: { none: {} } },
      include: { rank: { select: { name: true, beltColor: true, stripeColor: true, stripeCount: true } } },
      orderBy: [{ age: 'asc' }, { weight: 'asc' }],
    });
    const all = await prisma.fighter.findMany({ where: { eventId }, select: { gender: true, age: true, weight: true } });
    const settings = await getAiSettings();
    const maxSpan = Math.max(2, settings.weightBand) * 3;
    const tightBand = Math.max(2, settings.weightBand);
    return unassigned.map((f) => {
      const g = genderLabelOf(f.gender);
      const br = bracketOf(f.age);
      const sameDiv = all.filter((x) => (x.gender ?? null) === (f.gender ?? null) && bracketOf(x.age).name === br.name);
      const wide = sameDiv.filter((x) => Math.abs(x.weight - f.weight) <= maxSpan);
      const tight = sameDiv.filter((x) => Math.abs(x.weight - f.weight) <= tightBand);
      let reason: string;
      if (sameDiv.length < 3) reason = `Only ${sameDiv.length} ${g} in ${br.name} — no bracket of 3+`;
      else if (wide.length < 3) reason = `${f.weight}kg is isolated: <3 ${g} in ${br.name} within ${maxSpan}kg`;
      else if (tight.length < 3) reason = `Edge weight ${f.weight}kg — only ${tight.length} within ${tightBand}kg, groups filled without them`;
      else reason = `Remainder in ${g} ${br.name} — nearest group is full (max ${settings.maxGroupSize})`;
      return { ...f, reason };
    });
  });

  app.post('/', { preHandler: requireRole('admin') }, async (request, reply) => {
    const parsed = fighterSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const eventId = await getActiveEventId();
    const fighter = await prisma.fighter.create({ data: { eventId, ...parsed.data } });
    return fighter;
  });

  app.put('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const parsed = fighterSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    return prisma.fighter.update({ where: { id }, data: parsed.data });
  });

  app.delete('/:id', { preHandler: requireRole('admin') }, async (request) => {
    const id = Number((request.params as any).id);
    await prisma.fighter.delete({ where: { id } });
    return { ok: true };
  });
}
