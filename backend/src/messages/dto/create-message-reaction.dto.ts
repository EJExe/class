import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMessageReactionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  emoji!: string;
}
