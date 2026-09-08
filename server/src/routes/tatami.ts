import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireRole } from '../auth/guards.js';
import { getActiveEventId } from '../services/eventService.js';
import { saveUpload } from '../services/uploads.js';
import { notifyConfig } from '../ws/hub.js';

const createSchema = z.object({ name: z.string().min(1), order: z.number().int().optional() });
const updateSchema = z.object({
  name: z.string().min(1).optional(),
  order: z.number().int().optional(),
  enabled: z.boolean().optional(),
});

export default async function tatamiRoutes(app: FastifyInstance): Promise<void> {
  // Public list (projector needs it).
  app.get('/', async () => {
    const eventId = await getActiveEventId();
    return prisma.tatami.findMany({ where: { eventId }, orderBy: { order: 'asc' } });
  });

  app.post('/', { preHandler: requireRole('admin') }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const eventId = await getActiveEventId();
    const count = await prisma.tatami.count({ where: { eventId } });
    const t = await prisma.tatami.create({
      data: { eventId, name: parsed.data.name, order: parsed.data.order ?? count },
    });
    notifyConfig();
    return t;
  });

  app.put('/:id', { preHandler: requireRole('admin') }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const t = await prisma.tatami.update({ where: { id }, data: parsed.data });
    notifyConfig();
    return t;
  });

  app.delete('/:id', { preHandler: requireRole('admin') }, async (request) => {
    const id = Number((request.params as any).id);
    await prisma.tatami.delete({ where: { id } });
    notifyConfig();
    return { ok: true };
  });

  app.post('/:id/image', { preHandler: requireRole('admin') }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const file = await (request as any).file();
    if (!file) return reply.code(400).send({ error: 'No file uploaded' });
    const buf = await file.toBuffer();
    const path = await saveUpload(buf, file.filename);
    const t = await prisma.tatami.update({ where: { id }, data: { imagePath: path } });
    notifyConfig();
    return t;
  });
}
