import { Injectable, NotFoundException } from '@nestjs/common';
import { AccessService } from '../common/access.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VideoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async getCourseVideoRoom(userId: string, courseId: string) {
    await this.access.assertCourseMember(courseId, userId);

    const room = await this.prisma.videoRoom.findUnique({ where: { courseId } });
    if (!room) {
      throw new NotFoundException('Video room not found');
    }
    return room;
  }

  async getRoomParticipants(userId: string, roomId: string) {
    const room = await this.prisma.videoRoom.findUnique({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    await this.access.assertCourseMember(room.courseId, userId);

    return this.prisma.videoRoomParticipant.findMany({
      where: {
        roomId,
        leftAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }
}

