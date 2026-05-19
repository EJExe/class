import { Controller, Get, Patch, Query, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { SessionAuthGuard } from '../common/session-auth.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(SessionAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Список уведомлений (с курсорной пагинацией)' })
  @ApiQuery({ name: 'cursor', required: false, description: 'ID уведомления-курсора' })
  @ApiQuery({ name: 'limit', required: false, description: 'Лимит (по умолчанию 30)' })
  list(
    @CurrentUser() user: { id: string },
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '30',
  ) {
    return this.notificationsService.list(user.id, cursor, Number(limit));
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Отметить уведомление прочитанным' })
  async markRead(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    await this.notificationsService.markRead(user.id, id);
    return { ok: true };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Отметить все уведомления прочитанными' })
  async markAllRead(@CurrentUser() user: { id: string }) {
    await this.notificationsService.markAllRead(user.id);
    return { ok: true };
  }
}
