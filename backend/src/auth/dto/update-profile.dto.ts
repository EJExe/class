import { IsDateString, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'new_login', minLength: 3, maxLength: 50 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  login?: string;

  @ApiPropertyOptional({ example: 'new_email@mail.ru' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'new_nick', minLength: 2, maxLength: 60 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  nickname?: string;

  @ApiPropertyOptional({ example: 'Ахмед Мамедов', minLength: 3, maxLength: 150 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  fullName?: string;

  @ApiPropertyOptional({ example: '2002-05-15' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ example: 'OldPassword123', minLength: 6, maxLength: 100, description: 'Текущий пароль (обязателен при смене пароля)' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  currentPassword?: string;

  @ApiPropertyOptional({ example: 'NewPassword456', minLength: 6, maxLength: 100, description: 'Новый пароль' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  newPassword?: string;
}
