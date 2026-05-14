import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CourseRole } from '@prisma/client';
import { MessagesService } from '../src/messages/messages.service';
import {
  createAccessMock,
  createAuditMock,
  createNotificationsMock,
  createPrismaMock,
  createStorageMock,
} from './test-helpers';

describe('MessagesService', () => {
  let service: MessagesService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let access: ReturnType<typeof createAccessMock>;
  let notifications: ReturnType<typeof createNotificationsMock>;
  let storage: ReturnType<typeof createStorageMock>;
  let audit: ReturnType<typeof createAuditMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    access = createAccessMock();
    notifications = createNotificationsMock();
    storage = createStorageMock();
    audit = createAuditMock();
    service = new MessagesService(
      prisma as any,
      access as any,
      notifications as any,
      storage as any,
      audit as any,
    );
    process.env.ADMIN_NICKNAME = 'admin';
  });

  it('returns channel messages in ascending order with a next cursor', async () => {
    access.assertChannelAccess.mockResolvedValue({ id: 'channel-1' });
    prisma.message.findMany.mockResolvedValue([
      {
        id: 'message-2',
        content: 'second',
        createdAt: new Date('2026-01-02T00:00:00Z'),
        author: { id: 'user-1', nickname: 'alice', fullName: 'Alice', avatarPath: null },
        attachments: [],
        reactions: [],
      },
      {
        id: 'message-1',
        content: 'first',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        author: { id: 'user-2', nickname: 'bob', fullName: 'Bob', avatarPath: null },
        attachments: [],
        reactions: [],
      },
    ]);

    const result = await service.getChannelMessages('user-1', 'channel-1', undefined, 2);

    expect(result.items.map((item) => item.id)).toEqual(['message-1', 'message-2']);
    expect(result.nextCursor).toBe('2026-01-02T00:00:00.000Z');
  });

  it('returns an empty array for blank message search queries', async () => {
    access.assertChannelAccess.mockResolvedValue({ id: 'channel-1' });

    const result = await service.searchChannelMessages('user-1', 'channel-1', '   ');

    expect(result).toEqual([]);
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('marks a channel as read using upsert', async () => {
    access.assertChannelAccess.mockResolvedValue({ id: 'channel-1' });
    prisma.channelReadState.upsert.mockResolvedValue({ id: 'read-state-1' });

    await service.markChannelRead('user-1', 'channel-1');

    expect(prisma.channelReadState.upsert).toHaveBeenCalledWith({
      where: {
        channelId_userId: {
          channelId: 'channel-1',
          userId: 'user-1',
        },
      },
      update: { lastReadAt: expect.any(Date) },
      create: {
        channelId: 'channel-1',
        userId: 'user-1',
      },
    });
  });

  it('rejects creating an empty message without attachments', async () => {
    access.assertChannelAccess.mockResolvedValue({ id: 'channel-1', courseId: 'course-1', groupAccess: [] });

    await expect(service.createMessage('user-1', 'channel-1', '   ', [])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('creates a message with attachments and logs the action', async () => {
    const channel = { id: 'channel-1', courseId: 'course-1', name: 'general', groupAccess: [] };
    access.assertChannelAccess.mockResolvedValue(channel);
    storage.saveFile.mockResolvedValue({
      originalName: 'guide.pdf',
      storedName: 'stored-guide.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 321,
      path: '/uploads/guide.pdf',
    });
    prisma.message.create.mockResolvedValue({
      id: 'message-1',
      content: 'Материалы',
      authorUserId: 'user-1',
      author: { id: 'user-1', nickname: 'alice', fullName: 'Alice', avatarPath: null },
      attachments: [{ id: 'att-1', originalName: 'guide.pdf' }],
      reactions: [],
    });
    jest.spyOn(service as any, 'notifyChannelUsers').mockResolvedValue(undefined);

    const result = await service.createMessage('user-1', 'channel-1', 'Материалы', [{ originalname: 'guide.pdf' }]);

    expect(storage.saveFile).toHaveBeenCalledWith('message-files', expect.any(Object));
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channelId: 'channel-1',
          authorUserId: 'user-1',
          content: 'Материалы',
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'message.created',
        metadata: expect.objectContaining({ attachmentsCount: 1 }),
      }),
    );
    expect(result.attachments).toHaveLength(1);
  });

  it('prevents editing another user message', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'message-1',
      content: 'old',
      authorUserId: 'other-user',
      deletedAt: null,
      channel: { courseId: 'course-1' },
    });
    access.assertCourseMember.mockResolvedValue({ role: CourseRole.student });

    await expect(service.updateMessage('user-1', 'message-1', 'new')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('updates own message content and writes an audit entry', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'message-1',
      content: 'old',
      authorUserId: 'user-1',
      deletedAt: null,
      channel: { courseId: 'course-1', id: 'channel-1' },
    });
    access.assertCourseMember.mockResolvedValue({ role: CourseRole.student });
    prisma.message.update.mockResolvedValue({
      id: 'message-1',
      content: 'new',
      editedAt: new Date(),
      author: { id: 'user-1', nickname: 'alice', fullName: 'Alice', avatarPath: null },
      attachments: [],
      reactions: [],
    });

    const result = await service.updateMessage('user-1', 'message-1', 'new');

    expect(prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: 'new',
          editedAt: expect.any(Date),
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'message.updated',
      }),
    );
    expect(result.content).toBe('new');
  });

  it('prevents deleting another user message for non-admin members', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'message-1',
      channelId: 'channel-1',
      authorUserId: 'other-user',
      channel: { courseId: 'course-1' },
    });
    access.assertCourseMember.mockResolvedValue({ role: CourseRole.student });

    await expect(service.softDeleteMessage('user-1', 'message-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows admins to delete another user message', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'message-1',
      channelId: 'channel-1',
      authorUserId: 'other-user',
      channel: { courseId: 'course-1' },
    });
    access.assertCourseMember.mockResolvedValue({ role: CourseRole.admin });
    prisma.message.update.mockResolvedValue({
      id: 'message-1',
      deletedAt: new Date(),
    });

    const result = await service.softDeleteMessage('admin-user', 'message-1');

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'message-1' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(result.id).toBe('message-1');
  });

  it('adds a reaction and returns the refreshed message', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'message-1',
      channelId: 'channel-1',
      channel: { courseId: 'course-1' },
    });
    access.assertChannelAccess.mockResolvedValue({ id: 'channel-1' });
    prisma.messageReaction.upsert.mockResolvedValue({ id: 'reaction-1' });
    jest.spyOn(service as any, 'getMessageById').mockResolvedValue({ id: 'message-1', reactions: [{ emoji: '👍' }] });

    const result = await service.addReaction('user-1', 'message-1', '👍');

    expect(prisma.messageReaction.upsert).toHaveBeenCalledWith({
      where: {
        messageId_userId_emoji: {
          messageId: 'message-1',
          userId: 'user-1',
          emoji: '👍',
        },
      },
      update: {},
      create: {
        messageId: 'message-1',
        userId: 'user-1',
        emoji: '👍',
      },
    });
    expect(result.reactions).toHaveLength(1);
  });

  it('lets admins remove all reactions of the same emoji', async () => {
    prisma.message.findUnique.mockResolvedValue({
      id: 'message-1',
      channelId: 'channel-1',
      channel: { courseId: 'course-1' },
    });
    access.assertCourseMember.mockResolvedValue({ role: CourseRole.admin });
    access.assertChannelAccess.mockResolvedValue({ id: 'channel-1' });
    prisma.messageReaction.deleteMany.mockResolvedValue({ count: 3 });
    jest.spyOn(service as any, 'getMessageById').mockResolvedValue({ id: 'message-1', reactions: [] });

    await service.removeReaction('admin-user', 'message-1', '🔥');

    expect(prisma.messageReaction.deleteMany).toHaveBeenCalledWith({
      where: {
        messageId: 'message-1',
        emoji: '🔥',
      },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'message.reaction_removed',
        metadata: expect.objectContaining({ removedAllForEmoji: true }),
      }),
    );
  });
});
