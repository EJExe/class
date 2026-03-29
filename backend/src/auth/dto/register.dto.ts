import { IsDateString, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  login!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(150)
  fullName!: string;

  @IsDateString()
  birthDate!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  nickname?: string;
}
