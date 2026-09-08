import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { initDb } from './db.js';
import { attachUser } from './auth/guards.js';
import { ensureUploadDir } from './services/uploads.js';
import { getActiveEventId } from './services/eventService.js';

import authRoutes from './routes/auth.js';
import eventRoutes from './routes/event.js';
import tatamiRoutes from './routes/tatami.js';
import rankRoutes from './routes/ranks.js';
import userRoutes from './routes/users.js';
import fighterRoutes from './routes/fighters.js';
import importRoutes from './routes/importRoutes.js';
import categoryRoutes from './routes/categories.js';
import matchRoutes from './routes/matches.js';
import settingsRoutes from './routes/settings.js';
import exportRoutes from './routes/exportRoutes.js';
import wsRoutes from './routes/wsRoute.js';

export async function buildServer() {
  const app = Fastify({ logger: config.isProd ? true : { transport: undefined } });

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024 } });
  await app.register(websocket);

  // Attach the authenticated user to every request.
  app.addHook('onRequest', attachUser);

  // Serve uploaded logos / tatami images.
  await ensureUploadDir();
  await app.register(fastifyStatic, { root: config.uploadDir, prefix: '/uploads/', decorateReply: false });

  app.get('/api/health', async () => ({ ok: true, ws: true }));

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(eventRoutes, { prefix: '/api/event' });
  await app.register(tatamiRoutes, { prefix: '/api/tatami' });
  await app.register(rankRoutes, { prefix: '/api/ranks' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(fighterRoutes, { prefix: '/api/fighters' });
  await app.register(importRoutes, { prefix: '/api/import' });
  await app.register(categoryRoutes, { prefix: '/api/categories' });
  await app.register(matchRoutes, { prefix: '/api/matches' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  await app.register(exportRoutes, { prefix: '/api/export' });
  await app.register(wsRoutes);

  // Serve the built client (and SPA fallback) whenever a build exists — so `npm run serve`
  // hosts the whole app on one port even without NODE_ENV=production.
  if (fs.existsSync(config.clientDist)) {
    await app.register(fastifyStatic, { root: config.clientDist, prefix: '/', decorateReply: true });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api') || request.url.startsWith('/ws') || request.url.startsWith('/uploads')) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}

async function main(): Promise<void> {
  await initDb();
  await getActiveEventId(); // ensure an event row exists
  const app = await buildServer();
  await app.listen({ port: config.port, host: '0.0.0.0' });
  // Print every LAN address so tatami tablets can connect by address (port omitted when 80).
  const { networkInterfaces } = await import('node:os');
  const suffix = config.port === 80 ? '' : `:${config.port}`;
  const addrs = ['localhost', ...Object.values(networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n!.address)];
  // eslint-disable-next-line no-console
  console.log('Karate server ready — open on any device on this network:');
  for (const a of addrs) console.log(`  http://${a}${suffix}`);
}

// Only auto-start when run directly (not when imported by tests).
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]).includes('index');
if (invokedDirectly) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
