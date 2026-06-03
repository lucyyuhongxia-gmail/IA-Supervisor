import type { Prisma, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type AuditLogClient = typeof prisma | Prisma.TransactionClient;

type AuditLogInput = {
  actorId: string;
  actorRole: UserRole;
  entityType: string;
  entityId: string;
  action: string;
  fromState?: string | null;
  toState?: string | null;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export async function createAuditLog(
  input: AuditLogInput,
  client: AuditLogClient = prisma,
) {
  await client.auditLog.create({
    data: {
      actorId: input.actorId,
      actorRole: input.actorRole,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      fromState: input.fromState ?? null,
      toState: input.toState ?? null,
      reason: input.reason ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
}
