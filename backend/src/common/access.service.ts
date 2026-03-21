import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CourseRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCourseMember(courseId: string, userId: string) {
    const member = await this.prisma.courseMember.findUnique({
      where: { courseId_userId: { courseId, userId } },
    });

    if (!member) {
      throw new ForbiddenException('Not a member of this course');
    }

    return member;
  }

  async assertCourseOwner(courseId: string, userId: string) {
    const member = await this.assertCourseMember(courseId, userId);
    if (member.role !== CourseRole.owner) {
      throw new ForbiddenException('Owner role required');
    }
    return member;
  }

  async getChannelWithCourse(channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      include: { course: true },
    });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    return channel;
  }
}

