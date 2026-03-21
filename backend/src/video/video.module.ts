import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';

@Module({
  imports: [CommonModule],
  controllers: [VideoController],
  providers: [VideoService],
  exports: [VideoService],
})
export class VideoModule {}

