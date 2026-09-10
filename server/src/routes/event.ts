import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireRole } from '../auth/guards.js';
import { getActiveEventId } from '../services/eventService.js';
import { saveUpload } from '../services/uploads.js';
import { notifyConfig } from '../ws/hub.js';

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  subtitle: z.string().nullable().optional(),
  accentColor: z.string().optional(),
  topBarColor: z.string().optional(),
  arenaTerm: z.string().max(40).nullable().optional(),
  bronzeMode: z.enum(['single', 'double']).optional(),
  cornerAName: z.string().min(1).max(12).optional(),
  cornerAColor: z.string().optional(),
  cornerBName: z.string().min(1).max(12).optional(),
  cornerBColor: z.string().optional(),
});

export default async function eventRoutes(app: FastifyInstance): Promise<void> {
  // Public: branding for header / projector (no auth).
  app.get('/', async () => {
    const id = await getActiveEventId();
    return prisma.event.findUnique({ where: { id } });
  });

  app.put('/', { preHandler: requireRole('admin') }, async (request, reply) => {
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const id = await getActiveEventId();
    const event = await prisma.event.update({ where: { id }, data: parsed.data });
    notifyConfig();
    return event;
  });

  app.post('/logo', { preHandler: requireRole('admin') }, async (request, reply) => {
    const file = await (request as any).file();
    if (!file) return reply.code(400).send({ error: 'No file uploaded' });
    const buf = await file.toBuffer();
    const path = await saveUpload(buf, file.filename);
    const id = await getActiveEventId();
    const event = await prisma.event.update({ where: { id }, data: { logoPath: path } });
    notifyConfig();
    return event;
  });

  app.post('/tatami-default-image', { preHandler: requireRole('admin') }, async (request, reply) => {
    const file = await (request as any).file();
    if (!file) return reply.code(400).send({ error: 'No file uploaded' });
    const buf = await file.toBuffer();
    const path = await saveUpload(buf, file.filename);
    const id = await getActiveEventId();
    const event = await prisma.event.update({ where: { id }, data: { defaultTatamiImage: path } });
    notifyConfig();
    return event;
  });
}
