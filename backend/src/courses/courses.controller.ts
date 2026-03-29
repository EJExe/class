import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { SessionAuthGuard } from '../common/session-auth.guard';
import { CreateGroupDto } from '../groups/dto/create-group.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { JoinCourseDto } from './dto/join-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { CoursesService } from './courses.service';

@Controller('courses')
@UseGuards(SessionAuthGuard)
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Post()
  createCourse(@CurrentUser() user: { id: string }, @Body() dto: CreateCourseDto) {
    return this.coursesService.createCourse(user.id, dto);
  }

  @Get()
  getCourses(@CurrentUser() user: { id: string }, @Query('q') q?: string) {
    return this.coursesService.getUserCourses(user.id, q?.trim() || undefined);
  }

  @Get(':id')
  getCourse(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.coursesService.getCourseById(user.id, id);
  }

  @Get(':id/export')
  async exportCourse(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Res() res: any,
  ) {
    const csv = await this.coursesService.exportCourseCsv(user.id, id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="course-${id}.csv"`);
    return res.send('\uFEFF' + csv);
  }

  @Patch(':id')
  updateCourse(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.coursesService.updateCourse(user.id, id, dto);
  }

  @Post('join')
  joinCourse(@CurrentUser() user: { id: string }, @Body() dto: JoinCourseDto) {
    return this.coursesService.joinByInviteCode(user.id, dto.inviteCode);
  }

  @Get(':id/members')
  getMembers(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.coursesService.getMembers(user.id, id);
  }

  @Patch(':id/members/:userId/role')
  updateRole(
    @CurrentUser() user: { id: string },
    @Param('id') courseId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.coursesService.updateMemberRole(user.id, courseId, targetUserId, dto.role);
  }

  @Get(':id/roles')
  getRoles(@CurrentUser() user: { id: string }, @Param('id') courseId: string) {
    return this.coursesService.getRoles(user.id, courseId);
  }

  @Post(':id/groups')
  createGroup(
    @CurrentUser() user: { id: string },
    @Param('id') courseId: string,
    @Body() dto: CreateGroupDto,
  ) {
    return this.coursesService.createGroup(user.id, courseId, dto);
  }

  @Get(':id/groups')
  listGroups(@CurrentUser() user: { id: string }, @Param('id') courseId: string) {
    return this.coursesService.listGroups(user.id, courseId);
  }

}
