import { Body, Controller, Delete, Get, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../common/current-user.decorator';
import { SessionAuthGuard } from '../common/session-auth.guard';
import { CreateSessionDto } from './dto/create-session.dto';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('session')
  createSession(@Body() dto: CreateSessionDto) {
    return this.authService.createSession(dto);
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
}

