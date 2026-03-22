import { SubmissionStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class GradeSubmissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  grade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  teacherComment?: string;

  @IsOptional()
  @IsIn([SubmissionStatus.returned_for_revision, SubmissionStatus.reviewed])
  status?: SubmissionStatus;
}
