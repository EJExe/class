import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CourseRole, NotificationType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AccessService } from '../common/access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const REVIEW_ROLES = [CourseRole.admin, CourseRole.teacher, CourseRole.assistant];

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  private getAdminNickname() {
    return (process.env.ADMIN_NICKNAME ?? 'admin').trim();
  }

  private getMessageInclude() {
    return {
      author: {
        select: { id: true, nickname: true, fullName: true, avatarPath: true },
      },
      attachments: {
        orderBy: { createdAt: 'asc' as const },
      },
      reactions: {
        orderBy: [{ emoji: 'asc' as const }, { createdAt: 'asc' as const }],
        include: {
          user: {
            select: { id: true, nickname: true, fullName: true, avatarPath: true },
          },
        },
      },
    };
  }

  private async getMessageById(messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: this.getMessageInclude(),
    });
    return message ? this.decorateMessage(message) : message;
  }

  private decorateUser<T extends { id: string; avatarPath?: string | null }>(user: T) {
    return {
      ...user,
      avatarUrl: user.avatarPath ? `/api/users/${user.id}/avatar` : null,
    };
  }

  private decorateMessage(message: any) {
    return {
      ...message,
      author: message.author ? this.decorateUser(message.author) : message.author,
      reactions: (message.reactions ?? []).map((reaction: any) => ({
        ...reaction,
        user: reaction.user ? this.decorateUser(reaction.user) : reaction.user,
      })),
    };
  }

  async getChannelMessages(userId: string, channelId: string, cursor?: string, limit = 30) {
    await this.access.assertChannelAccess(channelId, userId);

    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const messages = await this.prisma.message.findMany({
      where: {
        channelId,
        deletedAt: null,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      include: this.getMessageInclude(),
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
    });

    return {
      items: messages.reverse().map((message) => this.decorateMessage(message)),
      nextCursor: messages.length === safeLimit ? messages[messages.length - 1].createdAt.toISOString() : null,
    };
  }

  async searchChannelMessages(userId: string, channelId: string, query: string, limit = 30) {
    await this.access.assertChannelAccess(channelId, userId);

    const normalized = query.trim();
    if (!normalized) {
      return [];
    }

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const items = await this.prisma.message.findMany({
      where: {
        channelId,
        deletedAt: null,
        content: {
          contains: normalized,
          mode: 'insensitive',
        },
      },
      include: this.getMessageInclude(),
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
    });

    return items.map((message) => this.decorateMessage(message));
  }

  async markChannelRead(userId: string, channelId: string) {
    await this.access.assertChannelAccess(channelId, userId);
    return this.prisma.channelReadState.upsert({
      where: {
        channelId_userId: {
          channelId,
          userId,
        },
      },
      update: {
        lastReadAt: new Date(),
      },
      create: {
        channelId,
        userId,
      },
    });
  }

  async createMessage(userId: string, channelId: string, content?: string, files: any[] = []) {
    const channel = await this.access.assertChannelAccess(channelId, userId);
    const normalizedContent = content?.trim() ?? '';
    const uploadedFiles = files.filter(Boolean);

    if (!normalizedContent && uploadedFiles.length === 0) {
      throw new BadRequestException('Message must contain text or attachments');
    }

    const storedAttachments = await Promise.all(
      uploadedFiles.map((file) => this.storage.saveFile('message-files', file)),
    );

    const message = await this.prisma.message.create({
      data: {
        channelId,
        authorUserId: userId,
        content: normalizedContent,
        attachments: storedAttachments.length
          ? {
              create: storedAttachments.map((attachment) => ({
                originalName: attachment.originalName,
                storedName: attachment.storedName,
                mimeType: attachment.mimeType,
                sizeBytes: attachment.sizeBytes,
                path: attachment.path,
              })),
            }
          : undefined,
      },
      include: this.getMessageInclude(),
    });

    await this.audit.log({
      actorUserId: userId,
      actionType: 'message.created',
      entityType: 'message',
      entityId: message.id,
      metadata: {
        channelId,
        contentPreview: normalizedContent.slice(0, 120),
        attachmentsCount: message.attachments.length,
      },
    });

    await this.notifyChannelUsers(channel, message);

    return this.decorateMessage(message);
  }

  async softDeleteMessage(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        channel: true,
      },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const membership = await this.access.assertCourseMember(message.channel.courseId, userId);
    if (message.authorUserId !== userId && membership.role !== CourseRole.admin) {
      throw new ForbiddenException('Cannot delete others messages');
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        deletedAt: new Date(),
      },
    });

    await this.audit.log({
      actorUserId: userId,
      actionType: 'message.deleted',
      entityType: 'message',
      entityId: updated.id,
      metadata: {
        channelId: message.channelId,
        authorUserId: message.authorUserId,
        deletedOwnMessage: message.authorUserId === userId,
        deletedByRole: membership.role,
      },
    });

    return {
      id: updated.id,
      deletedAt: updated.deletedAt,
    };
  }

  async updateMessage(userId: string, messageId: string, content: string) {
    const normalizedContent = content.trim();
    if (!normalizedContent) {
      throw new BadRequestException('Message content is required');
    }

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        channel: true,
      },
    });
    if (!message || message.deletedAt) {
      throw new NotFoundException('Message not found');
    }

    await this.access.assertCourseMember(message.channel.courseId, userId);
    if (message.authorUserId !== userId) {
      throw new ForbiddenException('Cannot edit others messages');
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: normalizedContent,
        editedAt: new Date(),
      },
      include: this.getMessageInclude(),
    });

    await this.audit.log({
      actorUserId: userId,
      actionType: 'message.updated',
      entityType: 'message',
      entityId: messageId,
      metadata: {
        channelId: message.channelId,
        contentPreview: normalizedContent.slice(0, 120),
      },
    });

    return this.decorateMessage(updated);
  }

  async getMessageFile(userId: string, fileId: string) {
    const file = await this.prisma.messageAttachment.findUnique({
      where: { id: fileId },
      include: {
        message: {
          include: {
            channel: true,
          },
        },
      },
    });

    if (!file) {
      throw new NotFoundException('Message attachment not found');
    }

    await this.access.assertChannelAccess(file.message.channelId, userId);
    return file;
  }

  async addReaction(userId: string, messageId: string, emoji: string) {
    const normalizedEmoji = emoji.trim();
    if (!normalizedEmoji) {
      throw new BadRequestException('Emoji is required');
    }

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        channel: true,
      },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    await this.access.assertChannelAccess(message.channelId, userId);
    await this.prisma.messageReaction.upsert({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId,
          emoji: normalizedEmoji,
        },
      },
      update: {},
      create: {
        messageId,
        userId,
        emoji: normalizedEmoji,
      },
    });

    await this.audit.log({
      actorUserId: userId,
      actionType: 'message.reaction_added',
      entityType: 'message',
      entityId: messageId,
      metadata: {
        channelId: message.channelId,
        emoji: normalizedEmoji,
      },
    });

    return this.getMessageById(messageId);
  }

  async removeReaction(userId: string, messageId: string, emoji: string) {
    const normalizedEmoji = emoji.trim();
    if (!normalizedEmoji) {
      throw new BadRequestException('Emoji is required');
    }

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        channel: true,
      },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const membership = await this.access.assertCourseMember(message.channel.courseId, userId);
    await this.access.assertChannelAccess(message.channelId, userId);

    const deleteResult = await this.prisma.messageReaction.deleteMany({
      where:
        membership.role === CourseRole.admin
          ? {
              messageId,
              emoji: normalizedEmoji,
            }
          : {
              messageId,
              userId,
              emoji: normalizedEmoji,
            },
    });

    if (deleteResult.count > 0) {
      await this.audit.log({
        actorUserId: userId,
        actionType: 'message.reaction_removed',
        entityType: 'message',
        entityId: messageId,
        metadata: {
          channelId: message.channelId,
          emoji: normalizedEmoji,
          removedAllForEmoji: membership.role === CourseRole.admin,
        },
      });
    }

    return this.getMessageById(messageId);
  }

  private extractMentionNicknames(content: string) {
    const matches = content.matchAll(/@([^\s@]+)/gu);
    return Array.from(new Set(Array.from(matches, (match) => match[1].trim()).filter(Boolean)));
  }

  private async getChannelRecipients(channelId: string, courseId: string, groupIds: string[], authorUserId: string) {
    if (groupIds.length === 0) {
      return this.prisma.courseMember.findMany({
        where: {
          courseId,
          userId: { not: authorUserId },
          user: {
            nickname: {
              not: this.getAdminNickname(),
            },
          },
        },
        include: {
          user: {
            select: { id: true, nickname: true },
          },
        },
      });
    }

    return this.prisma.courseMember.findMany({
      where: {
        courseId,
        userId: { not: authorUserId },
        user: {
          nickname: {
            not: this.getAdminNickname(),
          },
        },
        OR: [
          { role: { in: REVIEW_ROLES } },
          {
            user: {
              courseGroupMemberships: {
                some: {
                  groupId: { in: groupIds },
                },
              },
            },
          },
        ],
      },
      include: {
        user: {
          select: { id: true, nickname: true },
        },
      },
    });
  }

  private async notifyChannelUsers(channel: any, message: any) {
    const preview = message.content.trim().slice(0, 180);
    const fallbackPreview = message.attachments?.length ? `Вложений: ${message.attachments.length}` : '';
    if (!preview && !fallbackPreview) {
      return;
    }

    const groupIds = channel.groupAccess.map((entry: any) => entry.groupId);
    const recipients = await this.getChannelRecipients(channel.id, channel.courseId, groupIds, message.authorUserId);
    const mentionNicknames = this.extractMentionNicknames(message.content);
    const mentionSet = new Set(
      recipients
        .filter((recipient) => recipient.user.nickname !== this.getAdminNickname())
        .filter((recipient) => mentionNicknames.includes(recipient.user.nickname))
        .map((recipient) => recipient.user.id),
    );

    await Promise.all(
      recipients.map((recipient) =>
        this.notifications.create(recipient.user.id, {
          type: NotificationType.assignment_message,
          title: mentionSet.has(recipient.user.id)
            ? `Вас отметили в канале #${channel.name}`
            : `Новое сообщение в канале #${channel.name}`,
          body: `${message.author.nickname}: ${preview || fallbackPreview}`,
          entityType: 'channel',
          entityId: channel.id,
        }),
      ),
    );
  }
}
