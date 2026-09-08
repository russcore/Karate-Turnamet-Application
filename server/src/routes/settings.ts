import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireRole } from '../auth/guards.js';
import { getAiSettings, setAiSettings } from '../services/grouping/index.js';
import { clearEventCache, fullReset, getActiveEventId, resetEventData } from '../services/eventService.js';
import { archiveJson } from '../services/export.js';
import { notifyConfig } from '../ws/hub.js';

export default async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireRole('admin'));

  // AI grouping settings. The API key is never echoed back — only whether one is set.
  app.get('/ai', async () => {
    const s = await getAiSettings();
    const { apiKey, ...rest } = s;
    return { ...rest, hasApiKey: !!apiKey };
  });

  app.put('/ai', async (request, reply) => {
    const schema = z.object({
      provider: z.enum(['local', 'claude', 'openai', 'gemini']).optional(),
      apiKey: z.string().optional(),
      model: z.string().optional(),
      ageBand: z.number().int().positive().optional(),
      weightBand: z.number().positive().optional(),
      rankBand: z.number().int().positive().optional(),
      avoidSameSchool: z.boolean().optional(),
      maxGroupSize: z.number().int().min(2).max(8).optional(),
      minGroupSize: z.number().int().min(2).max(8).optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const next = await setAiSettings(parsed.data);
    const { apiKey, ...rest } = next;
    return { ...rest, hasApiKey: !!apiKey };
  });

  // Reset. Requires typing the exact event title to confirm; offers archive first (separate call).
  app.get('/archive', async () => {
    const eventId = await getActiveEventId();
    return archiveJson(eventId);
  });

  app.post('/reset/data', async (request, reply) => {
    const schema = z.object({ confirm: z.string() });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const eventId = await getActiveEventId();
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (parsed.data.confirm !== event?.title) return reply.code(400).send({ error: 'Confirmation text does not match the event title' });
    await resetEventData(eventId, request.user?.id);
    notifyConfig();
    return { ok: true };
  });

  app.post('/reset/full', async (request, reply) => {
    const schema = z.object({ confirm: z.string() });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const eventId = await getActiveEventId();
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (parsed.data.confirm !== event?.title) return reply.code(400).send({ error: 'Confirmation text does not match the event title' });
    await fullReset(eventId, request.user?.id);
    clearEventCache();
    notifyConfig();
    return { ok: true };
  });
}
