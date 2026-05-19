import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMessageDto {
  @ApiPropertyOptional({ example: 'Привет, группа!', maxLength: 4000, description: 'Текст сообщения (может быть пустым при отправке файлов)' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content!: string;
}

