import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAssignmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsDateString()
  deadlineAt?: string;
}
