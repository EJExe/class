import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CourseRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import { AccessService } from '../common/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
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
        ownerUserId: userId,
        inviteCode,
        members: {
          create: {
            userId,
            role: CourseRole.owner,
          },
        },
        videoRoom: {
          create: {
            title: 'Course Room',
            maxParticipants: 6,
          },
        },
      },
    });

    return course;
  }

  async getUserCourses(userId: string) {
    const memberships = await this.prisma.courseMember.findMany({
      where: { userId },
      include: { course: true },
      orderBy: { joinedAt: 'desc' },
    });

    return memberships.map((m) => ({
      id: m.course.id,
      title: m.course.title,
      description: m.course.description,
      inviteCode: m.course.inviteCode,
      role: m.role,
      joinedAt: m.joinedAt,
    }));
  }

  async getCourseById(userId: string, courseId: string) {
    await this.access.assertCourseMember(courseId, userId);

    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: { videoRoom: true },
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
          role: CourseRole.member,
        },
      });
    } catch {
      throw new ConflictException('Already joined');
    }

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
      orderBy: { joinedAt: 'asc' },
    });
  }
}

