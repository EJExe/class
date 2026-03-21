import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessService } from '../common/access.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async getChannelMessages(userId: string, channelId: string, cursor?: string, limit = 30) {
    const channel = await this.access.getChannelWithCourse(channelId);
    await this.access.assertCourseMember(channel.courseId, userId);

    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const messages = await this.prisma.message.findMany({
      where: {
        channelId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      include: {
        author: {
          select: { id: true, nickname: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
    });

    return {
      items: messages.reverse(),
      nextCursor: messages.length === safeLimit ? messages[messages.length - 1].createdAt.toISOString() : null,
    };
  }

  async createMessage(userId: string, channelId: string, content: string) {
    const channel = await this.access.getChannelWithCourse(channelId);
    await this.access.assertCourseMember(channel.courseId, userId);

    return this.prisma.message.create({
      data: {
        channelId,
        authorUserId: userId,
        content,
      },
      include: {
        author: {
          select: { id: true, nickname: true },
        },
      },
    });
  }

  async softDeleteMessage(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    if (message.authorUserId !== userId) {
      throw new ForbiddenException('Cannot delete others messages');
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
      },
    });

    return {
      id: updated.id,
      deletedAt: updated.deletedAt,
    };
  }
}

