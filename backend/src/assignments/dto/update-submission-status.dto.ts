import { SubmissionStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSubmissionStatusDto {
  @ApiProperty({ enum: SubmissionStatus, example: 'submitted', description: 'Новый статус сдачи' })
  @IsEnum(SubmissionStatus)
  status!: SubmissionStatus;
}
