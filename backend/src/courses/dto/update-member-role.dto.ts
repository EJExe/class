import { CourseRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateMemberRoleDto {
  @IsEnum(CourseRole)
  role!: CourseRole;
}
