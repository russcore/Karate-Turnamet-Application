import type { FastifyInstance } from 'fastify';
import { requireAuth, requireRole } from '../auth/guards.js';
import { getActiveEventId } from '../services/eventService.js';
import { archiveJson, medalTableWorkbook, resultsWorkbook, rosterWorkbook, startListsWorkbook } from '../services/export.js';

function xlsxHeaders(reply: any, filename: string): void {
  reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  reply.header('Content-Disposition', `attachment; filename="${filename}"`);
}

export default async function exportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/roster.xlsx', async (_request, reply) => {
    xlsxHeaders(reply, 'roster.xlsx');
    return reply.send(await rosterWorkbook(await getActiveEventId()));
  });

  app.get('/start-lists.xlsx', async (_request, reply) => {
    xlsxHeaders(reply, 'start-lists.xlsx');
    return reply.send(await startListsWorkbook(await getActiveEventId()));
  });

  app.get('/results.xlsx', async (_request, reply) => {
    xlsxHeaders(reply, 'results.xlsx');
    return reply.send(await resultsWorkbook(await getActiveEventId()));
  });

  app.get('/medals.xlsx', async (_request, reply) => {
    xlsxHeaders(reply, 'medals.xlsx');
    return reply.send(await medalTableWorkbook(await getActiveEventId()));
  });

  app.get('/archive.json', { preHandler: requireRole('admin') }, async (_request, reply) => {
    reply.header('Content-Disposition', 'attachment; filename="event-archive.json"');
    return archiveJson(await getActiveEventId());
  });
}
