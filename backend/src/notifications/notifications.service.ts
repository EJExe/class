import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationHubService } from './notification-hub.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: NotificationHubService,
  ) {}

  async create(userId: string, params: {
    type: NotificationType;
    title: string;
    body: string;
    entityType?: string;
    entityId?: string;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type: params.type,
        title: params.title,
        body: params.body,
        entityType: params.entityType,
        entityId: params.entityId,
      },
    });
    this.hub.emitToUser(userId, 'notification:new', notification);
    return notification;
  }

  list(userId: string, cursor?: string, limit = 30) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  async markRead(userId: string, id: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
    this.hub.emitToUser(userId, 'notification:read', { id });
    return result;
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    this.hub.emitToUser(userId, 'notification:read-all', { ok: true });
    return result;
  }
}
