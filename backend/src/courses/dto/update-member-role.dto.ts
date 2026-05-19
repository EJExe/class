import { CourseRole } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: CourseRole, example: 'teacher', description: 'Новая роль участника' })
  @IsEnum(CourseRole)
  role!: CourseRole;
}
