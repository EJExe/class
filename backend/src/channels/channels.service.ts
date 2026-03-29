import { Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, ChannelType, CourseRole, SubmissionStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AccessService } from '../common/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async createChannel(userId: string, courseId: string, dto: CreateChannelDto) {
    await this.access.assertCourseManager(courseId, userId);

    const channel = await this.prisma.channel.create({
      data: {
        courseId,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        createdByUserId: userId,
        groupAccess: dto.groupIds?.length
          ? {
              create: dto.groupIds.map((groupId) => ({ groupId })),
            }
          : undefined,
        assignment:
          dto.type === ChannelType.assignment
            ? {
                create: {
                  title: dto.assignmentTitle ?? dto.name,
                  description: dto.assignmentDescription,
                  status: AssignmentStatus.draft,
                  deadlineAt: dto.assignmentDeadlineAt ? new Date(dto.assignmentDeadlineAt) : null,
                  createdByUserId: userId,
                },
              }
            : undefined,
      },
      include: {
        groupAccess: true,
        assignment: true,
      },
    });

    await this.audit.log({
      actorUserId: userId,
      actionType: 'channel.created',
      entityType: 'channel',
      entityId: channel.id,
      metadata: { type: channel.type, groupIds: dto.groupIds ?? [] },
    });

    if (channel.assignment) {
      await this.audit.log({
        actorUserId: userId,
        actionType: 'assignment.created',
        entityType: 'assignment',
        entityId: channel.assignment.id,
        metadata: { channelId: channel.id },
      });
    }

    return channel;
  }

  async listChannels(userId: string, courseId: string) {
    const membership = await this.access.assertCourseMember(courseId, userId);

    const groupIds = (
      await this.prisma.courseGroupMember.findMany({
        where: {
          userId,
          group: {
            courseId,
          },
        },
        select: { groupId: true },
      })
    ).map((entry) => entry.groupId);

    const isPrivileged = ['admin', 'teacher', 'assistant'].includes(membership.role);

    const where = isPrivileged
      ? {
          courseId,
          OR: [{ type: ChannelType.text }, { assignment: { is: { deletedAt: null } } }],
        }
      : {
          courseId,
          AND: [
            {
              OR: [
                { groupAccess: { none: {} } },
                { groupAccess: { some: { groupId: { in: groupIds } } } },
              ],
            },
            {
              OR: [
                { type: ChannelType.text },
                { assignment: { is: { status: { not: AssignmentStatus.draft }, deletedAt: null } } },
              ],
            },
          ],
        };

    const channels = await this.prisma.channel.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        groupAccess: true,
        assignment: {
          include: {
            readStates: {
              where: { userId },
              take: 1,
            },
            submissions:
              membership.role === CourseRole.student
                ? {
                    where: { studentUserId: userId },
                    orderBy: { updatedAt: 'desc' },
                    take: 1,
                  }
                : {
                    where: {
                      status: {
                        in: [
                          SubmissionStatus.submitted,
                          SubmissionStatus.submitted_late,
                          SubmissionStatus.under_review,
                        ],
                      },
                    },
                    orderBy: [{ submittedAt: 'desc' }, { updatedAt: 'desc' }],
                    take: 1,
                  },
          },
        },
        readStates: {
          where: { userId },
          take: 1,
        },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    return channels.map((channel) => {
      const channelReadAt = channel.readStates[0]?.lastReadAt?.getTime() ?? 0;
      const latestMessageAt = channel.messages[0]?.createdAt?.getTime() ?? 0;

      const assignmentReadAt = channel.assignment?.readStates?.[0]?.lastReadAt?.getTime() ?? 0;
      const latestAssignmentAt = channel.assignment?.updatedAt?.getTime?.() ?? 0;
      const latestSubmissionAt = channel.assignment?.submissions?.[0]
        ? ((channel.assignment.submissions[0].submittedAt ?? channel.assignment.submissions[0].updatedAt)?.getTime?.() ??
          0)
        : 0;

      return {
        ...channel,
        hasUnreadMessages: latestMessageAt > channelReadAt,
        assignment: channel.assignment
          ? {
              ...channel.assignment,
              hasUnread: Math.max(latestAssignmentAt, latestSubmissionAt) > assignmentReadAt,
            }
          : null,
      };
    });
  }

  async getChannel(userId: string, channelId: string) {
    await this.access.assertChannelAccess(channelId, userId);

    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        groupAccess: true,
        assignment: true,
      },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    return channel;
  }

  async updateChannel(userId: string, channelId: string, dto: UpdateChannelDto) {
    const existing = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!existing) {
      throw new NotFoundException('Channel not found');
    }

    await this.access.assertCourseManager(existing.courseId, userId);

    const channel = await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.groupIds
          ? {
              groupAccess: {
                deleteMany: {},
                create: dto.groupIds.map((groupId) => ({ groupId })),
              },
            }
          : {}),
      },
      include: {
        groupAccess: true,
        assignment: true,
      },
    });

    await this.audit.log({
      actorUserId: userId,
      actionType: 'channel.updated',
      entityType: 'channel',
      entityId: channelId,
      metadata: { ...dto },
    });

    return channel;
  }
}
