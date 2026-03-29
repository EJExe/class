import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { resolve } from 'path';
import { CurrentUser } from '../common/current-user.decorator';
import { SessionAuthGuard } from '../common/session-auth.guard';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { CreatePrivateMessageDto } from './dto/create-private-message.dto';
import { CreateSubmissionFileCommentDto } from './dto/create-submission-file-comment.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { UpdatePrivateMessageDto } from './dto/update-private-message.dto';
import { UpdateSubmissionStatusDto } from './dto/update-submission-status.dto';

@Controller()
@UseGuards(SessionAuthGuard)
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  private setDownloadHeaders(res: any, file: { originalName: string; mimeType?: string | null }) {
    const encodedName = encodeURIComponent(file.originalName);
    const fallbackName = file.originalName.replace(/[^\x20-\x7E]+/g, '_') || 'download';
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
    );
  }

  @Post('channels/:id/assignments')
  createAssignment(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.assignmentsService.createAssignment(user.id, channelId, dto);
  }

  @Get('channels/:id/assignments')
  listByChannel(@CurrentUser() user: { id: string }, @Param('id') channelId: string) {
    return this.assignmentsService.listByChannel(user.id, channelId);
  }

  @Get('assignments/:id')
  getAssignment(@CurrentUser() user: { id: string }, @Param('id') assignmentId: string) {
    return this.assignmentsService.getAssignment(user.id, assignmentId);
  }

  @Patch('assignments/:id/read')
  markAssignmentRead(@CurrentUser() user: { id: string }, @Param('id') assignmentId: string) {
    return this.assignmentsService.markAssignmentRead(user.id, assignmentId);
  }

  @Get('assignments/:id/students')
  searchStudents(
    @CurrentUser() user: { id: string },
    @Param('id') assignmentId: string,
    @Query('q') q?: string,
  ) {
    return this.assignmentsService.searchAssignmentStudents(user.id, assignmentId, q);
  }

  @Patch('assignments/:id')
  updateAssignment(
    @CurrentUser() user: { id: string },
    @Param('id') assignmentId: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.assignmentsService.updateAssignment(user.id, assignmentId, dto);
  }

  @Delete('assignments/:id')
  trashAssignment(@CurrentUser() user: { id: string }, @Param('id') assignmentId: string) {
    return this.assignmentsService.trashAssignment(user.id, assignmentId);
  }

  @Patch('assignments/:id/restore')
  restoreAssignment(@CurrentUser() user: { id: string }, @Param('id') assignmentId: string) {
    return this.assignmentsService.restoreAssignment(user.id, assignmentId);
  }

  @Get('courses/:id/assignments/trash')
  listTrashedAssignments(@CurrentUser() user: { id: string }, @Param('id') courseId: string) {
    return this.assignmentsService.listTrashedAssignments(user.id, courseId);
  }

  @Get('courses/:id/gradebook')
  getGradebook(
    @CurrentUser() user: { id: string },
    @Param('id') courseId: string,
    @Query('groupId') groupId?: string,
  ) {
    return this.assignmentsService.getGradebook(user.id, courseId, groupId);
  }

  @Patch('courses/:id/gradebook')
  updateGradebookCell(
    @CurrentUser() user: { id: string },
    @Param('id') courseId: string,
    @Body()
    dto: { assignmentId: string; studentUserId: string; grade?: string; teacherComment?: string; status?: any },
  ) {
    return this.assignmentsService.upsertGradebookCell(user.id, courseId, dto.assignmentId, dto.studentUserId, {
      grade: dto.grade,
      teacherComment: dto.teacherComment,
      status: dto.status,
    });
  }

  @Get('courses/:id/gradebook/export')
  async exportGradebook(
    @CurrentUser() user: { id: string },
    @Param('id') courseId: string,
    @Query('format') format = 'xlsx',
    @Query('groupId') groupId: string | undefined,
    @Res() res: any,
  ) {
    const normalizedFormat = ['xlsx', 'xls', 'xlsm'].includes(format) ? format : 'xlsx';
    const buffer = await this.assignmentsService.exportGradebookWorkbook(
      user.id,
      courseId,
      normalizedFormat,
      groupId,
    );
    const mime =
      normalizedFormat === 'xls'
        ? 'application/vnd.ms-excel'
        : normalizedFormat === 'xlsm'
          ? 'application/vnd.ms-excel.sheet.macroEnabled.12'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    res.setHeader('Content-Type', mime);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="course-${courseId}-gradebook.${normalizedFormat}"`,
    );
    return res.send(buffer);
  }

  @Patch('assignments/:id/status')
  updateAssignmentStatus(
    @CurrentUser() user: { id: string },
    @Param('id') assignmentId: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.assignmentsService.updateAssignment(user.id, assignmentId, { status: dto.status });
  }

  @Post('assignments/:id/files')
  @UseInterceptors(FilesInterceptor('files', 20))
  addAssignmentFile(
    @CurrentUser() user: { id: string },
    @Param('id') assignmentId: string,
    @UploadedFiles() files: any[] = [],
  ) {
    return this.assignmentsService.addAssignmentFiles(user.id, assignmentId, files);
  }

  @Get('assignments/:id/files')
  listAssignmentFiles(@CurrentUser() user: { id: string }, @Param('id') assignmentId: string) {
    return this.assignmentsService.listAssignmentFiles(user.id, assignmentId);
  }

  @Delete('assignment-files/:id')
  deleteAssignmentFile(@CurrentUser() user: { id: string }, @Param('id') fileId: string) {
    return this.assignmentsService.deleteAssignmentFile(user.id, fileId);
  }

  @Get('assignment-files/:id/download')
  async downloadAssignmentFile(
    @CurrentUser() user: { id: string },
    @Param('id') fileId: string,
    @Res() res: any,
  ) {
    const file = await this.assignmentsService.getAssignmentFile(user.id, fileId);
    this.setDownloadHeaders(res, file);
    return res.sendFile(resolve(file.path));
  }

  @Post('assignments/:id/submissions/upload')
  @UseInterceptors(FilesInterceptor('files', 20))
  uploadSubmission(
    @CurrentUser() user: { id: string },
    @Param('id') assignmentId: string,
    @UploadedFiles() files: any[] = [],
  ) {
    return this.assignmentsService.uploadSubmissionFiles(user.id, assignmentId, files);
  }

  @Post('assignments/:id/submissions/submit')
  submitSubmission(@CurrentUser() user: { id: string }, @Param('id') assignmentId: string) {
    return this.assignmentsService.submitSubmission(user.id, assignmentId);
  }

  @Get('assignments/:id/submissions')
  listSubmissions(
    @CurrentUser() user: { id: string },
    @Param('id') assignmentId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: any,
  ) {
    return this.assignmentsService.listSubmissions(user.id, assignmentId, Number(page), Number(limit), status);
  }

  @Get('assignments/:id/my-submission')
  getMySubmission(@CurrentUser() user: { id: string }, @Param('id') assignmentId: string) {
    return this.assignmentsService.getMySubmission(user.id, assignmentId);
  }

  @Get('submissions/:id')
  getSubmission(@CurrentUser() user: { id: string }, @Param('id') submissionId: string) {
    return this.assignmentsService.getSubmission(user.id, submissionId);
  }

  @Get('submission-files/:id/download')
  async downloadSubmissionFile(
    @CurrentUser() user: { id: string },
    @Param('id') fileId: string,
    @Res() res: any,
  ) {
    const file = await this.assignmentsService.getSubmissionFile(user.id, fileId);
    this.setDownloadHeaders(res, file);
    return res.sendFile(resolve(file.path));
  }

  @Post('submission-files/:id/comments')
  addSubmissionFileComment(
    @CurrentUser() user: { id: string },
    @Param('id') fileId: string,
    @Body() dto: CreateSubmissionFileCommentDto,
  ) {
    return this.assignmentsService.addSubmissionFileComment(user.id, fileId, dto);
  }

  @Patch('submissions/:id/status')
  updateSubmissionStatus(
    @CurrentUser() user: { id: string },
    @Param('id') submissionId: string,
    @Body() dto: UpdateSubmissionStatusDto,
  ) {
    return this.assignmentsService.updateSubmissionStatus(user.id, submissionId, dto);
  }

  @Patch('submissions/:id/grade')
  gradeSubmission(
    @CurrentUser() user: { id: string },
    @Param('id') submissionId: string,
    @Body() dto: GradeSubmissionDto,
  ) {
    return this.assignmentsService.gradeSubmission(user.id, submissionId, dto);
  }

  @Get('assignments/:id/private-chat')
  getPrivateChat(
    @CurrentUser() user: { id: string },
    @Param('id') assignmentId: string,
    @Query('studentUserId') studentUserId?: string,
  ) {
    return this.assignmentsService.getPrivateChat(user.id, assignmentId, studentUserId);
  }

  @Get('private-chats/:id/messages')
  listPrivateMessages(@CurrentUser() user: { id: string }, @Param('id') chatId: string) {
    return this.assignmentsService.listPrivateChatMessages(user.id, chatId);
  }

  @Post('private-chats/:id/messages')
  createPrivateMessage(
    @CurrentUser() user: { id: string },
    @Param('id') chatId: string,
    @Body() dto: CreatePrivateMessageDto,
  ) {
    return this.assignmentsService.createPrivateChatMessage(user.id, chatId, dto);
  }

  @Patch('private-messages/:id')
  updatePrivateMessage(
    @CurrentUser() user: { id: string },
    @Param('id') messageId: string,
    @Body() dto: UpdatePrivateMessageDto,
  ) {
    return this.assignmentsService.updatePrivateChatMessage(user.id, messageId, dto);
  }

  @Get('assignments/:id/audit-logs')
  getAssignmentAuditLogs(
    @CurrentUser() user: { id: string },
    @Param('id') assignmentId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return this.assignmentsService.getAssignmentAuditLogs(user.id, assignmentId, Number(page), Number(limit));
  }

  @Get('assignments-deadlines')
  listDeadlines(
    @CurrentUser() user: { id: string },
    @Query('scope') scope = 'my',
    @Query('courseId') courseId?: string,
    @Query('limit') limit = '20',
    @Query('filter') filter = 'all',
  ) {
    return this.assignmentsService.listDeadlines(
      user.id,
      scope === 'course' ? 'course' : 'my',
      courseId,
      Number(limit),
      ['all', 'upcoming', 'overdue', 'needs_review'].includes(filter) ? (filter as any) : 'all',
    );
  }

  @Get('assignments-deadlines/export')
  async exportDeadlines(
    @CurrentUser() user: { id: string },
    @Query('scope') scope = 'my',
    @Query('courseId') courseId?: string,
    @Query('filter') filter = 'all',
    @Res() res?: any,
  ) {
    const csv = await this.assignmentsService.exportDeadlinesCsv(
      user.id,
      scope === 'course' ? 'course' : 'my',
      courseId,
      ['all', 'upcoming', 'overdue', 'needs_review'].includes(filter) ? (filter as any) : 'all',
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="deadlines.csv"');
    return res.send('\uFEFF' + csv);
  }

  @Get('files-library')
  listAvailableFiles(
    @CurrentUser() user: { id: string },
    @Query('q') q?: string,
    @Query('courseId') courseId?: string,
  ) {
    return this.assignmentsService.listAvailableFiles(user.id, q, courseId);
  }

  @Get('submissions/:id/activity')
  getSubmissionActivity(
    @CurrentUser() user: { id: string },
    @Param('id') submissionId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return this.assignmentsService.getSubmissionActivity(user.id, submissionId, Number(page), Number(limit));
  }

  @Get('submissions/:id/activity/export')
  async exportSubmissionActivity(
    @CurrentUser() user: { id: string },
    @Param('id') submissionId: string,
    @Res() res: any,
  ) {
    const csv = await this.assignmentsService.getSubmissionActivityCsv(user.id, submissionId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="submission-${submissionId}-activity.csv"`);
    return res.send('\uFEFF' + csv);
  }

  @Get('courses/:id/review-log/export')
  async exportReviewLog(
    @CurrentUser() user: { id: string },
    @Param('id') courseId: string,
    @Res() res: any,
  ) {
    const csv = await this.assignmentsService.exportReviewLogCsv(user.id, courseId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="course-${courseId}-review-log.csv"`);
    return res.send('\uFEFF' + csv);
  }

  @Get('review-queue')
  listReviewQueue(@CurrentUser() user: { id: string }, @Query('courseId') courseId?: string) {
    return this.assignmentsService.listReviewQueue(user.id, courseId);
  }
}
