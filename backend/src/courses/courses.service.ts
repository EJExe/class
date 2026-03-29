import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CourseRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AccessService } from '../common/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupDto } from '../groups/dto/create-group.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  private createInviteCode() {
    return randomBytes(4).toString('hex');
  }

  private getAdminNickname() {
    return (process.env.ADMIN_NICKNAME ?? 'admin').trim();
  }

  private readonly userSelect = {
    id: true,
    nickname: true,
    fullName: true,
    avatarPath: true,
  } as const;

  private decorateUser<T extends { id: string; avatarPath?: string | null }>(user: T) {
    return {
      ...user,
      avatarUrl: user.avatarPath ? `/api/users/${user.id}/avatar` : null,
    };
  }

  private async isAdminAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { nickname: true },
    });
    return user?.nickname === this.getAdminNickname();
  }

  private async isAdminTarget(userId: string) {
    return this.isAdminAccount(userId);
  }

  private computeCourseHasUnread(membership: any) {
    return membership.course.channels.some((channel: any) => {
      const channelReadAt = channel.readStates?.[0]?.lastReadAt?.getTime?.() ?? 0;
      const latestMessageAt = channel.messages?.[0]?.createdAt?.getTime?.() ?? 0;
      const hasUnreadMessages = latestMessageAt > channelReadAt;

      if (!channel.assignment) {
        return hasUnreadMessages;
      }

      const assignmentReadAt = channel.assignment.readStates?.[0]?.lastReadAt?.getTime?.() ?? 0;
      const latestAssignmentAt = channel.assignment.updatedAt?.getTime?.() ?? 0;
      const relevantSubmissions =
        membership.role === CourseRole.student
          ? (channel.assignment.submissions ?? []).filter((submission: any) => submission.studentUserId === membership.userId)
          : channel.assignment.submissions ?? [];
      const latestSubmissionAt = relevantSubmissions.reduce((max: number, submission: any) => {
        const candidate =
          membership.role === CourseRole.student
            ? submission.updatedAt?.getTime?.() ?? 0
            : ((submission.submittedAt ?? submission.updatedAt)?.getTime?.() ?? 0);
        return Math.max(max, candidate);
      }, 0);

      return hasUnreadMessages || Math.max(latestAssignmentAt, latestSubmissionAt) > assignmentReadAt;
    });
  }

  async createCourse(userId: string, dto: CreateCourseDto) {
    const inviteCode = this.createInviteCode();
    const ownerRole = (await this.isAdminAccount(userId)) ? CourseRole.admin : CourseRole.teacher;

    const course = await this.prisma.course.create({
      data: {
        title: dto.title,
        description: dto.description,
        createdById: userId,
        inviteCode,
        members: {
          create: {
            userId,
            role: ownerRole,
          },
        },
        videoRoom: {
          create: {
            title: `${dto.title} Video Room`,
            maxParticipants: 6,
          },
        },
      },
    });

    await this.audit.log({
      actorUserId: userId,
      actionType: 'course.created',
      entityType: 'course',
      entityId: course.id,
      metadata: { title: course.title },
    });

    return course;
  }

  async updateCourse(userId: string, courseId: string, dto: UpdateCourseDto) {
    await this.access.assertCourseManager(courseId, userId);

    const course = await this.prisma.course.update({
      where: { id: courseId },
      data: {
        ...(dto.title ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
    });

    await this.audit.log({
      actorUserId: userId,
      actionType: 'course.updated',
      entityType: 'course',
      entityId: course.id,
      metadata: { ...dto },
    });

    return course;
  }

  async getUserCourses(userId: string, query?: string) {
    const memberships = await this.prisma.courseMember.findMany({
      where: {
        userId,
        ...(query
          ? {
              course: {
                OR: [
                  { title: { contains: query, mode: 'insensitive' } },
                  { description: { contains: query, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      include: {
        course: {
          include: {
            channels: {
              include: {
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
                assignment: {
                  include: {
                    readStates: {
                      where: { userId },
                      take: 1,
                    },
                    submissions: {
                      select: {
                        studentUserId: true,
                        updatedAt: true,
                        submittedAt: true,
                      },
                      orderBy: [{ submittedAt: 'desc' }, { updatedAt: 'desc' }],
                      take: 20,
                    },
                  },
                },
              },
            },
            groups: true,
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    return memberships.map((membership) => ({
      id: membership.course.id,
      title: membership.course.title,
      description: membership.course.description,
      inviteCode: membership.course.inviteCode,
      role: membership.role,
      channelsCount: membership.course.channels.length,
      groupsCount: membership.course.groups.length,
      joinedAt: membership.joinedAt,
      hasUnread: this.computeCourseHasUnread(membership),
    }));
  }

  async exportCourseCsv(userId: string, courseId: string) {
    const membership = await this.access.assertCourseMember(courseId, userId);
    if (membership.role !== CourseRole.admin) {
      throw new ForbiddenException('Only admins can export course data');
    }

    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        members: {
          include: {
            user: {
              select: {
                nickname: true,
                fullName: true,
                email: true,
              },
            },
          },
        },
        channels: {
          include: {
            assignment: true,
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const esc = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows: string[] = [];
    rows.push(['Курс', 'Описание'].map(esc).join(','));
    rows.push([course.title, course.description ?? ''].map(esc).join(','));
    rows.push('');
    rows.push(['Участник', 'ФИО', 'Email', 'Роль'].map(esc).join(','));
    for (const member of course.members) {
      rows.push(
        [member.user.nickname, member.user.fullName ?? '', member.user.email ?? '', member.role].map(esc).join(','),
      );
    }
    rows.push('');
    rows.push(['Канал', 'Тип', 'Связанное задание', 'Дедлайн'].map(esc).join(','));
    for (const channel of course.channels) {
      rows.push(
        [
          channel.name,
          channel.type,
          channel.assignment?.title ?? '',
          channel.assignment?.deadlineAt?.toISOString() ?? '',
        ]
          .map(esc)
          .join(','),
      );
    }

    return rows.join('\n');
  }

  async getCourseById(userId: string, courseId: string) {
    const currentMembership = await this.access.assertCourseMember(courseId, userId);

    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        videoRoom: true,
        members: {
          include: {
            user: {
              select: this.userSelect,
            },
          },
        },
        groups: {
          include: {
            members: {
              include: {
                user: {
                  select: this.userSelect,
                },
              },
            },
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const adminNickname = this.getAdminNickname();

    return {
      ...course,
      currentUserRole: currentMembership.role,
      members: course.members
        .filter((member) => member.user.nickname !== adminNickname)
        .map((member) => ({
          ...member,
          user: this.decorateUser(member.user),
        })),
      groups: course.groups.map((group) => ({
        ...group,
        members: group.members
          .filter((member) => member.user.nickname !== adminNickname)
          .map((member) => ({
            ...member,
            user: this.decorateUser(member.user),
          })),
      })),
    };
  }

  async joinByInviteCode(userId: string, inviteCode: string) {
    const course = await this.prisma.course.findUnique({ where: { inviteCode } });
    if (!course) {
      throw new NotFoundException('Course with invite code not found');
    }

    const memberRole = (await this.isAdminAccount(userId)) ? CourseRole.admin : CourseRole.student;

    try {
      await this.prisma.courseMember.create({
        data: {
          courseId: course.id,
          userId,
          role: memberRole,
        },
      });
    } catch {
      throw new ConflictException('Already joined');
    }

    await this.audit.log({
      actorUserId: userId,
      actionType: 'course.joined',
      entityType: 'course',
      entityId: course.id,
      metadata: { inviteCode },
    });

    return this.getCourseById(userId, course.id);
  }

  async getMembers(userId: string, courseId: string) {
    await this.access.assertCourseMember(courseId, userId);

    return this.prisma.courseMember.findMany({
      where: {
        courseId,
        user: {
          nickname: {
            not: this.getAdminNickname(),
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            fullName: true,
            avatarPath: true,
            lastSeenAt: true,
          },
        },
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    }).then((members) =>
      members.map((member) => ({
        ...member,
        user: this.decorateUser(member.user),
      })),
    );
  }

  async updateMemberRole(actorUserId: string, courseId: string, targetUserId: string, role: CourseRole) {
    await this.access.assertCourseManager(courseId, actorUserId);
    const actorIsAdmin = await this.isAdminAccount(actorUserId);
    const targetIsAdmin = await this.isAdminTarget(targetUserId);

    if (role === CourseRole.admin && !actorIsAdmin) {
      throw new ConflictException('Only admin can assign admin role');
    }

    if (targetIsAdmin && actorUserId !== targetUserId) {
      throw new ConflictException('Only admin can change own course role');
    }

    const updated = await this.prisma.courseMember.update({
      where: { courseId_userId: { courseId, userId: targetUserId } },
      data: { role },
      include: {
        user: {
          select: this.userSelect,
        },
      },
    });

    await this.audit.log({
      actorUserId,
      actionType: 'course.role_updated',
      entityType: 'course-member',
      entityId: `${courseId}:${targetUserId}`,
      metadata: { role },
    });

    return {
      ...updated,
      user: this.decorateUser(updated.user),
    };
  }

  async getRoles(userId: string, courseId: string) {
    const isAdmin = await this.isAdminAccount(userId);
    await this.access.assertCourseMember(courseId, userId);

    return [
      ...(isAdmin ? [{ value: CourseRole.admin, label: 'Администратор' }] : []),
      { value: CourseRole.teacher, label: 'Преподаватель' },
      { value: CourseRole.assistant, label: 'Ассистент' },
      { value: CourseRole.student, label: 'Студент' },
    ];
  }

  async createGroup(userId: string, courseId: string, dto: CreateGroupDto) {
    await this.access.assertCourseManager(courseId, userId);

    const group = await this.prisma.courseGroup.create({
      data: {
        courseId,
        name: dto.name,
      },
    });

    await this.audit.log({
      actorUserId: userId,
      actionType: 'group.created',
      entityType: 'group',
      entityId: group.id,
      metadata: { courseId, name: dto.name },
    });

    return group;
  }

  async listGroups(userId: string, courseId: string) {
    await this.access.assertCourseMember(courseId, userId);

    return this.prisma.courseGroup.findMany({
      where: { courseId },
      include: {
        members: {
          include: {
            user: {
              select: this.userSelect,
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }).then((groups) =>
      groups.map((group) => ({
        ...group,
        members: group.members
          .filter((member) => member.user.nickname !== this.getAdminNickname())
          .map((member) => ({
            ...member,
            user: this.decorateUser(member.user),
          })),
      })),
    );
  }

  async addGroupMember(actorUserId: string, groupId: string, userId: string) {
    const group = await this.prisma.courseGroup.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    await this.access.assertCourseManager(group.courseId, actorUserId);
    await this.access.assertCourseMember(group.courseId, userId);

    await this.prisma.courseGroupMember.upsert({
      where: { groupId_userId: { groupId, userId } },
      update: {},
      create: { groupId, userId },
    });

    await this.audit.log({
      actorUserId,
      actionType: 'group.member_added',
      entityType: 'group',
      entityId: groupId,
      metadata: { userId },
    });

    return this.listGroups(actorUserId, group.courseId);
  }

  async removeGroupMember(actorUserId: string, groupId: string, userId: string) {
    const group = await this.prisma.courseGroup.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new NotFoundException('Group not found');
    }

    await this.access.assertCourseManager(group.courseId, actorUserId);

    await this.prisma.courseGroupMember.deleteMany({
      where: { groupId, userId },
    });

    await this.audit.log({
      actorUserId,
      actionType: 'group.member_removed',
      entityType: 'group',
      entityId: groupId,
      metadata: { userId },
    });

    return { ok: true };
  }
}


