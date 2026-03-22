import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CourseRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MANAGE_ROLES: CourseRole[] = [CourseRole.admin, CourseRole.teacher];
const REVIEW_ROLES: CourseRole[] = [CourseRole.admin, CourseRole.teacher, CourseRole.assistant];

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getCourseMembership(courseId: string, userId: string) {
    const member = await this.prisma.courseMember.findUnique({
      where: { courseId_userId: { courseId, userId } },
    });

    if (!member) {
      throw new ForbiddenException('Not a member of this course');
    }

    return member;
  }

  async assertCourseMember(courseId: string, userId: string) {
    return this.getCourseMembership(courseId, userId);
  }

  async assertCourseManager(courseId: string, userId: string) {
    const member = await this.getCourseMembership(courseId, userId);
    if (!MANAGE_ROLES.includes(member.role)) {
      throw new ForbiddenException('Teacher or admin role required');
    }
    return member;
  }

  async assertCourseReviewer(courseId: string, userId: string) {
    const member = await this.getCourseMembership(courseId, userId);
    if (!REVIEW_ROLES.includes(member.role)) {
      throw new ForbiddenException('Reviewer role required');
    }
    return member;
  }

  async getChannelWithCourse(channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: {
        course: true,
        groupAccess: true,
        assignment: true,
      },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    return channel;
  }

  async assertChannelAccess(channelId: string, userId: string) {
    const channel = await this.getChannelWithCourse(channelId);
    const membership = await this.getCourseMembership(channel.courseId, userId);

    if (REVIEW_ROLES.includes(membership.role)) {
      return channel;
    }

    if (channel.groupAccess.length === 0) {
      return channel;
    }

    const userGroups = await this.prisma.courseGroupMember.findMany({
      where: {
        userId,
        group: {
          courseId: channel.courseId,
        },
      },
      select: { groupId: true },
    });

    const allowed = new Set(channel.groupAccess.map((entry) => entry.groupId));
    const hasGroupAccess = userGroups.some((entry) => allowed.has(entry.groupId));

    if (!hasGroupAccess) {
      throw new ForbiddenException('Channel is not available for your group');
    }

    return channel;
  }

  async getAssignmentAccessible(assignmentId: string, userId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        channel: {
          include: {
            groupAccess: true,
            course: true,
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    await this.assertChannelAccess(assignment.channelId, userId);
    return assignment;
  }

  async assertSubmissionOwnerOrReviewer(submissionId: string, userId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        assignment: {
          include: {
            channel: true,
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    if (submission.studentUserId === userId) {
      return submission;
    }

    await this.assertCourseReviewer(submission.assignment.channel.courseId, userId);
    return submission;
  }

  async assertPrivateChatAccess(chatId: string, userId: string) {
    const chat = await this.prisma.privateAssignmentChat.findUnique({
      where: { id: chatId },
      include: {
        assignment: {
          include: {
            channel: true,
          },
        },
      },
    });

    if (!chat) {
      throw new NotFoundException('Private chat not found');
    }

    if (chat.studentUserId === userId) {
      return chat;
    }

    await this.assertCourseReviewer(chat.assignment.channel.courseId, userId);
    return chat;
  }
}
