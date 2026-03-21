import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../common/session-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateChannelDto } from './dto/create-channel.dto';
import { ChannelsService } from './channels.service';

@Controller('courses/:id/channels')
@UseGuards(SessionAuthGuard)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Param('id') courseId: string,
    @Body() dto: CreateChannelDto,
  ) {
    return this.channelsService.createChannel(user.id, courseId, dto.name);
  }

  @Get()
  list(@CurrentUser() user: { id: string }, @Param('id') courseId: string) {
    return this.channelsService.listChannels(user.id, courseId);
  }
}

