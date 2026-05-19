import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'axmedm', minLength: 3, maxLength: 50, description: 'Логин пользователя' })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  login!: string;

  @ApiProperty({ example: 'Vch543637', minLength: 6, maxLength: 100, description: 'Пароль' })
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password!: string;
}
