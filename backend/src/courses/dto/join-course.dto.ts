import { IsString, Length } from 'class-validator';

export class JoinCourseDto {
  @IsString()
  @Length(6, 12)
  inviteCode!: string;
}

