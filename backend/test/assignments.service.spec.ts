import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CourseRole, NotificationType, SubmissionStatus } from '@prisma/client';
import { AssignmentsService } from '../src/assignments/assignments.service';
import {
  createAccessMock,
  createAuditMock,
  createNotificationsMock,
  createPrismaMock,
  createStorageMock,
} from './test-helpers';

describe('AssignmentsService', () => {
  let service: AssignmentsService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let access: ReturnType<typeof createAccessMock>;
  let storage: ReturnType<typeof createStorageMock>;
  let notifications: ReturnType<typeof createNotificationsMock>;
  let audit: ReturnType<typeof createAuditMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    access = createAccessMock();
    storage = createStorageMock();
    notifications = createNotificationsMock();
    audit = createAuditMock();
    service = new AssignmentsService(
      prisma as any,
      access as any,
      storage as any,
      notifications as any,
      audit as any,
    );
  });

  it('marks an assignment as read via upsert', async () => {
    access.getAssignmentAccessible.mockResolvedValue({ id: 'assignment-1' });
    prisma.assignmentReadState.upsert.mockResolvedValue({ id: 'read-state-1' });

    await service.markAssignmentRead('user-1', 'assignment-1');

    expect(prisma.assignmentReadState.upsert).toHaveBeenCalledWith({
      where: {
        assignmentId_userId: {
          assignmentId: 'assignment-1',
          userId: 'user-1',
        },
      },
      update: { lastReadAt: expect.any(Date) },
      create: {
        assignmentId: 'assignment-1',
        userId: 'user-1',
      },
    });
  });

  it('filters assignment students by course reviewers and decorates avatar links', async () => {
    prisma.assignment.findUnique.mockResolvedValue({
      id: 'assignment-1',
      channel: { courseId: 'course-1' },
    });
    access.assertCourseReviewer.mockResolvedValue({ role: CourseRole.teacher });
    prisma.courseMember.findMany.mockResolvedValue([
      {
        user: {
          id: 'student-1',
          nickname: 'student',
          fullName: 'Student One',
          avatarPath: '/avatars/s1.png',
        },
      },
    ]);

    const result = await service.searchAssignmentStudents('teacher-1', 'assignment-1', 'stud');

    expect(result[0].avatarUrl).toBe('/api/users/student-1/avatar');
    expect(prisma.courseMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          courseId: 'course-1',
          role: CourseRole.student,
        }),
      }),
    );
  });

  it('forbids non-students from uploading submissions', async () => {
    access.getAssignmentAccessible.mockResolvedValue({
      id: 'assignment-1',
      title: 'Essay',
      channel: { courseId: 'course-1' },
    });
    access.assertCourseMember.mockResolvedValue({ role: CourseRole.teacher });

    await expect(service.uploadSubmission('teacher-1', 'assignment-1', { originalname: 'essay.docx' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('creates a draft submission and stores the uploaded file for a student', async () => {
    access.getAssignmentAccessible.mockResolvedValue({
      id: 'assignment-1',
      title: 'Essay',
      channel: { courseId: 'course-1' },
    });
    access.assertCourseMember.mockResolvedValue({ role: CourseRole.student });
    storage.saveFile.mockResolvedValue({
      originalName: 'essay.docx',
      storedName: 'stored-essay.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: 123,
      path: '/uploads/essay.docx',
    });
    prisma.submission.findUnique.mockResolvedValue(null);
    prisma.submission.create.mockResolvedValue({
      id: 'submission-1',
      assignmentId: 'assignment-1',
      studentUserId: 'student-1',
      status: SubmissionStatus.draft,
    });
    prisma.submissionFile.create.mockResolvedValue({
      id: 'file-1',
      originalName: 'essay.docx',
    });
    prisma.submission.update.mockResolvedValue({
      id: 'submission-1',
      currentFileId: 'file-1',
      currentFile: { id: 'file-1' },
      status: SubmissionStatus.draft,
    });
    prisma.courseMember.findMany.mockResolvedValue([{ userId: 'teacher-1' }]);

    const result = await service.uploadSubmission('student-1', 'assignment-1', { originalname: 'essay.docx' });

    expect(prisma.submission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assignmentId: 'assignment-1',
          studentUserId: 'student-1',
          status: SubmissionStatus.draft,
        }),
      }),
    );
    expect(prisma.submissionFile.create).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'submission.uploaded',
      }),
    );
    expect(result.status).toBe(SubmissionStatus.draft);
  });

  it('rejects final submission when no file was uploaded', async () => {
    access.getAssignmentAccessible.mockResolvedValue({
      id: 'assignment-1',
      title: 'Essay',
      deadlineAt: new Date(Date.now() + 60_000),
      channel: { courseId: 'course-1' },
    });
    prisma.submission.findUnique.mockResolvedValue({
      id: 'submission-1',
      currentFileId: null,
    });

    await expect(service.submitSubmission('student-1', 'assignment-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks a final submission as submitted when deadline is not missed', async () => {
    access.getAssignmentAccessible.mockResolvedValue({
      id: 'assignment-1',
      title: 'Essay',
      deadlineAt: new Date(Date.now() + 60_000),
      channel: { courseId: 'course-1' },
    });
    prisma.submission.findUnique.mockResolvedValue({
      id: 'submission-1',
      currentFileId: 'file-1',
      currentFile: { id: 'file-1' },
      status: SubmissionStatus.draft,
    });
    prisma.submission.update.mockResolvedValue({
      id: 'submission-1',
      status: SubmissionStatus.submitted,
      isLate: false,
      currentFile: { id: 'file-1' },
    });
    prisma.courseMember.findMany.mockResolvedValue([{ userId: 'teacher-1' }]);

    const result = await service.submitSubmission('student-1', 'assignment-1');

    expect(prisma.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SubmissionStatus.submitted,
          isLate: false,
        }),
      }),
    );
    expect(result.status).toBe(SubmissionStatus.submitted);
  });

  it('marks a final submission as submitted_late when deadline is missed', async () => {
    access.getAssignmentAccessible.mockResolvedValue({
      id: 'assignment-1',
      title: 'Essay',
      deadlineAt: new Date(Date.now() - 60_000),
      channel: { courseId: 'course-1' },
    });
    prisma.submission.findUnique.mockResolvedValue({
      id: 'submission-1',
      currentFileId: 'file-1',
      currentFile: { id: 'file-1' },
      status: SubmissionStatus.draft,
    });
    prisma.submission.update.mockResolvedValue({
      id: 'submission-1',
      status: SubmissionStatus.submitted_late,
      isLate: true,
      currentFile: { id: 'file-1' },
    });
    prisma.courseMember.findMany.mockResolvedValue([{ userId: 'teacher-1' }]);

    const result = await service.submitSubmission('student-1', 'assignment-1');

    expect(prisma.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SubmissionStatus.submitted_late,
          isLate: true,
        }),
      }),
    );
    expect(result.status).toBe(SubmissionStatus.submitted_late);
  });

  it('rejects reviewer grading with a forbidden status', async () => {
    access.assertSubmissionOwnerOrReviewer.mockResolvedValue({
      id: 'submission-1',
      status: SubmissionStatus.submitted,
      assignment: {
        channel: { courseId: 'course-1' },
      },
    });
    access.assertCourseReviewer.mockResolvedValue({ role: CourseRole.teacher });

    await expect(
      service.gradeSubmission('teacher-1', 'submission-1', {
        grade: '5',
        status: SubmissionStatus.submitted,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('grades a submission, writes audit/activity and notifies the student', async () => {
    access.assertSubmissionOwnerOrReviewer.mockResolvedValue({
      id: 'submission-1',
      status: SubmissionStatus.submitted,
      assignment: {
        title: 'Essay',
        channel: { courseId: 'course-1' },
      },
    });
    access.assertCourseReviewer.mockResolvedValue({ role: CourseRole.teacher });
    prisma.submission.update.mockResolvedValue({
      id: 'submission-1',
      status: SubmissionStatus.reviewed,
      grade: '5',
      teacherComment: 'Отлично',
      student: { id: 'student-1', nickname: 'student' },
    });

    const result = await service.gradeSubmission('teacher-1', 'submission-1', {
      grade: '5',
      teacherComment: 'Отлично',
    });

    expect(prisma.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          grade: '5',
          teacherComment: 'Отлично',
          status: SubmissionStatus.reviewed,
        }),
      }),
    );
    expect(notifications.create).toHaveBeenCalledWith(
      'student-1',
      expect.objectContaining({
        type: NotificationType.submission_graded,
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'submission.graded',
      }),
    );
    expect(result.status).toBe(SubmissionStatus.reviewed);
  });

  it('allows only reviewers to add comments to a specific submission file version', async () => {
    prisma.submissionFile.findUnique.mockResolvedValue({
      id: 'file-1',
      submissionId: 'submission-1',
      submission: {
        assignment: {
          channel: {
            courseId: 'course-1',
          },
        },
      },
    });
    access.assertCourseReviewer.mockResolvedValue({ role: CourseRole.teacher });
    prisma.submissionFileComment.create.mockResolvedValue({
      id: 'comment-1',
      content: 'Исправить оформление',
      author: {
        id: 'teacher-1',
        nickname: 'teacher',
        fullName: 'Teacher',
        avatarPath: '/avatars/t1.png',
      },
    });

    const result = await service.addSubmissionFileComment('teacher-1', 'file-1', {
      content: 'Исправить оформление',
    });

    expect(prisma.submissionFileComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          fileId: 'file-1',
          authorUserId: 'teacher-1',
          content: 'Исправить оформление',
        },
      }),
    );
    expect(result.author.avatarUrl).toBe('/api/users/teacher-1/avatar');
  });

  it('requires studentUserId when a reviewer opens a private assignment chat', async () => {
    access.getAssignmentAccessible.mockResolvedValue({
      id: 'assignment-1',
      channel: { courseId: 'course-1' },
    });
    access.getCourseMembership.mockResolvedValue({ role: CourseRole.teacher });

    await expect(service.getPrivateChat('teacher-1', 'assignment-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects private chat creation for non-student targets', async () => {
    access.getAssignmentAccessible.mockResolvedValue({
      id: 'assignment-1',
      channel: { courseId: 'course-1' },
    });
    access.getCourseMembership.mockResolvedValue({ role: CourseRole.teacher });
    access.assertCourseMember.mockResolvedValue({ role: CourseRole.assistant });

    await expect(
      service.getPrivateChat('teacher-1', 'assignment-1', 'assistant-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('moves an assignment to trash and writes an audit entry', async () => {
    prisma.assignment.findUnique.mockResolvedValue({
      id: 'assignment-1',
      channel: { courseId: 'course-1' },
    });
    access.assertCourseManager.mockResolvedValue({ role: CourseRole.teacher });
    prisma.assignment.update.mockResolvedValue({ id: 'assignment-1', deletedAt: new Date() });

    await service.trashAssignment('teacher-1', 'assignment-1');

    expect(prisma.assignment.update).toHaveBeenCalledWith({
      where: { id: 'assignment-1' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'assignment.trashed',
      }),
    );
  });

  it('restores an assignment from trash and writes an audit entry', async () => {
    prisma.assignment.findUnique.mockResolvedValue({
      id: 'assignment-1',
      channel: { courseId: 'course-1' },
    });
    access.assertCourseManager.mockResolvedValue({ role: CourseRole.teacher });
    prisma.assignment.update.mockResolvedValue({ id: 'assignment-1', deletedAt: null });

    await service.restoreAssignment('teacher-1', 'assignment-1');

    expect(prisma.assignment.update).toHaveBeenCalledWith({
      where: { id: 'assignment-1' },
      data: { deletedAt: null },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'assignment.restored',
      }),
    );
  });

  it('rejects a missing trashed assignment', async () => {
    prisma.assignment.findUnique.mockResolvedValue(null);

    await expect(service.trashAssignment('teacher-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
