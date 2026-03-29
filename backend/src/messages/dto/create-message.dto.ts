import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content!: string;
}

