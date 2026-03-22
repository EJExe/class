import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AssignmentStatus } from '@prisma/client';

export class UpdateAssignmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsDateString()
  deadlineAt?: string | null;

  @IsOptional()
  @IsEnum(AssignmentStatus)
  status?: AssignmentStatus;
}
