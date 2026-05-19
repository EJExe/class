import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSubmissionFileCommentDto {
  @ApiProperty({ example: 'Здесь ошибка в строке 42', minLength: 1, maxLength: 4000, description: 'Комментарий к файлу сдачи' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;
}
