import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AssignmentStatus,
  ChannelType,
  CourseRole,
  NotificationType,
  SubmissionStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AccessService } from '../common/access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { CreatePrivateMessageDto } from './dto/create-private-message.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { UpdateSubmissionStatusDto } from './dto/update-submission-status.dto';

@Injectable()
export class AssignmentsService {
  private readonly reviewerStatuses = new Set<SubmissionStatus>([
    SubmissionStatus.returned_for_revision,
    SubmissionStatus.reviewed,
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private ensureAssignmentChannel(type: ChannelType) {
    if (type !== ChannelType.assignment) {
      throw new BadRequestException('Assignments are allowed only in assignment channels');
    }
  }

  private isLate(deadlineAt?: Date | null, submittedAt?: Date) {
    if (!deadlineAt || !submittedAt) {
      return false;
    }
    return submittedAt.getTime() > deadlineAt.getTime();
  }

  private lateSeconds(deadlineAt?: Date | null, submittedAt?: Date) {
    if (!deadlineAt || !submittedAt) {
      return 0;
    }
    return Math.max(0, Math.floor((submittedAt.getTime() - deadlineAt.getTime()) / 1000));
  }

  private assertReviewerSubmissionStatus(status: SubmissionStatus) {
    if (!this.reviewerStatuses.has(status)) {
      throw new BadRequestException('Only reviewed or returned_for_revision statuses are allowed');
    }
  }

  private async createReviewerNotifications(courseId: string, excludeUserId: string, params: {
    type: NotificationType;
    title: string;
    body: string;
    entityType: string;
    entityId: string;
  }) {
    const reviewers = await this.prisma.courseMember.findMany({
      where: {
        courseId,
        role: {
          in: [CourseRole.admin, CourseRole.teacher, CourseRole.assistant],
        },
        NOT: { userId: excludeUserId },
      },
      select: { userId: true },
    });

    await Promise.all(
      reviewers.map((reviewer) =>
        this.notifications.create(reviewer.userId, {
          ...params,
        }),
      ),
    );
  }

  async createAssignment(userId: string, channelId: string, dto: CreateAssignmentDto) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    await this.access.assertCourseManager(channel.courseId, userId);
    this.ensureAssignmentChannel(channel.type);

    const existing = await this.prisma.assignment.findUnique({ where: { channelId } });
    if (existing) {
      throw new BadRequestException('Assignment already exists for this channel');
    }

    const assignment = await this.prisma.assignment.create({
      data: {
        channelId,
        title: dto.title,
        description: dto.description,
        deadlineAt: dto.deadlineAt ? new Date(dto.deadlineAt) : null,
        createdByUserId: userId,
      },
      include: {
        channel: true,
      },
    });

    await this.audit.log({
      actorUserId: userId,
      actionType: 'assignment.created',
      entityType: 'assignment',
      entityId: assignment.id,
      metadata: { channelId },
    });

    await this.createReviewerNotifications(channel.courseId, userId, {
      type: NotificationType.assignment_created,
      title: 'Новое задание',
      body: `Создано задание "${assignment.title}"`,
      entityType: 'assignment',
      entityId: assignment.id,
    });

    return assignment;
  }

  async listByChannel(userId: string, channelId: string) {
    await this.access.assertChannelAccess(channelId, userId);

    return this.prisma.assignment.findMany({
      where: { channelId },
      include: {
        files: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAssignment(userId: string, assignmentId: string) {
    const assignment = await this.access.getAssignmentAccessible(assignmentId, userId);

    const [files, mySubmission, submissionsCount] = await Promise.all([
      this.prisma.assignmentFile.findMany({
        where: { assignmentId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.submission.findUnique({
        where: {
          assignmentId_studentUserId: {
            assignmentId,
            studentUserId: userId,
          },
        },
        include: {
          currentFile: true,
        },
      }),
      this.prisma.submission.count({ where: { assignmentId } }),
    ]);

    return {
      ...assignment,
      files,
      mySubmission,
      submissionsCount,
    };
  }

  async updateAssignment(userId: string, assignmentId: string, dto: UpdateAssignmentDto) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { channel: true },
    });
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    await this.access.assertCourseManager(assignment.channel.courseId, userId);

    const updated = await this.prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        ...(dto.title ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.deadlineAt !== undefined ? { deadlineAt: dto.deadlineAt ? new Date(dto.deadlineAt) : null } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
    });

    await this.audit.log({
      actorUserId: userId,
      actionType: 'assignment.updated',
      entityType: 'assignment',
      entityId: assignmentId,
      metadata: { ...dto },
    });

    return updated;
  }

  async addAssignmentFile(userId: string, assignmentId: string, file: any) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        channel: true,
      },
    });
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    await this.access.assertCourseManager(assignment.channel.courseId, userId);
    const stored = await this.storage.saveFile('assignment-files', file);

    const saved = await this.prisma.assignmentFile.create({
      data: {
        assignmentId,
        ...stored,
      },
    });

    await this.audit.log({
      actorUserId: userId,
      actionType: 'assignment.file_uploaded',
      entityType: 'assignment-file',
      entityId: saved.id,
      metadata: { assignmentId, originalName: saved.originalName },
    });

    return saved;
  }

  async listAssignmentFiles(userId: string, assignmentId: string) {
    await this.access.getAssignmentAccessible(assignmentId, userId);
    return this.prisma.assignmentFile.findMany({
      where: { assignmentId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getAssignmentFile(userId: string, fileId: string) {
    const file = await this.prisma.assignmentFile.findUnique({
      where: { id: fileId },
      include: {
        assignment: true,
      },
    });
    if (!file) {
      throw new NotFoundException('Assignment file not found');
    }
    await this.access.getAssignmentAccessible(file.assignmentId, userId);
    return file;
  }

  async deleteAssignmentFile(userId: string, fileId: string) {
    const file = await this.prisma.assignmentFile.findUnique({
      where: { id: fileId },
      include: {
        assignment: {
          include: {
            channel: true,
          },
        },
      },
    });
    if (!file) {
      throw new NotFoundException('Assignment file not found');
    }

    await this.access.assertCourseManager(file.assignment.channel.courseId, userId);
    await this.prisma.assignmentFile.delete({ where: { id: fileId } });
    await this.storage.remove(file.path);

    await this.audit.log({
      actorUserId: userId,
      actionType: 'assignment.file_deleted',
      entityType: 'assignment-file',
      entityId: fileId,
      metadata: { assignmentId: file.assignmentId },
    });

    return { ok: true };
  }

  async uploadSubmission(userId: string, assignmentId: string, file: any) {
    const assignment = await this.access.getAssignmentAccessible(assignmentId, userId);
    const membership = await this.access.assertCourseMember(assignment.channel.courseId, userId);
    if (membership.role !== CourseRole.student) {
      throw new ForbiddenException('Only students can upload submissions');
    }

    const stored = await this.storage.saveFile('submission-files', file);
    const now = new Date();

    let submission = await this.prisma.submission.findUnique({
      where: {
        assignmentId_studentUserId: {
          assignmentId,
          studentUserId: userId,
        },
      },
    });

    if (!submission) {
      submission = await this.prisma.submission.create({
        data: {
          assignmentId,
          studentUserId: userId,
          status: SubmissionStatus.draft,
          lastUploadedAt: now,
        },
      });
    }

    const submissionFile = await this.prisma.submissionFile.create({
      data: {
        submissionId: submission.id,
        ...stored,
      },
    });

    const updated = await this.prisma.submission.update({
      where: { id: submission.id },
      data: {
        currentFileId: submissionFile.id,
        lastUploadedAt: now,
        status: submission.status === SubmissionStatus.not_submitted ? SubmissionStatus.draft : submission.status,
      },
      include: {
        currentFile: true,
      },
    });

    await this.prisma.submissionActivityLog.create({
      data: {
        submissionId: submission.id,
        actorUserId: userId,
        actionType: 'file_uploaded',
        metadataJson: {
          originalName: submissionFile.originalName,
          uploadedAt: now.toISOString(),
        },
      },
    });

    await this.audit.log({
      actorUserId: userId,
      actionType: 'submission.uploaded',
      entityType: 'submission',
      entityId: submission.id,
      metadata: { assignmentId },
    });

    await this.createReviewerNotifications(assignment.channel.courseId, userId, {
      type: NotificationType.submission_uploaded,
      title: 'Загружена работа',
      body: `Студент загрузил файл по заданию "${assignment.title}"`,
      entityType: 'submission',
      entityId: submission.id,
    });

    return updated;
  }

  async submitSubmission(userId: string, assignmentId: string) {
    const assignment = await this.access.getAssignmentAccessible(assignmentId, userId);
    const submission = await this.prisma.submission.findUnique({
      where: {
        assignmentId_studentUserId: {
          assignmentId,
          studentUserId: userId,
        },
      },
      include: {
        currentFile: true,
      },
    });

    if (!submission || !submission.currentFileId) {
      throw new BadRequestException('Upload a file before submitting');
    }

    const submittedAt = new Date();
    const late = this.isLate(assignment.deadlineAt, submittedAt);
    const previousStatus = submission.status;
    const status = late ? SubmissionStatus.submitted_late : SubmissionStatus.submitted;

    const updated = await this.prisma.submission.update({
      where: { id: submission.id },
      data: {
        status,
        submittedAt,
        isLate: late,
      },
      include: {
        currentFile: true,
      },
    });

    await this.prisma.submissionActivityLog.create({
      data: {
        submissionId: submission.id,
        actorUserId: userId,
        actionType: 'submitted',
        metadataJson: {
          previousStatus,
          nextStatus: status,
          submittedAt: submittedAt.toISOString(),
          isLate: late,
          lateBySeconds: this.lateSeconds(assignment.deadlineAt, submittedAt),
        },
      },
    });

    await this.audit.log({
      actorUserId: userId,
      actionType: 'submission.submitted',
      entityType: 'submission',
      entityId: submission.id,
      metadata: {
        assignmentId,
        isLate: late,
        previousStatus,
        nextStatus: status,
      },
    });

    await this.createReviewerNotifications(assignment.channel.courseId, userId, {
      type: NotificationType.submission_submitted,
      title: late ? 'Работа сдана с опозданием' : 'Работа сдана',
      body: `По заданию "${assignment.title}" пришла новая сдача`,
      entityType: 'submission',
      entityId: submission.id,
    });

    return updated;
  }

  async listSubmissions(
    userId: string,
    assignmentId: string,
    page = 1,
    limit = 20,
    status?: SubmissionStatus,
  ) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        channel: true,
      },
    });
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    await this.access.assertCourseReviewer(assignment.channel.courseId, userId);

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const skip = Math.max(page - 1, 0) * safeLimit;

    const [items, total] = await Promise.all([
      this.prisma.submission.findMany({
        where: {
          assignmentId,
          ...(status ? { status } : {}),
        },
        include: {
          student: {
            select: { id: true, nickname: true },
          },
          currentFile: true,
        },
        orderBy: [{ submittedAt: 'desc' }, { updatedAt: 'desc' }],
        skip,
        take: safeLimit,
      }),
      this.prisma.submission.count({
        where: {
          assignmentId,
          ...(status ? { status } : {}),
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      pageSize: safeLimit,
    };
  }

  async getMySubmission(userId: string, assignmentId: string) {
    await this.access.getAssignmentAccessible(assignmentId, userId);

    return this.prisma.submission.findUnique({
      where: {
        assignmentId_studentUserId: {
          assignmentId,
          studentUserId: userId,
        },
      },
      include: {
        currentFile: true,
      },
    });
  }

  async getSubmission(userId: string, submissionId: string) {
    await this.access.assertSubmissionOwnerOrReviewer(submissionId, userId);

    return this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        currentFile: true,
        files: true,
        student: {
          select: { id: true, nickname: true },
        },
      },
    });
  }

  async getSubmissionFile(userId: string, fileId: string) {
    const file = await this.prisma.submissionFile.findUnique({
      where: { id: fileId },
      include: {
        submission: {
          include: {
            assignment: {
              include: {
                channel: true,
              },
            },
          },
        },
      },
    });

    if (!file) {
      throw new NotFoundException('Submission file not found');
    }

    await this.access.assertSubmissionOwnerOrReviewer(file.submissionId, userId);
    return file;
  }

  async updateSubmissionStatus(userId: string, submissionId: string, dto: UpdateSubmissionStatusDto) {
    const submission = await this.access.assertSubmissionOwnerOrReviewer(submissionId, userId);
    await this.access.assertCourseReviewer(submission.assignment.channel.courseId, userId);
    this.assertReviewerSubmissionStatus(dto.status);
    const previousStatus = submission.status;

    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: { status: dto.status },
    });

    await this.prisma.submissionActivityLog.create({
      data: {
        submissionId,
        actorUserId: userId,
        actionType: 'status_changed',
        metadataJson: {
          previousStatus,
          nextStatus: dto.status,
        } as any,
      },
    });

    await this.audit.log({
      actorUserId: userId,
      actionType: 'submission.status_changed',
      entityType: 'submission',
      entityId: submissionId,
      metadata: {
        previousStatus,
        nextStatus: dto.status,
      },
    });

    return updated;
  }

  async gradeSubmission(userId: string, submissionId: string, dto: GradeSubmissionDto) {
    const submission = await this.access.assertSubmissionOwnerOrReviewer(submissionId, userId);
    await this.access.assertCourseReviewer(submission.assignment.channel.courseId, userId);
    const previousStatus = submission.status;
    const nextStatus = dto.status ?? SubmissionStatus.reviewed;
    this.assertReviewerSubmissionStatus(nextStatus);

    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        grade: dto.grade,
        teacherComment: dto.teacherComment,
        status: nextStatus,
      },
      include: {
        student: {
          select: { id: true, nickname: true },
        },
      },
    });

    await this.prisma.submissionActivityLog.create({
      data: {
        submissionId,
        actorUserId: userId,
        actionType: 'graded',
        metadataJson: {
          grade: dto.grade,
          teacherComment: dto.teacherComment ?? null,
          previousStatus,
          nextStatus,
        } as any,
      },
    });

    await this.audit.log({
      actorUserId: userId,
      actionType: 'submission.graded',
      entityType: 'submission',
      entityId: submissionId,
      metadata: {
        grade: dto.grade,
        teacherComment: dto.teacherComment ?? null,
        previousStatus,
        nextStatus,
      },
    });

    await this.notifications.create(updated.student.id, {
      type: NotificationType.submission_graded,
      title: 'Работа проверена',
      body: `По заданию выставлена оценка: ${dto.grade ?? 'без оценки'}`,
      entityType: 'submission',
      entityId: submissionId,
    });

    return updated;
  }

  async getPrivateChat(userId: string, assignmentId: string, studentUserId?: string) {
    const assignment = await this.access.getAssignmentAccessible(assignmentId, userId);
    const membership = await this.access.getCourseMembership(assignment.channel.courseId, userId);
    const targetStudentId = membership.role === CourseRole.student ? userId : studentUserId ?? userId;

    if (membership.role !== CourseRole.student && !studentUserId) {
      throw new BadRequestException('studentUserId is required for reviewers');
    }

    const chat = await this.prisma.privateAssignmentChat.upsert({
      where: {
        assignmentId_studentUserId: {
          assignmentId,
          studentUserId: targetStudentId,
        },
      },
      update: {},
      create: {
        assignmentId,
        studentUserId: targetStudentId,
      },
    });

    return chat;
  }

  async listPrivateChatMessages(userId: string, chatId: string) {
    await this.access.assertPrivateChatAccess(chatId, userId);

    return this.prisma.privateAssignmentMessage.findMany({
      where: { chatId },
      include: {
        author: {
          select: { id: true, nickname: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createPrivateChatMessage(userId: string, chatId: string, dto: CreatePrivateMessageDto) {
    const chat = await this.access.assertPrivateChatAccess(chatId, userId);
    const message = await this.prisma.privateAssignmentMessage.create({
      data: {
        chatId,
        authorUserId: userId,
        content: dto.content,
      },
      include: {
        author: {
          select: { id: true, nickname: true },
        },
      },
    });

    await this.audit.log({
      actorUserId: userId,
      actionType: 'assignment_chat.message_created',
      entityType: 'private-chat',
      entityId: chatId,
      metadata: { assignmentId: chat.assignmentId },
    });

    const recipients = new Set<string>([chat.studentUserId]);
    const reviewers = await this.prisma.courseMember.findMany({
      where: {
        courseId: chat.assignment.channel.courseId,
        role: {
          in: [CourseRole.admin, CourseRole.teacher, CourseRole.assistant],
        },
      },
      select: { userId: true },
    });
    reviewers.forEach((reviewer) => recipients.add(reviewer.userId));
    recipients.delete(userId);

    await Promise.all(
      Array.from(recipients).map((recipientId) =>
        this.notifications.create(recipientId, {
          type: NotificationType.assignment_message,
          title: 'Новое сообщение по заданию',
          body: message.content.slice(0, 140),
          entityType: 'private-chat',
          entityId: chatId,
        }),
      ),
    );

    return message;
  }

  async getAssignmentAuditLogs(userId: string, assignmentId: string) {
    const assignment = await this.access.getAssignmentAccessible(assignmentId, userId);
    await this.access.assertCourseReviewer(assignment.channel.courseId, userId);
    return this.audit.listForEntity('assignment', assignmentId);
  }

  async getSubmissionActivity(userId: string, submissionId: string) {
    const submission = await this.access.assertSubmissionOwnerOrReviewer(submissionId, userId);
    await this.access.assertCourseReviewer(submission.assignment.channel.courseId, userId);
    return this.prisma.submissionActivityLog.findMany({
      where: { submissionId },
      orderBy: { occurredAt: 'desc' },
      include: {
        actor: {
          select: { id: true, nickname: true },
        },
      },
    });
  }
}
