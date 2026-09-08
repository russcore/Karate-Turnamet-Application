import { PrismaClient } from '@prisma/client';

// Single shared Prisma client. SQLite is single-writer, so we keep one instance.
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
});

// Ensure foreign keys are enforced (SQLite has them off by default per-connection).
export async function initDb(): Promise<void> {
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
}
