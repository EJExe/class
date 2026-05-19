import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { SessionAuthGuard } from '../common/session-auth.guard';
import { CreateGroupDto } from '../groups/dto/create-group.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { JoinCourseDto } from './dto/join-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { CoursesService } from './courses.service';

@ApiTags('Courses')
@ApiBearerAuth()
@Controller('courses')
@UseGuards(SessionAuthGuard)
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Post()
  @ApiOperation({ summary: '\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u043D\u043E\u0432\u044B\u0439 \u043A\u0443\u0440\u0441' })
  @ApiResponse({ status: 201, description: '\u041A\u0443\u0440\u0441 \u0441\u043E\u0437\u0434\u0430\u043D (\u0441\u043E\u0437\u0434\u0430\u0442\u0435\u043B\u044C = admin)' })
  createCourse(@CurrentUser() user: { id: string }, @Body() dto: CreateCourseDto) {
    return this.coursesService.createCourse(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: '\u0421\u043F\u0438\u0441\u043E\u043A \u043A\u0443\u0440\u0441\u043E\u0432 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F' })
  @ApiQuery({ name: 'q', required: false, description: '\u041F\u043E\u0438\u0441\u043A \u043F\u043E \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u044E' })
  @ApiQuery({ name: 'page', required: false, description: '\u041D\u043E\u043C\u0435\u0440 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B (\u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E 1)' })
  @ApiQuery({ name: 'limit', required: false, description: '\u0420\u0430\u0437\u043C\u0435\u0440 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u044B (\u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E 20)' })
  getCourses(
    @CurrentUser() user: { id: string },
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.coursesService.getUserCourses(
      user.id,
      q?.trim() || undefined,
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: '\u0414\u0435\u0442\u0430\u043B\u0438 \u043A\u0443\u0440\u0441\u0430 \u043F\u043E ID' })
  getCourse(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.coursesService.getCourseById(user.id, id);
  }

  @Get(':id/export')
  @ApiOperation({ summary: '\u042D\u043A\u0441\u043F\u043E\u0440\u0442 \u043A\u0443\u0440\u0441\u0430 \u0432 CSV' })
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
  @ApiOperation({ summary: '\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435/\u043E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043A\u0443\u0440\u0441\u0430' })
  updateCourse(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.coursesService.updateCourse(user.id, id, dto);
  }

  @Post('join')
  @ApiOperation({ summary: '\u041F\u0440\u0438\u0441\u043E\u0435\u0434\u0438\u043D\u0438\u0442\u044C\u0441\u044F \u043A \u043A\u0443\u0440\u0441\u0443 \u043F\u043E \u043A\u043E\u0434\u0443-\u043F\u0440\u0438\u0433\u043B\u0430\u0448\u0435\u043D\u0438\u044E' })
  @ApiResponse({ status: 201, description: '\u0423\u0441\u043F\u0435\u0448\u043D\u043E\u0435 \u043F\u0440\u0438\u0441\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435' })
  @ApiResponse({ status: 404, description: '\u041A\u0443\u0440\u0441 \u0441 \u0442\u0430\u043A\u0438\u043C \u043A\u043E\u0434\u043E\u043C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D' })
  @ApiResponse({ status: 409, description: '\u0423\u0436\u0435 \u0441\u043E\u0441\u0442\u043E\u0438\u0442\u0435 \u0432 \u044D\u0442\u043E\u043C \u043A\u0443\u0440\u0441\u0435' })
  joinCourse(@CurrentUser() user: { id: string }, @Body() dto: JoinCourseDto) {
    return this.coursesService.joinByInviteCode(user.id, dto.inviteCode);
  }

  @Get(':id/members')
  @ApiOperation({ summary: '\u0421\u043F\u0438\u0441\u043E\u043A \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432 \u043A\u0443\u0440\u0441\u0430' })
  getMembers(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.coursesService.getMembers(user.id, id);
  }

  @Patch(':id/members/:userId/role')
  @ApiOperation({ summary: '\u0418\u0437\u043C\u0435\u043D\u0438\u0442\u044C \u0440\u043E\u043B\u044C \u0443\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u0430 (admin/teacher/assistant/student)' })
  updateRole(
    @CurrentUser() user: { id: string },
    @Param('id') courseId: string,
    @Param('userId') targetUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.coursesService.updateMemberRole(user.id, courseId, targetUserId, dto.role);
  }

  @Get(':id/roles')
  @ApiOperation({ summary: '\u041F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u0441\u0432\u043E\u044E \u0440\u043E\u043B\u044C \u0438 \u043F\u0440\u0430\u0432\u0430 \u0432 \u043A\u0443\u0440\u0441\u0435' })
  getRoles(@CurrentUser() user: { id: string }, @Param('id') courseId: string) {
    return this.coursesService.getRoles(user.id, courseId);
  }

  @Post(':id/groups')
  @ApiOperation({ summary: '\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0433\u0440\u0443\u043F\u043F\u0443 \u0441\u0442\u0443\u0434\u0435\u043D\u0442\u043E\u0432 \u0432 \u043A\u0443\u0440\u0441\u0435' })
  createGroup(
    @CurrentUser() user: { id: string },
    @Param('id') courseId: string,
    @Body() dto: CreateGroupDto,
  ) {
    return this.coursesService.createGroup(user.id, courseId, dto);
  }

  @Get(':id/groups')
  @ApiOperation({ summary: '\u0421\u043F\u0438\u0441\u043E\u043A \u0433\u0440\u0443\u043F\u043F \u043A\u0443\u0440\u0441\u0430' })
  listGroups(@CurrentUser() user: { id: string }, @Param('id') courseId: string) {
    return this.coursesService.listGroups(user.id, courseId);
  }

  @Delete(':id')
  @ApiOperation({ summary: '\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u043A\u0443\u0440\u0441 (\u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044F \u0438\u043B\u0438 \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430)' })
  @ApiResponse({ status: 200, description: '\u041A\u0443\u0440\u0441 \u0443\u0434\u0430\u043B\u0451\u043D' })
  deleteCourse(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.coursesService.deleteCourse(user.id, id);
  }

  @Delete(':id/leave')
  @ApiOperation({ summary: '\u041F\u043E\u043A\u0438\u043D\u0443\u0442\u044C \u043A\u0443\u0440\u0441' })
  @ApiResponse({ status: 200, description: '\u0412\u044B \u0432\u044B\u0448\u043B\u0438 \u0438\u0437 \u043A\u0443\u0440\u0441\u0430' })
  leaveCourse(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.coursesService.leaveCourse(user.id, id);
  }

}
