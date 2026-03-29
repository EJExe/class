import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { resolve } from 'path';
import { CurrentUser } from '../common/current-user.decorator';
import { SessionAuthGuard } from '../common/session-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private setDownloadHeaders(res: any, file: { avatarOriginalName: string | null; avatarMimeType?: string | null }) {
    const originalName = file.avatarOriginalName || 'avatar';
    const encodedName = encodeURIComponent(originalName);
    const fallbackName = originalName.replace(/[^\x20-\x7E]+/g, '_') || 'avatar';
    res.setHeader('Content-Type', file.avatarMimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
    );
  }

  @Post('auth/register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('auth/login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('session')
  createSession(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Delete('session')
  @UseGuards(SessionAuthGuard)
  async deleteSession(@Req() req: Request) {
    const authHeader = req.header('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      throw new UnauthorizedException('Missing token');
    }
    await this.authService.deleteSession(token);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  me(@CurrentUser() user: { id: string; nickname: string }) {
    return this.authService.me(user.id);
  }

  @Patch('me')
  @UseGuards(SessionAuthGuard)
  updateProfile(@CurrentUser() user: { id: string }, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user.id, dto);
  }

  @Post('me/avatar')
  @UseGuards(SessionAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadAvatar(@CurrentUser() user: { id: string }, @UploadedFile() file: any) {
    return this.authService.uploadAvatar(user.id, file);
  }

  @Get('users/:id/avatar')
  async getAvatar(@Param('id') userId: string, @Res() res: any) {
    const file = await this.authService.getAvatar(userId);
    this.setDownloadHeaders(res, file);
    return res.sendFile(resolve(file.avatarPath!));
  }
}
