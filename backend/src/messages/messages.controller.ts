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
import { SessionAuthGuard } from '../common/session-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateMessageReactionDto } from './dto/create-message-reaction.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { MessagesService } from './messages.service';

@Controller()
@UseGuards(SessionAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  private setDownloadHeaders(res: any, file: { originalName: string; mimeType?: string | null }) {
    const encodedName = encodeURIComponent(file.originalName);
    const fallbackName = file.originalName.replace(/[^\x20-\x7E]+/g, '_') || 'download';
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
    );
  }

  @Get('channels/:id/messages')
  list(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '30',
  ) {
    return this.messagesService.getChannelMessages(user.id, channelId, cursor, Number(limit));
  }

  @Get('channels/:id/messages/search')
  search(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
    @Query('q') q = '',
    @Query('limit') limit = '30',
  ) {
    return this.messagesService.searchChannelMessages(user.id, channelId, q, Number(limit));
  }

  @Post('channels/:id/messages')
  @UseInterceptors(FilesInterceptor('files', 10))
  create(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
    @Body() dto: CreateMessageDto,
    @UploadedFiles() files: any[] = [],
  ) {
    return this.messagesService.createMessage(user.id, channelId, dto.content, files);
  }

  @Patch('channels/:id/read')
  markRead(@CurrentUser() user: { id: string }, @Param('id') channelId: string) {
    return this.messagesService.markChannelRead(user.id, channelId);
  }

  @Delete('messages/:id')
  delete(@CurrentUser() user: { id: string }, @Param('id') messageId: string) {
    return this.messagesService.softDeleteMessage(user.id, messageId);
  }

  @Patch('messages/:id')
  update(
    @CurrentUser() user: { id: string },
    @Param('id') messageId: string,
    @Body() dto: UpdateMessageDto,
  ) {
    return this.messagesService.updateMessage(user.id, messageId, dto.content);
  }

  @Get('message-files/:id/download')
  async download(@CurrentUser() user: { id: string }, @Param('id') fileId: string, @Res() res: any) {
    const file = await this.messagesService.getMessageFile(user.id, fileId);
    this.setDownloadHeaders(res, file);
    return res.sendFile(resolve(file.path));
  }

  @Post('messages/:id/reactions')
  addReaction(
    @CurrentUser() user: { id: string },
    @Param('id') messageId: string,
    @Body() dto: CreateMessageReactionDto,
  ) {
    return this.messagesService.addReaction(user.id, messageId, dto.emoji);
  }

  @Delete('messages/:id/reactions')
  removeReaction(
    @CurrentUser() user: { id: string },
    @Param('id') messageId: string,
    @Query('emoji') emoji: string,
  ) {
    return this.messagesService.removeReaction(user.id, messageId, emoji);
  }
}
