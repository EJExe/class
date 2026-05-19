import { SubmissionStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GradeSubmissionDto {
  @ApiPropertyOptional({ example: '5', maxLength: 50, description: 'Оценка (строка, например "5" или "зачёт")' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  grade?: string;

  @ApiPropertyOptional({ example: 'Отличная работа!', maxLength: 4000, description: 'Комментарий преподавателя' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  teacherComment?: string;

  @ApiPropertyOptional({ enum: [SubmissionStatus.returned_for_revision, SubmissionStatus.reviewed], example: 'reviewed', description: 'reviewed — принято, returned_for_revision — на доработку' })
  @IsOptional()
  @IsIn([SubmissionStatus.returned_for_revision, SubmissionStatus.reviewed])
  status?: SubmissionStatus;
}
