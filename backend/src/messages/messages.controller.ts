import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../common/session-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessagesService } from './messages.service';

@Controller()
@UseGuards(SessionAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('channels/:id/messages')
  list(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '30',
  ) {
    return this.messagesService.getChannelMessages(user.id, channelId, cursor, Number(limit));
  }

  @Post('channels/:id/messages')
  create(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messagesService.createMessage(user.id, channelId, dto.content);
  }

  @Delete('messages/:id')
  delete(@CurrentUser() user: { id: string }, @Param('id') messageId: string) {
    return this.messagesService.softDeleteMessage(user.id, messageId);
  }
}

