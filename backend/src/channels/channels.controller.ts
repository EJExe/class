import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { SessionAuthGuard } from '../common/session-auth.guard';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { ChannelsService } from './channels.service';

@ApiTags('Channels')
@ApiBearerAuth()
@Controller()
@UseGuards(SessionAuthGuard)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Post('courses/:id/channels')
  @ApiOperation({ summary: 'Создать канал в курсе (текстовый или с заданием)' })
  create(
    @CurrentUser() user: { id: string },
    @Param('id') courseId: string,
    @Body() dto: CreateChannelDto,
  ) {
    return this.channelsService.createChannel(user.id, courseId, dto);
  }

  @Get('courses/:id/channels')
  @ApiOperation({ summary: 'Список каналов курса' })
  list(@CurrentUser() user: { id: string }, @Param('id') courseId: string) {
    return this.channelsService.listChannels(user.id, courseId);
  }

  @Get('channels/:id')
  @ApiOperation({ summary: 'Детали канала' })
  getOne(@CurrentUser() user: { id: string }, @Param('id') channelId: string) {
    return this.channelsService.getChannel(user.id, channelId);
  }

  @Patch('channels/:id')
  @ApiOperation({ summary: 'Обновить название/описание/доступ канала' })
  update(
    @CurrentUser() user: { id: string },
    @Param('id') channelId: string,
    @Body() dto: UpdateChannelDto,
  ) {
    return this.channelsService.updateChannel(user.id, channelId, dto);
  }
}
