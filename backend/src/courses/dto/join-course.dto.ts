import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class JoinCourseDto {
  @ApiProperty({ example: 'ABC123', minLength: 6, maxLength: 12, description: 'Код-приглашение курса' })
  @IsString({ message: 'Код приглашения должен быть строкой' })
  @Length(6, 12, { message: 'Код приглашения должен содержать от 6 до 12 символов' })
  inviteCode!: string;
}

