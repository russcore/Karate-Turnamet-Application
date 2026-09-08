import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db.js';
import type { AuthUser, Role } from '../types.js';
import { loadUser } from './session.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

/** Global onRequest hook: attach request.user (or null). */
export async function attachUser(request: FastifyRequest): Promise<void> {
  request.user = await loadUser(request);
}

export function requireAuth(request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void): void {
  if (!request.user) {
    reply.code(401).send({ error: 'Not authenticated' });
    return;
  }
  done();
}

export function requireRole(...roles: Role[]) {
  return (request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void): void => {
    if (!request.user) {
      reply.code(401).send({ error: 'Not authenticated' });
      return;
    }
    if (!roles.includes(request.user.role)) {
      reply.code(403).send({ error: 'Forbidden: requires role ' + roles.join('/') });
      return;
    }
    done();
  };
}

/** Admins pass; a tatami_editor must own the given tatami; otherwise 403. */
export function assertTatamiAccess(user: AuthUser | null, tatamiId: number | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'tatami_editor') return false;
  return tatamiId != null && user.tatamiIds.includes(tatamiId);
}

/** Resolve the tatami that owns a category and enforce access. Returns tatamiId or throws 403. */
export async function requireCategoryTatamiAccess(request: FastifyRequest, reply: FastifyReply, categoryId: number): Promise<boolean> {
  const cat = await prisma.category.findUnique({ where: { id: categoryId }, select: { tatamiId: true } });
  if (!cat) {
    reply.code(404).send({ error: 'Category not found' });
    return false;
  }
  if (!assertTatamiAccess(request.user, cat.tatamiId)) {
    reply.code(403).send({ error: 'Forbidden: this tatami is not assigned to you' });
    return false;
  }
  return true;
}

export async function requireMatchTatamiAccess(request: FastifyRequest, reply: FastifyReply, matchId: number): Promise<{ ok: boolean; categoryId?: number }> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { bracket: { select: { categoryId: true, category: { select: { tatamiId: true } } } } },
  });
  if (!match) {
    reply.code(404).send({ error: 'Match not found' });
    return { ok: false };
  }
  if (!assertTatamiAccess(request.user, match.bracket.category.tatamiId)) {
    reply.code(403).send({ error: 'Forbidden: this tatami is not assigned to you' });
    return { ok: false };
  }
  return { ok: true, categoryId: match.bracket.categoryId };
}
