import { Module } from '@nestjs/common';
import { CoursesModule } from '../courses/courses.module';
import { GroupsController } from './groups.controller';

@Module({
  imports: [CoursesModule],
  controllers: [GroupsController],
})
export class GroupsModule {}
