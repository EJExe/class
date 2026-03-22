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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/current-user.decorator';
import { SessionAuthGuard } from '../common/session-auth.guard';
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { CreatePrivateMessageDto } from './dto/create-private-message.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { UpdateSubmissionStatusDto } from './dto/update-submission-status.dto';

@Controller()
@UseGuards(SessionAuthGuard)
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

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

  @Patch('assignments/:id')
  updateAssignment(
    @CurrentUser() user: { id: string },
    @Param('id') assignmentId: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.assignmentsService.updateAssignment(user.id, assignmentId, dto);
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
  @UseInterceptors(FileInterceptor('file'))
  addAssignmentFile(
    @CurrentUser() user: { id: string },
    @Param('id') assignmentId: string,
    @UploadedFile() file: any,
  ) {
    return this.assignmentsService.addAssignmentFile(user.id, assignmentId, file);
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
    return res.download(file.path, file.originalName);
  }

  @Post('assignments/:id/submissions/upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadSubmission(
    @CurrentUser() user: { id: string },
    @Param('id') assignmentId: string,
    @UploadedFile() file: any,
  ) {
    return this.assignmentsService.uploadSubmission(user.id, assignmentId, file);
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
    return res.download(file.path, file.originalName);
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

  @Get('assignments/:id/audit-logs')
  getAssignmentAuditLogs(@CurrentUser() user: { id: string }, @Param('id') assignmentId: string) {
    return this.assignmentsService.getAssignmentAuditLogs(user.id, assignmentId);
  }

  @Get('submissions/:id/activity')
  getSubmissionActivity(@CurrentUser() user: { id: string }, @Param('id') submissionId: string) {
    return this.assignmentsService.getSubmissionActivity(user.id, submissionId);
  }
}
