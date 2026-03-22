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

export class CreateChannelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsEnum(ChannelType)
  type!: ChannelType;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  groupIds?: string[];

  @ValidateIf((dto) => dto.type === ChannelType.assignment && dto.assignmentTitle !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  assignmentTitle?: string;

  @ValidateIf((dto) => dto.type === ChannelType.assignment && dto.assignmentDescription !== undefined)
  @IsString()
  @MaxLength(4000)
  assignmentDescription?: string;

  @ValidateIf((dto) => dto.type === ChannelType.assignment && dto.assignmentDeadlineAt !== undefined)
  @IsDateString()
  assignmentDeadlineAt?: string;
}
