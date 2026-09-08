import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../auth/guards.js';
import { getActiveEventId } from '../services/eventService.js';
import { notifyConfig } from '../ws/hub.js';
import {
  buildRankIndex,
  buildTemplate,
  commitImport,
  parseUpload,
  suggestMapping,
  validateRows,
  type NormalizedRow,
} from '../services/import.js';

export default async function importRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireRole('admin'));

  // Download template (.xlsx or .csv) with headers + example + configured ranks.
  app.get('/template', async (request, reply) => {
    const format = ((request.query as any)?.format ?? 'xlsx') === 'csv' ? 'csv' : 'xlsx';
    const eventId = await getActiveEventId();
    const out = await buildTemplate(eventId, format);
    if (format === 'csv') {
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', 'attachment; filename="roster-template.csv"');
      return out;
    }
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename="roster-template.xlsx"');
    return reply.send(out);
  });

  // Upload a file -> parsed columns + rows + suggested mapping.
  app.post('/parse', async (request, reply) => {
    const file = await (request as any).file();
    if (!file) return reply.code(400).send({ error: 'No file uploaded' });
    const buf = await file.toBuffer();
    const { columns, rows } = parseUpload(buf, file.filename);
    return { filename: file.filename, columns, rows, suggestedMapping: suggestMapping(columns) };
  });

  // Validate rows against a chosen mapping (+ optional manual rank mappings).
  app.post('/preview', async (request, reply) => {
    const schema = z.object({
      rows: z.array(z.record(z.string())),
      mapping: z.record(z.string()),
      rankMappings: z.record(z.number().int()).optional(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const eventId = await getActiveEventId();
    const rankIndex = await buildRankIndex(eventId);
    return validateRows(parsed.data.rows, parsed.data.mapping as any, rankIndex, parsed.data.rankMappings ?? {});
  });

  // Commit already-normalized rows in a single transaction.
  app.post('/commit', async (request, reply) => {
    const schema = z.object({
      filename: z.string().default('import'),
      rows: z.array(z.any()),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const eventId = await getActiveEventId();
    const result = await commitImport(eventId, parsed.data.rows as NormalizedRow[], parsed.data.filename, request.user?.id);
    notifyConfig();
    return result;
  });
}
