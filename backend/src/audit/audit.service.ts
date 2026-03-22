import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    actorUserId?: string | null;
    actionType: string;
    entityType: string;
    entityId: string;
    metadata?: any;
  }) {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: params.actorUserId ?? null,
        actionType: params.actionType,
        entityType: params.entityType,
        entityId: params.entityId,
        metadataJson: params.metadata as any,
      },
    });
  }

  listAll(limit = 100) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      include: {
        actor: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
    });
  }

  listForEntity(entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
    });
  }
}
