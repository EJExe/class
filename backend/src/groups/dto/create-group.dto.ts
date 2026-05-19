import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateGroupDto {
  @ApiProperty({ example: 'Группа 1', minLength: 1, maxLength: 80, description: 'Название группы' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}
