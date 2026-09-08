import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { prisma } from '../db.js';
import type { AuthUser, Role } from '../types.js';

interface TokenPayload {
  uid: number;
}

export function issueSession(reply: FastifyReply, userId: number): void {
  const token = jwt.sign({ uid: userId } satisfies TokenPayload, config.jwtSecret, { expiresIn: '12h' });
  reply.setCookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: config.isProd,
    maxAge: 12 * 60 * 60,
  });
}

export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(config.cookieName, { path: '/' });
}

/** Resolve the authenticated user (with tatami ids) from the request cookie, or null. */
export async function loadUser(request: FastifyRequest): Promise<AuthUser | null> {
  const token = request.cookies?.[config.cookieName];
  if (!token) return null;
  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret) as TokenPayload;
  } catch {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.uid },
    include: { tatamis: { select: { tatamiId: true } } },
  });
  if (!user || !user.active) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role as Role,
    displayName: user.displayName,
    tatamiIds: user.tatamis.map((t) => t.tatamiId),
  };
}
