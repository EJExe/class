import { IsDateString, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'axmedm', minLength: 3, maxLength: 50, description: 'Уникальный логин' })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  login!: string;

  @ApiProperty({ example: 'axmedm@inbox.ru', description: 'Email (уникальный)' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Vch543637', minLength: 6, maxLength: 100, description: 'Пароль, минимум 6 символов' })
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password!: string;

  @ApiProperty({ example: 'Ахмед Мамедов', minLength: 3, maxLength: 150, description: 'Полное имя' })
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  fullName!: string;

  @ApiProperty({ example: '2002-05-15', description: 'Дата рождения (ISO 8601)' })
  @IsDateString()
  birthDate!: string;

  @ApiPropertyOptional({ example: 'axmedm', minLength: 2, maxLength: 60, description: 'Отображаемое имя (по умолчанию = логин)' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  nickname?: string;
}
