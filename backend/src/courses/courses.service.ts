import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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

  async createCourse(userId: string, dto: CreateCourseDto) {
    const inviteCode = this.createInviteCode();

    const course = await this.prisma.course.create({
      data: {
        title: dto.title,
        description: dto.description,
        createdById: userId,
        inviteCode,
        members: {
          create: {
            userId,
            role: CourseRole.teacher,
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

  async getUserCourses(userId: string) {
    const memberships = await this.prisma.courseMember.findMany({
      where: { userId },
      include: {
        course: {
          include: {
            channels: true,
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
    }));
  }

  async getCourseById(userId: string, courseId: string) {
    await this.access.assertCourseMember(courseId, userId);

    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        videoRoom: true,
        members: {
          include: {
            user: {
              select: { id: true, nickname: true },
            },
          },
        },
        groups: {
          include: {
            members: {
              include: {
                user: {
                  select: { id: true, nickname: true },
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

    return course;
  }

  async joinByInviteCode(userId: string, inviteCode: string) {
    const course = await this.prisma.course.findUnique({ where: { inviteCode } });
    if (!course) {
      throw new NotFoundException('Course with invite code not found');
    }

    try {
      await this.prisma.courseMember.create({
        data: {
          courseId: course.id,
          userId,
          role: CourseRole.student,
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
      where: { courseId },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            lastSeenAt: true,
          },
        },
      },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });
  }

  async updateMemberRole(actorUserId: string, courseId: string, targetUserId: string, role: CourseRole) {
    await this.access.assertCourseManager(courseId, actorUserId);

    const updated = await this.prisma.courseMember.update({
      where: { courseId_userId: { courseId, userId: targetUserId } },
      data: { role },
      include: {
        user: {
          select: { id: true, nickname: true },
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

    return updated;
  }

  getRoles() {
    return [
      { value: CourseRole.admin, label: 'Администратор' },
      { value: CourseRole.teacher, label: 'Преподаватель' },
      { value: CourseRole.assistant, label: 'Лаборант' },
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
              select: { id: true, nickname: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
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
