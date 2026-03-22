import { Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { SessionAuthGuard } from '../common/session-auth.guard';
import { CoursesService } from '../courses/courses.service';
import { AddGroupMemberDto } from './dto/add-group-member.dto';

@Controller('groups')
@UseGuards(SessionAuthGuard)
export class GroupsController {
  constructor(private readonly coursesService: CoursesService) {}

  @Post(':id/members')
  addMember(
    @CurrentUser() user: { id: string },
    @Param('id') groupId: string,
    @Body() dto: AddGroupMemberDto,
  ) {
    return this.coursesService.addGroupMember(user.id, groupId, dto.userId);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @CurrentUser() user: { id: string },
    @Param('id') groupId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.coursesService.removeGroupMember(user.id, groupId, targetUserId);
  }
}
