import { IsString, IsUUID } from 'class-validator';

export class AddGroupMemberDto {
  @IsString()
  @IsUUID()
  userId!: string;
}
