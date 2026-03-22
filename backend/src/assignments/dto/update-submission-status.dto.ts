import { SubmissionStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateSubmissionStatusDto {
  @IsEnum(SubmissionStatus)
  status!: SubmissionStatus;
}
