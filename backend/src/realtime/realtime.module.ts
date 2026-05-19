import { forwardRef, Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { CommonModule } from '../common/common.module';
import { MessagesModule } from '../messages/messages.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [CommonModule, forwardRef(() => MessagesModule), AssignmentsModule],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}

