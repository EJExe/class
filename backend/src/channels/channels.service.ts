import { Injectable } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { AccessService } from '../common/access.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async createChannel(userId: string, courseId: string, name: string) {
    await this.access.assertCourseOwner(courseId, userId);

    return this.prisma.channel.create({
      data: {
        courseId,
        name,
        type: ChannelType.text,
        createdByUserId: userId,
      },
    });
  }

  async listChannels(userId: string, courseId: string) {
    await this.access.assertCourseMember(courseId, userId);

    return this.prisma.channel.findMany({
      where: { courseId },
      orderBy: { createdAt: 'asc' },
    });
  }
}

