import { prisma } from '../db.js';

export interface AuditInput {
  userId?: number;
  entity: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Append an audit record (who / what / old / new / when). Pass a transaction client
 * as the second arg to keep the audit atomic with the change it describes.
 */
export async function writeAudit(input: AuditInput, tx?: { auditLog: typeof prisma.auditLog }): Promise<void> {
  const client = tx ?? prisma;
  await client.auditLog.create({
    data: {
      userId: input.userId ?? null,
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      before: input.before === undefined ? null : JSON.stringify(input.before),
      after: input.after === undefined ? null : JSON.stringify(input.after),
    },
  });
}
