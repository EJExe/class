import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { SessionAuthGuard } from '../common/session-auth.guard';
import { VideoService } from './video.service';

@Controller()
@UseGuards(SessionAuthGuard)
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Get('courses/:id/video-room')
  getCourseRoom(@CurrentUser() user: { id: string }, @Param('id') courseId: string) {
    return this.videoService.getCourseVideoRoom(user.id, courseId);
  }

  @Get('video-rooms/:id/participants')
  getParticipants(@CurrentUser() user: { id: string }, @Param('id') roomId: string) {
    return this.videoService.getRoomParticipants(user.id, roomId);
  }
}

