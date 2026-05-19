import { ChannelType } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateChannelDto {
  @ApiProperty({ example: 'Обсуждения', minLength: 1, maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ example: 'Канал для общих обсуждений', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ enum: ChannelType, example: 'text', description: 'text — обычный чат, assignment — канал с заданием' })
  @IsEnum(ChannelType)
  type!: ChannelType;

  @ApiPropertyOptional({ example: ['uuid-group-1'], description: 'ID групп с доступом к каналу' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  groupIds?: string[];

  @ApiPropertyOptional({ example: 'Лабораторная №1', minLength: 1, maxLength: 120, description: 'Название задания (только для type=assignment)' })
  @ValidateIf((dto) => dto.type === ChannelType.assignment && dto.assignmentTitle !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  assignmentTitle?: string;

  @ApiPropertyOptional({ example: 'Сдать до дедлайна', maxLength: 4000, description: 'Описание задания' })
  @ValidateIf((dto) => dto.type === ChannelType.assignment && dto.assignmentDescription !== undefined)
  @IsString()
  @MaxLength(4000)
  assignmentDescription?: string;

  @ApiPropertyOptional({ example: '2026-06-01T23:59:00Z', description: 'Дедлайн задания' })
  @ValidateIf((dto) => dto.type === ChannelType.assignment && dto.assignmentDeadlineAt !== undefined)
  @IsDateString()
  assignmentDeadlineAt?: string;
}
