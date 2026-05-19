import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMessageReactionDto {
  @ApiProperty({ example: '👍', minLength: 1, maxLength: 32, description: 'Emoji-реакция' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  emoji!: string;
}
