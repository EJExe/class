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
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { resolve } from 'path';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { SessionAuthGuard } from '../common/session-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('Auth')
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('auth/register')
  @ApiOperation({ summary: 'Регистрация нового пользователя' })
  @ApiResponse({ status: 201, description: 'Успешная регистрация — возвращает токен и профиль' })
  @ApiResponse({ status: 400, description: 'Ошибка валидации полей' })
  @ApiResponse({ status: 409, description: 'Логин, email или nickname уже заняты' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('auth/login')
  @ApiOperation({ summary: 'Вход в систему' })
  @ApiResponse({ status: 201, description: 'Успешный вход — возвращает токен и профиль' })
  @ApiResponse({ status: 400, description: 'Ошибка валидации полей' })
  @ApiResponse({ status: 401, description: 'Неверный логин или пароль' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('session')
  @ApiOperation({ summary: 'Создать сессию (аналог входа)' })
  createSession(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Delete('session')
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Выход — удаление текущей сессии' })
  @ApiResponse({ status: 200, description: 'Сессия удалена' })
  @ApiResponse({ status: 401, description: 'Токен отсутствует или недействителен' })
  async deleteSession(@Req() req: Request) {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      throw new UnauthorizedException('Missing token');
    }
    await this.authService.deleteSession(token);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить профиль текущего пользователя' })
  @ApiResponse({ status: 200, description: 'Профиль пользователя' })
  @ApiResponse({ status: 401, description: 'Токен отсутствует или истёк' })
  me(@CurrentUser() user: { id: string; nickname: string }) {
    return this.authService.me(user.id);
  }

  @Patch('me')
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Обновить профиль (имя, email, пароль и т.д.)' })
  @ApiResponse({ status: 200, description: 'Профиль обновлён' })
  @ApiResponse({ status: 401, description: 'Текущий пароль неверен (при смене пароля)' })
  @ApiResponse({ status: 409, description: 'Новый логин/email/nickname уже занят' })
  updateProfile(@CurrentUser() user: { id: string }, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(user.id, dto);
  }

  @Post('me/avatar')
  @UseGuards(SessionAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Загрузить аватар' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  uploadAvatar(@CurrentUser() user: { id: string }, @UploadedFile() file: any) {
    return this.authService.uploadAvatar(user.id, file);
  }

  @Get('users/:id/avatar')
  @ApiOperation({ summary: 'Получить аватар пользователя по ID' })
  async getAvatar(@Param('id') userId: string, @Res() res: any) {
    const file = await this.authService.getAvatar(userId);
    this.setDownloadHeaders(res, file);
    return res.sendFile(resolve(file.avatarPath!));
  }

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
}
