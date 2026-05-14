import { ConflictException, ForbiddenException } from '@nestjs/common';
import { CourseRole } from '@prisma/client';
import { CoursesService } from '../src/courses/courses.service';
import { createAccessMock, createAuditMock, createPrismaMock } from './test-helpers';

describe('CoursesService', () => {
  let service: CoursesService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let access: ReturnType<typeof createAccessMock>;
  let audit: ReturnType<typeof createAuditMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    access = createAccessMock();
    audit = createAuditMock();
    service = new CoursesService(prisma as any, access as any, audit as any);
    process.env.ADMIN_NICKNAME = 'admin';
  });

  it('creates a course with teacher role for a regular creator', async () => {
    prisma.user.findUnique.mockResolvedValue({ nickname: 'teacher-user' });
    prisma.course.create.mockResolvedValue({ id: 'course-1', title: 'Math' });

    await service.createCourse('user-1', { title: 'Math', description: 'Algebra course' });

    expect(prisma.course.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdById: 'user-1',
          members: {
            create: expect.objectContaining({
              userId: 'user-1',
              role: CourseRole.teacher,
            }),
          },
          videoRoom: {
            create: expect.objectContaining({
              maxParticipants: 6,
            }),
          },
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user-1',
        actionType: 'course.created',
      }),
    );
  });

  it('creates a course with admin role for the global admin account', async () => {
    prisma.user.findUnique.mockResolvedValue({ nickname: 'admin' });
    prisma.course.create.mockResolvedValue({ id: 'course-1', title: 'Math' });

    await service.createCourse('admin-user', { title: 'Math', description: 'Algebra course' });

    expect(prisma.course.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          members: {
            create: expect.objectContaining({
              role: CourseRole.admin,
            }),
          },
        }),
      }),
    );
  });

  it('joins a course by invite code as a student for a regular user', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'course-1', inviteCode: 'invite-1' });
    prisma.user.findUnique.mockResolvedValue({ nickname: 'student-user' });
    prisma.courseMember.create.mockResolvedValue({ id: 'member-1' });
    jest.spyOn(service, 'getCourseById').mockResolvedValue({ id: 'course-1' } as any);

    await service.joinByInviteCode('user-1', 'invite-1');

    expect(prisma.courseMember.create).toHaveBeenCalledWith({
      data: {
        courseId: 'course-1',
        userId: 'user-1',
        role: CourseRole.student,
      },
    });
  });

  it('throws conflict on duplicate join by invite code', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'course-1', inviteCode: 'invite-1' });
    prisma.user.findUnique.mockResolvedValue({ nickname: 'student-user' });
    prisma.courseMember.create.mockRejectedValue(new Error('duplicate'));

    await expect(service.joinByInviteCode('user-1', 'invite-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('prevents a non-admin from assigning the admin course role', async () => {
    access.assertCourseManager.mockResolvedValue({ role: CourseRole.teacher });
    prisma.user.findUnique
      .mockResolvedValueOnce({ nickname: 'teacher-user' })
      .mockResolvedValueOnce({ nickname: 'student-user' });

    await expect(
      service.updateMemberRole('teacher-id', 'course-1', 'student-id', CourseRole.admin),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('prevents changing the admin account role by another user', async () => {
    access.assertCourseManager.mockResolvedValue({ role: CourseRole.teacher });
    prisma.user.findUnique
      .mockResolvedValueOnce({ nickname: 'teacher-user' })
      .mockResolvedValueOnce({ nickname: 'admin' });

    await expect(
      service.updateMemberRole('teacher-id', 'course-1', 'admin-id', CourseRole.student),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('filters out the global admin from the members list and decorates avatars', async () => {
    access.assertCourseMember.mockResolvedValue({ role: CourseRole.teacher });
    prisma.courseMember.findMany.mockResolvedValue([
      {
        courseId: 'course-1',
        userId: 'user-1',
        role: CourseRole.student,
        user: {
          id: 'user-1',
          nickname: 'student',
          fullName: 'Student One',
          avatarPath: '/avatars/u1.png',
          lastSeenAt: new Date(),
        },
      },
    ]);

    const result = await service.getMembers('teacher-id', 'course-1');

    expect(prisma.courseMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          courseId: 'course-1',
          user: { nickname: { not: 'admin' } },
        }),
      }),
    );
    expect(result[0].user.avatarUrl).toBe('/api/users/user-1/avatar');
  });

  it('returns the admin role option for the global admin account', async () => {
    prisma.user.findUnique.mockResolvedValue({ nickname: 'admin' });
    access.assertCourseMember.mockResolvedValue({ role: CourseRole.admin });

    const roles = await service.getRoles('admin-id', 'course-1');

    expect(roles[0].value).toBe(CourseRole.admin);
    expect(typeof roles[0].label).toBe('string');
    expect(roles[0].label.length).toBeGreaterThan(0);
  });

  it('computes unread state for courses when newer channel activity exists', async () => {
    prisma.courseMember.findMany.mockResolvedValue([
      {
        userId: 'user-1',
        role: CourseRole.student,
        joinedAt: new Date('2026-01-01'),
        course: {
          id: 'course-1',
          title: 'Math',
          description: 'Course',
          inviteCode: 'invite-1',
          groups: [],
          channels: [
            {
              readStates: [{ lastReadAt: new Date('2026-01-01T00:00:00Z') }],
              messages: [{ createdAt: new Date('2026-01-02T00:00:00Z') }],
              assignment: null,
            },
          ],
        },
      },
    ]);

    const result = await service.getUserCourses('user-1');

    expect(result[0].hasUnread).toBe(true);
  });

  it('allows only admins to export course CSV', async () => {
    access.assertCourseMember.mockResolvedValue({ role: CourseRole.teacher });

    await expect(service.exportCourseCsv('teacher-id', 'course-1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
