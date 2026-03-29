import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AssignmentStatus,
  ChannelType,
  CourseRole,
  NotificationType,
  SubmissionStatus,
} from '@prisma/client';
import * as XLSX from 'xlsx';
import { AuditService } from '../audit/audit.service';
import { AccessService } from '../common/access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { CreatePrivateMessageDto } from './dto/create-private-message.dto';
import { CreateSubmissionFileCommentDto } from './dto/create-submission-file-comment.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { UpdatePrivateMessageDto } from './dto/update-private-message.dto';
import { UpdateSubmissionStatusDto } from './dto/update-submission-status.dto';

const submissionStatusLabelsMap: Record<SubmissionStatus, string> = {
  [SubmissionStatus.not_submitted]: 'Не сдано',
  [SubmissionStatus.draft]: 'Черновик',
  [SubmissionStatus.submitted]: 'Сдано',
  [SubmissionStatus.submitted_late]: 'Сдано с опозданием',
  [SubmissionStatus.under_review]: 'На проверке',
  [SubmissionStatus.reviewed]: 'Проверено',
  [SubmissionStatus.returned_for_revision]: 'На доработке',
};

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

  private decorateUser<T extends { id: string; avatarPath?: string | null }>(user: T) {
    return {
      ...user,
      avatarUrl: user.avatarPath ? `/api/users/${user.id}/avatar` : null,
    };
  }

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

  private escapeCsv(value: unknown) {
    const stringValue = value == null ? '' : String(value);
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  private toCsv(rows: Array<Array<unknown>>) {
    return rows.map((row) => row.map((value) => this.escapeCsv(value)).join(',')).join('\n');
  }

  private normalizeWorkbookType(format?: string): XLSX.BookType {
    if (format === 'xls' || format === 'xlsm') {
      return format;
    }
    return 'xlsx';
  }

  private buildWorkbookBuffer(rows: Array<Record<string, unknown>>, sheetName: string, format?: string) {
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31) || 'Sheet1');
    const bookType = this.normalizeWorkbookType(format);
    return XLSX.write(workbook, { type: 'buffer', bookType });
  }

  private gradebookStatusLabel(status: SubmissionStatus) {
    return submissionStatusLabelsMap[status] ?? status;
  }

  private getUnreadSubmissionTimestampForReviewer(submission: {
    submittedAt?: Date | null;
    updatedAt: Date;
    status: SubmissionStatus;
  }) {
    if (
      submission.status === SubmissionStatus.submitted ||
      submission.status === SubmissionStatus.submitted_late ||
      submission.status === SubmissionStatus.under_review
    ) {
      return submission.submittedAt ?? submission.updatedAt;
    }
    return null;
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
      where: { channelId, deletedAt: null },
      include: {
        files: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAssignment(userId: string, assignmentId: string) {
    const assignment = await this.access.getAssignmentAccessible(assignmentId, userId);
    const membership = await this.access.getCourseMembership(assignment.channel.courseId, userId);

    const [files, mySubmission, submissionsCount, readState, latestSubmission] = await Promise.all([
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
      this.prisma.assignmentReadState.findUnique({
        where: {
          assignmentId_userId: {
            assignmentId,
            userId,
          },
        },
      }),
      membership.role === CourseRole.student
        ? this.prisma.submission.findUnique({
            where: {
              assignmentId_studentUserId: {
                assignmentId,
                studentUserId: userId,
              },
            },
            select: {
              updatedAt: true,
            },
          })
        : this.prisma.submission.findFirst({
            where: {
              assignmentId,
              status: {
                in: [
                  SubmissionStatus.submitted,
                  SubmissionStatus.submitted_late,
                  SubmissionStatus.under_review,
                ],
              },
            },
            orderBy: [{ submittedAt: 'desc' }, { updatedAt: 'desc' }],
            select: {
              submittedAt: true,
              updatedAt: true,
              status: true,
            },
          }),
    ]);

    const lastReadAt = readState?.lastReadAt?.getTime() ?? 0;
    const baseUpdatedAt = assignment.updatedAt.getTime();
    const submissionUpdatedAt =
      membership.role === CourseRole.student
        ? (latestSubmission as { updatedAt: Date } | null)?.updatedAt?.getTime() ?? 0
        : latestSubmission
          ? (this.getUnreadSubmissionTimestampForReviewer(
              latestSubmission as { submittedAt?: Date | null; updatedAt: Date; status: SubmissionStatus },
            )?.getTime() ?? 0)
          : 0;

    return {
      ...assignment,
      files,
      mySubmission,
      submissionsCount,
      hasUnread: Math.max(baseUpdatedAt, submissionUpdatedAt) > lastReadAt,
    };
  }

  async markAssignmentRead(userId: string, assignmentId: string) {
    await this.access.getAssignmentAccessible(assignmentId, userId);
    return this.prisma.assignmentReadState.upsert({
      where: {
        assignmentId_userId: {
          assignmentId,
          userId,
        },
      },
      update: {
        lastReadAt: new Date(),
      },
      create: {
        assignmentId,
        userId,
      },
    });
  }

  async searchAssignmentStudents(userId: string, assignmentId: string, query?: string) {
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
    const normalized = query?.trim();

    const members = await this.prisma.courseMember.findMany({
      where: {
        courseId: assignment.channel.courseId,
        role: CourseRole.student,
        ...(normalized
          ? {
              user: {
                OR: [
                  { nickname: { contains: normalized, mode: 'insensitive' } },
                  { fullName: { contains: normalized, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      include: {
        user: {
          select: { id: true, nickname: true, fullName: true, avatarPath: true },
        },
      },
      orderBy: {
        user: {
          nickname: 'asc',
        },
      },
    });

    return members.map((member) => this.decorateUser(member.user));
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
        channel: {
          update: {
            ...(dto.title ? { name: dto.title } : {}),
            ...(dto.description !== undefined ? { description: dto.description } : {}),
          },
        },
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

  async trashAssignment(userId: string, assignmentId: string) {
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

    const updated = await this.prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        deletedAt: new Date(),
      },
    });

    await this.audit.log({
      actorUserId: userId,
      actionType: 'assignment.trashed',
      entityType: 'assignment',
      entityId: assignmentId,
      metadata: { courseId: assignment.channel.courseId },
    });

    return updated;
  }

  async restoreAssignment(userId: string, assignmentId: string) {
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

    const updated = await this.prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        deletedAt: null,
      },
    });

    await this.audit.log({
      actorUserId: userId,
      actionType: 'assignment.restored',
      entityType: 'assignment',
      entityId: assignmentId,
      metadata: { courseId: assignment.channel.courseId },
    });

    return updated;
  }

  async listTrashedAssignments(userId: string, courseId: string) {
    await this.access.assertCourseReviewer(courseId, userId);

    const items = await this.prisma.assignment.findMany({
      where: {
        deletedAt: { not: null },
        channel: {
          courseId,
        },
      },
      include: {
        channel: {
          select: { id: true, name: true },
        },
      },
      orderBy: { deletedAt: 'desc' },
    });

    return items;
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

  async addAssignmentFiles(userId: string, assignmentId: string, files: any[] = []) {
    const prepared = files.filter(Boolean);
    if (prepared.length === 0) {
      throw new BadRequestException('At least one file is required');
    }

    const items = [];
    for (const file of prepared) {
      items.push(await this.addAssignmentFile(userId, assignmentId, file));
    }
    return items;
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

  async uploadSubmissionFiles(userId: string, assignmentId: string, files: any[] = []) {
    const prepared = files.filter(Boolean);
    if (prepared.length === 0) {
      throw new BadRequestException('At least one file is required');
    }

    let updated: any = null;
    for (const file of prepared) {
      updated = await this.uploadSubmission(userId, assignmentId, file);
    }
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
            select: { id: true, nickname: true, fullName: true, avatarPath: true },
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
      items: items.map((item) => ({
        ...item,
        student: this.decorateUser(item.student),
      })),
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

    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        currentFile: true,
        files: {
          include: {
            comments: {
              orderBy: { createdAt: 'asc' },
              include: {
                author: {
                  select: { id: true, nickname: true, fullName: true, avatarPath: true },
                },
              },
            },
          },
        },
        student: {
          select: { id: true, nickname: true, fullName: true, avatarPath: true },
        },
      },
    });
    return submission
      ? {
          ...submission,
          student: this.decorateUser(submission.student),
          files: submission.files.map((file) => ({
            ...file,
            comments: file.comments.map((comment) => ({
              ...comment,
              author: this.decorateUser(comment.author),
            })),
          })),
        }
      : submission;
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

  async addSubmissionFileComment(userId: string, fileId: string, dto: CreateSubmissionFileCommentDto) {
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

    await this.access.assertCourseReviewer(file.submission.assignment.channel.courseId, userId);

    const comment = await this.prisma.submissionFileComment.create({
      data: {
        fileId,
        authorUserId: userId,
        content: dto.content.trim(),
      },
      include: {
        author: {
          select: { id: true, nickname: true, fullName: true, avatarPath: true },
        },
      },
    });

    await this.audit.log({
      actorUserId: userId,
      actionType: 'submission.file_comment_created',
      entityType: 'submission-file',
      entityId: fileId,
      metadata: {
        submissionId: file.submissionId,
        contentPreview: dto.content.trim().slice(0, 140),
      },
    });

    return {
      ...comment,
      author: this.decorateUser(comment.author),
    };
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

    const targetMembership = await this.access.assertCourseMember(assignment.channel.courseId, targetStudentId);
    if (targetMembership.role !== CourseRole.student) {
      throw new BadRequestException('Private chat can be created only for a student');
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

    const student = await this.prisma.user.findUnique({
      where: { id: targetStudentId },
      select: { id: true, nickname: true, fullName: true, avatarPath: true },
    });

    return {
      ...chat,
      student: student ? this.decorateUser(student) : null,
    };
  }

  async listPrivateChatMessages(userId: string, chatId: string) {
    await this.access.assertPrivateChatAccess(chatId, userId);

    const items = await this.prisma.privateAssignmentMessage.findMany({
      where: { chatId },
      include: {
        author: {
          select: { id: true, nickname: true, fullName: true, avatarPath: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return items.map((item) => ({
      ...item,
      author: this.decorateUser(item.author),
    }));
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
          select: { id: true, nickname: true, fullName: true, avatarPath: true },
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

    return {
      ...message,
      author: this.decorateUser(message.author),
    };
  }

  async updatePrivateChatMessage(userId: string, messageId: string, dto: UpdatePrivateMessageDto) {
    const normalizedContent = dto.content.trim();
    if (!normalizedContent) {
      throw new BadRequestException('Message content is required');
    }

    const message = await this.prisma.privateAssignmentMessage.findUnique({
      where: { id: messageId },
      include: {
        chat: {
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
    if (!message || message.deletedAt) {
      throw new NotFoundException('Private message not found');
    }

    await this.access.getCourseMembership(message.chat.assignment.channel.courseId, userId);
    if (message.authorUserId !== userId) {
      throw new ForbiddenException('Cannot edit this private message');
    }

    const updated = await this.prisma.privateAssignmentMessage.update({
      where: { id: messageId },
      data: {
        content: normalizedContent,
        editedAt: new Date(),
      },
      include: {
        author: {
          select: { id: true, nickname: true, fullName: true, avatarPath: true },
        },
      },
    });

    await this.audit.log({
      actorUserId: userId,
      actionType: 'assignment_chat.message_updated',
      entityType: 'private-chat-message',
      entityId: messageId,
      metadata: {
        chatId: updated.chatId,
        contentPreview: normalizedContent.slice(0, 120),
      },
    });

    return {
      ...updated,
      author: this.decorateUser(updated.author),
    };
  }

  async getAssignmentAuditLogs(userId: string, assignmentId: string, page = 1, limit = 10) {
    const assignment = await this.access.getAssignmentAccessible(assignmentId, userId);
    await this.access.assertCourseReviewer(assignment.channel.courseId, userId);
    return this.audit.listForEntity('assignment', assignmentId, page, limit);
  }

  async listDeadlines(
    userId: string,
    scope: 'my' | 'course' = 'my',
    courseId?: string,
    limit = 20,
    filter: 'all' | 'upcoming' | 'overdue' | 'needs_review' = 'all',
  ) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    if (scope === 'course') {
      if (!courseId) {
        throw new BadRequestException('courseId is required for course scope');
      }
      await this.access.assertCourseMember(courseId, userId);
    }

    const memberships = await this.prisma.courseMember.findMany({
      where: scope === 'course' ? { courseId } : { userId },
      select: {
        courseId: true,
        role: true,
      },
    });

    const courseIds = Array.from(new Set(memberships.map((item) => item.courseId)));
    if (courseIds.length === 0) {
      return [];
    }

    const items = await this.prisma.assignment.findMany({
      where: {
        deletedAt: null,
        channel: {
          courseId: { in: courseIds },
        },
        status: { in: [AssignmentStatus.active, AssignmentStatus.closed] },
        deadlineAt: {
          not: null,
        },
      },
      include: {
        channel: {
          include: {
            course: {
              select: { id: true, title: true },
            },
          },
        },
        submissions: {
          select: {
            id: true,
            studentUserId: true,
            status: true,
            submittedAt: true,
            teacherComment: true,
            grade: true,
          },
        },
      },
      orderBy: {
        deadlineAt: 'asc',
      },
      take: safeLimit,
    });

    const reviewerCourseIds = new Set(
      memberships
        .filter(
          (item) =>
            item.role === CourseRole.admin ||
            item.role === CourseRole.teacher ||
            item.role === CourseRole.assistant,
        )
        .map((item) => item.courseId),
    );
    const now = Date.now();

    return items
      .map((item) => {
        const mySubmission = item.submissions.find((submission) => submission.studentUserId === userId) ?? null;
        const needsReviewCount = reviewerCourseIds.has(item.channel.courseId)
          ? item.submissions.filter(
              (submission) =>
                submission.status === SubmissionStatus.submitted ||
                submission.status === SubmissionStatus.submitted_late ||
                submission.status === SubmissionStatus.under_review,
            ).length
          : 0;
        const isOverdue = item.deadlineAt ? new Date(item.deadlineAt).getTime() < now : false;
        return {
          id: item.id,
          title: item.title,
          status: item.status,
          deadlineAt: item.deadlineAt,
          channelId: item.channelId,
          course: item.channel.course,
          mySubmission,
          needsReviewCount,
          isOverdue,
          isReviewerView: reviewerCourseIds.has(item.channel.courseId),
        };
      })
      .filter((item) => {
        if (filter === 'upcoming') return !item.isOverdue;
        if (filter === 'overdue') return item.isOverdue;
        if (filter === 'needs_review') return item.needsReviewCount > 0;
        return true;
      });
  }

  async listReviewQueue(userId: string, courseId?: string) {
    const memberships = await this.prisma.courseMember.findMany({
      where: courseId ? { userId, courseId } : { userId },
      select: { courseId: true, role: true },
    });

    const reviewerRoles: CourseRole[] = [CourseRole.admin, CourseRole.teacher, CourseRole.assistant];
    const reviewerCourseIds = memberships.filter((item) => reviewerRoles.includes(item.role)).map((item) => item.courseId);

    if (reviewerCourseIds.length === 0) {
      return [];
    }

    const items = await this.prisma.submission.findMany({
      where: {
        assignment: {
          deletedAt: null,
          channel: {
            courseId: { in: Array.from(new Set(reviewerCourseIds)) },
          },
        },
        status: {
          in: [SubmissionStatus.submitted, SubmissionStatus.submitted_late, SubmissionStatus.under_review],
        },
      },
      include: {
        student: {
          select: { id: true, nickname: true, fullName: true, avatarPath: true },
        },
        assignment: {
          include: {
            channel: {
              include: {
                course: {
                  select: { id: true, title: true },
                },
              },
            },
          },
        },
        currentFile: true,
      },
      orderBy: [{ submittedAt: 'asc' }, { updatedAt: 'asc' }],
      take: 200,
    });

    return items.map((item) => ({
      ...item,
      student: this.decorateUser(item.student),
      needsAttentionSince: item.submittedAt ?? item.updatedAt,
    }));
  }

  async getGradebook(userId: string, courseId: string, groupId?: string) {
    await this.access.assertCourseReviewer(courseId, userId);

    if (groupId) {
      const group = await this.prisma.courseGroup.findUnique({
        where: { id: groupId },
        select: { courseId: true },
      });
      if (!group || group.courseId !== courseId) {
        throw new NotFoundException('Group not found');
      }
    }

    const [groups, students, assignments, submissions] = await Promise.all([
      this.prisma.courseGroup.findMany({
        where: { courseId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.courseMember.findMany({
        where: {
          courseId,
          role: CourseRole.student,
          ...(groupId
            ? {
                user: {
                  courseGroupMemberships: {
                    some: { groupId },
                  },
                },
              }
            : {}),
        },
        include: {
          user: {
            select: { id: true, nickname: true, fullName: true, avatarPath: true },
          },
        },
        orderBy: {
          user: { nickname: 'asc' },
        },
      }),
      this.prisma.assignment.findMany({
        where: {
          deletedAt: null,
          channel: { courseId },
        },
        select: {
          id: true,
          title: true,
          deadlineAt: true,
          status: true,
          channelId: true,
        },
        orderBy: [{ deadlineAt: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.submission.findMany({
        where: {
          assignment: {
            channel: { courseId },
            deletedAt: null,
          },
        },
        select: {
          id: true,
          assignmentId: true,
          studentUserId: true,
          grade: true,
          status: true,
          teacherComment: true,
          updatedAt: true,
        },
      }),
    ]);

    const groupMemberships = await this.prisma.courseGroupMember.findMany({
      where: {
        userId: { in: students.map((member) => member.user.id) },
        group: { courseId },
      },
      include: {
        group: { select: { id: true, name: true } },
      },
    });

    const groupsByUserId = new Map<string, Array<{ id: string; name: string }>>();
    for (const membership of groupMemberships) {
      const items = groupsByUserId.get(membership.userId) ?? [];
      items.push(membership.group);
      groupsByUserId.set(membership.userId, items);
    }

    const submissionMap = new Map<string, any>();
    for (const submission of submissions) {
      submissionMap.set(`${submission.studentUserId}:${submission.assignmentId}`, submission);
    }

    return {
      courseId,
      groups,
      assignments,
      rows: students.map((member) => ({
        student: {
          ...this.decorateUser(member.user),
          groups: groupsByUserId.get(member.user.id) ?? [],
        },
        grades: assignments.map((assignment) => {
          const submission = submissionMap.get(`${member.user.id}:${assignment.id}`) ?? null;
          return {
            assignmentId: assignment.id,
            submissionId: submission?.id ?? null,
            grade: submission?.grade ?? '',
            status: submission?.status ?? SubmissionStatus.not_submitted,
            teacherComment: submission?.teacherComment ?? '',
            updatedAt: submission?.updatedAt ?? null,
          };
        }),
      })),
    };
  }

  async upsertGradebookCell(
    userId: string,
    courseId: string,
    assignmentId: string,
    studentUserId: string,
    dto: { grade?: string; teacherComment?: string; status?: SubmissionStatus },
  ) {
    await this.access.assertCourseReviewer(courseId, userId);

    const assignment = await this.prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        deletedAt: null,
        channel: { courseId },
      },
      include: {
        channel: true,
      },
    });
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    const member = await this.prisma.courseMember.findUnique({
      where: {
        courseId_userId: {
          courseId,
          userId: studentUserId,
        },
      },
    });
    if (!member || member.role !== CourseRole.student) {
      throw new BadRequestException('Target user is not a student of this course');
    }

    const nextStatus = dto.status ?? SubmissionStatus.reviewed;
    this.assertReviewerSubmissionStatus(nextStatus);

    let submission = await this.prisma.submission.findUnique({
      where: {
        assignmentId_studentUserId: {
          assignmentId,
          studentUserId,
        },
      },
    });

    const previousStatus = submission?.status ?? SubmissionStatus.not_submitted;

    if (!submission) {
      submission = await this.prisma.submission.create({
        data: {
          assignmentId,
          studentUserId,
          grade: dto.grade,
          teacherComment: dto.teacherComment,
          status: nextStatus,
        },
      });
    } else {
      submission = await this.prisma.submission.update({
        where: { id: submission.id },
        data: {
          grade: dto.grade,
          teacherComment: dto.teacherComment,
          status: nextStatus,
        },
      });
    }

    await this.prisma.submissionActivityLog.create({
      data: {
        submissionId: submission.id,
        actorUserId: userId,
        actionType: 'gradebook_updated',
        metadataJson: {
          previousStatus,
          nextStatus,
          grade: dto.grade ?? null,
          teacherComment: dto.teacherComment ?? null,
        } as any,
      },
    });

    await this.audit.log({
      actorUserId: userId,
      actionType: 'submission.gradebook_updated',
      entityType: 'submission',
      entityId: submission.id,
      metadata: {
        assignmentId,
        studentUserId,
        previousStatus,
        nextStatus,
        grade: dto.grade ?? null,
        teacherComment: dto.teacherComment ?? null,
      },
    });

    await this.notifications.create(studentUserId, {
      type: NotificationType.submission_graded,
      title: 'Оценка обновлена',
      body: `По заданию "${assignment.title}" обновлена оценка`,
      entityType: 'submission',
      entityId: submission.id,
    });

    return submission;
  }

  async exportGradebookWorkbook(userId: string, courseId: string, format: string, groupId?: string) {
    await this.access.assertCourseReviewer(courseId, userId);
    const data = await this.getGradebook(userId, courseId, groupId);

    const rows = data.rows.map((row) => {
      const base: Record<string, unknown> = {
        Студент: row.student.fullName || row.student.nickname,
        Логин: row.student.nickname,
        Группы: row.student.groups.map((group: any) => group.name).join(', '),
      };
      row.grades.forEach((cell) => {
        const assignment = data.assignments.find((item) => item.id === cell.assignmentId);
        const title = assignment?.title ?? cell.assignmentId;
        base[`${title} | оценка`] = cell.grade;
        base[`${title} | статус`] = this.gradebookStatusLabel(cell.status);
      });
      return base;
    });

    return this.buildWorkbookBuffer(rows, 'Gradebook', format);
  }

  async exportDeadlinesCsv(
    userId: string,
    scope: 'my' | 'course' = 'my',
    courseId?: string,
    filter: 'all' | 'upcoming' | 'overdue' | 'needs_review' = 'all',
  ) {
    if (scope === 'course' && courseId) {
      const membership = await this.access.assertCourseMember(courseId, userId);
      if (membership.role !== CourseRole.admin) {
        throw new ForbiddenException('Only admins can export deadlines');
      }
    } else {
      throw new ForbiddenException('Only admins can export deadlines');
    }

    const items = await this.listDeadlines(userId, scope, courseId, 500, filter);
    return this.toCsv([
      ['Курс', 'Задание', 'Статус задания', 'Дедлайн', 'Моя работа', 'Нужно проверить'],
      ...items.map((item) => [
        item.course.title,
        item.title,
        item.status,
        item.deadlineAt ? new Date(item.deadlineAt).toISOString() : '',
        item.mySubmission?.status ?? '',
        item.needsReviewCount ?? 0,
      ]),
    ]);
  }

  async exportReviewLogCsv(userId: string, courseId: string) {
    const membership = await this.access.assertCourseMember(courseId, userId);
    if (membership.role !== CourseRole.admin) {
      throw new ForbiddenException('Only admins can export review log');
    }

    const items = await this.prisma.submission.findMany({
      where: {
        assignment: {
          deletedAt: null,
          channel: {
            courseId,
          },
        },
        OR: [
          { grade: { not: null } },
          { teacherComment: { not: null } },
          { status: { in: [SubmissionStatus.reviewed, SubmissionStatus.returned_for_revision] } },
        ],
      },
      include: {
        student: {
          select: { nickname: true, fullName: true },
        },
        assignment: {
          select: { title: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });

    return this.toCsv([
      ['Задание', 'Студент', 'Статус', 'Оценка', 'Комментарий', 'Обновлено'],
      ...items.map((item) => [
        item.assignment.title,
        item.student.fullName || item.student.nickname,
        item.status,
        item.grade ?? '',
        item.teacherComment ?? '',
        item.updatedAt.toISOString(),
      ]),
    ]);
  }

  async listAvailableFiles(userId: string, query?: string, courseId?: string) {
    const memberships = await this.prisma.courseMember.findMany({
      where: courseId ? { userId, courseId } : { userId },
      select: { courseId: true, role: true },
    });
    const courseIds = Array.from(new Set(memberships.map((item) => item.courseId)));
    if (courseIds.length === 0) {
      return [];
    }

    const normalized = query?.trim();
    const reviewerCourseIds = new Set(
      memberships
        .filter(
          (item) =>
            item.role === CourseRole.admin ||
            item.role === CourseRole.teacher ||
            item.role === CourseRole.assistant,
        )
        .map((item) => item.courseId),
    );

    const [assignmentFiles, submissionFiles] = await Promise.all([
      this.prisma.assignmentFile.findMany({
        where: {
          assignment: {
            channel: {
              courseId: { in: courseIds },
            },
          },
          ...(normalized
            ? {
                OR: [
                  { originalName: { contains: normalized, mode: 'insensitive' } },
                  { assignment: { title: { contains: normalized, mode: 'insensitive' } } },
                ],
              }
            : {}),
        },
        include: {
          assignment: {
            include: {
              channel: {
                include: {
                  course: {
                    select: { id: true, title: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.submissionFile.findMany({
        where: {
          submission: {
            assignment: {
              channel: {
                courseId: { in: courseIds },
              },
            },
            OR: [
              { studentUserId: userId },
              {
                assignment: {
                  channel: {
                    courseId: { in: Array.from(reviewerCourseIds) },
                  },
                },
              },
            ],
          },
          ...(normalized
            ? {
                OR: [
                  { originalName: { contains: normalized, mode: 'insensitive' } },
                  { submission: { assignment: { title: { contains: normalized, mode: 'insensitive' } } } },
                ],
              }
            : {}),
        },
        include: {
          submission: {
            include: {
              student: {
                select: { id: true, nickname: true, fullName: true, avatarPath: true },
              },
              assignment: {
                include: {
                  channel: {
                    include: {
                      course: {
                        select: { id: true, title: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { uploadedAt: 'desc' },
        take: 100,
      }),
    ]);

    return [
      ...assignmentFiles.map((file) => ({
        id: file.id,
        type: 'assignment_material',
        name: file.originalName,
        createdAt: file.createdAt,
        course: file.assignment.channel.course,
        assignment: { id: file.assignmentId, title: file.assignment.title },
      })),
      ...submissionFiles.map((file) => ({
        id: file.id,
        type: 'submission_file',
        name: file.originalName,
        createdAt: file.uploadedAt,
        course: file.submission.assignment.channel.course,
        assignment: { id: file.submission.assignmentId, title: file.submission.assignment.title },
        owner: this.decorateUser(file.submission.student),
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getSubmissionActivity(userId: string, submissionId: string, page = 1, limit = 10) {
    const submission = await this.access.assertSubmissionOwnerOrReviewer(submissionId, userId);
    await this.access.assertCourseReviewer(submission.assignment.channel.courseId, userId);
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const skip = Math.max(page - 1, 0) * safeLimit;

    const [items, total] = await Promise.all([
      this.prisma.submissionActivityLog.findMany({
        where: { submissionId },
        orderBy: { occurredAt: 'desc' },
        skip,
        take: safeLimit,
        include: {
          actor: {
            select: { id: true, nickname: true, fullName: true, avatarPath: true },
          },
        },
      }),
      this.prisma.submissionActivityLog.count({
        where: { submissionId },
      }),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        actor: item.actor ? this.decorateUser(item.actor) : item.actor,
      })),
      total,
      page,
      pageSize: safeLimit,
    };
  }

  async getSubmissionActivityCsv(userId: string, submissionId: string) {
    const submission = await this.access.assertSubmissionOwnerOrReviewer(submissionId, userId);
    await this.access.assertCourseReviewer(submission.assignment.channel.courseId, userId);

    const items = await this.prisma.submissionActivityLog.findMany({
      where: { submissionId },
      orderBy: { occurredAt: 'desc' },
      include: {
        actor: {
          select: { nickname: true, fullName: true },
        },
      },
      take: 500,
    });

    return this.toCsv([
      ['Действие', 'Исполнитель', 'Когда', 'Данные'],
      ...items.map((item) => [
        item.actionType,
        item.actor?.fullName || item.actor?.nickname || 'system',
        item.occurredAt.toISOString(),
        JSON.stringify(item.metadataJson ?? {}),
      ]),
    ]);
  }
}

