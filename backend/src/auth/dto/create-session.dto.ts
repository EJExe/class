import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  nickname!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(128)
  password?: string;
}

