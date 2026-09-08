import type { FastifyInstance } from 'fastify';
import { hub } from '../ws/hub.js';

/** WebSocket endpoint. Clients connect to /ws?topics=all|projector|tatami:1|category:5 */
export default async function wsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ws', { websocket: true }, (socket, req) => {
    const raw = (req.query as any)?.topics as string | undefined;
    const topics = raw ? raw.split(',').map((t) => t.trim()).filter(Boolean) : ['all'];
    hub.add(socket, topics);
    try {
      socket.send(JSON.stringify({ type: 'hello', topics }));
    } catch {
      /* ignore */
    }
  });
}
