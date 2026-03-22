import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { SessionAuthGuard } from '../common/session-auth.guard';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { ChannelsService } from './channels.service';

@Controller()
@UseGuards(SessionAuthGuard)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Post('courses/:id/channels')
  create(
    @CurrentUser() user: { id: string },
    @Param('id') courseId: string,
    @Body() dto: CreateChannelDto,
  ) {
    return this.channelsService.createChannel(user.id, courseId, dto);
  }

  @Get('courses/:id/channels')
  list(@CurrentUser() user: { id: string }, @Param('id') courseId: string) {
    return this.channelsService.listChannels(user.id, courseId);
  }

  @Get('channels/:id')
  getOne(@CurrentUser() user: { id: string }, @Param('id') channelId: string) {
    return this.channelsService.getChannel(user.id, channelId);
  }

  @Patch('channels/:id')
  update(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
    @Body() dto: UpdateChannelDto,
  ) {
    return this.channelsService.updateChannel(user.id, channelId, dto);
  }
}
