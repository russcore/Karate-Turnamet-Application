import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Server package root (…/server). In dev this is src/.. , in prod dist/..
const serverRoot = path.resolve(__dirname, '..');

// Port priority: CLI arg (e.g. `node dist/index.js 80`) > PORT env > 4000.
const argPort = Number(process.argv[2]);
export const config = {
  port: Number.isInteger(argPort) && argPort > 0 ? argPort : Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'insecure-dev-secret-change-me-please-000',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: (process.env.NODE_ENV ?? 'development') === 'production',
  // Absolute path to the uploads directory (created on boot if missing).
  uploadDir: path.resolve(serverRoot, process.env.UPLOAD_DIR ?? '../uploads'),
  // Absolute path to the built client (served in production).
  clientDist: path.resolve(serverRoot, '../client/dist'),
  cookieName: 'karate_session',
};

export type AppConfig = typeof config;
