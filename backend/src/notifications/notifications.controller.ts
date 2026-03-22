import { Controller, Get, Patch, Query, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { SessionAuthGuard } from '../common/session-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(SessionAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: { id: string },
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '30',
  ) {
    return this.notificationsService.list(user.id, cursor, Number(limit));
  }

  @Patch(':id/read')
  async markRead(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    await this.notificationsService.markRead(user.id, id);
    return { ok: true };
  }

  @Patch('read-all')
  async markAllRead(@CurrentUser() user: { id: string }) {
    await this.notificationsService.markAllRead(user.id);
    return { ok: true };
  }
}
