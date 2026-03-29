import { Global, Module } from '@nestjs/common';
import { NotificationHubService } from './notification-hub.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationHubService],
  exports: [NotificationsService, NotificationHubService],
})
export class NotificationsModule {}
