import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../common/session-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateCourseDto } from './dto/create-course.dto';
import { JoinCourseDto } from './dto/join-course.dto';
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
  getCourses(@CurrentUser() user: { id: string }) {
    return this.coursesService.getUserCourses(user.id);
  }

  @Get(':id')
  getCourse(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.coursesService.getCourseById(user.id, id);
  }

  @Post('join')
  joinCourse(@CurrentUser() user: { id: string }, @Body() dto: JoinCourseDto) {
    return this.coursesService.joinByInviteCode(user.id, dto.inviteCode);
  }

  @Get(':id/members')
  getMembers(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.coursesService.getMembers(user.id, id);
  }
}

