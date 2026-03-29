import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { hashPassword, verifyPassword } from './password.util';
import { signAuthToken, verifyAuthToken } from './token.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private serializeUser(user: {
    id: string;
    login: string | null;
    email: string | null;
    nickname: string;
    fullName: string | null;
    birthDate: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
    lastSeenAt?: Date;
    avatarPath?: string | null;
  }) {
    return {
      id: user.id,
      login: user.login,
      email: user.email,
      nickname: user.nickname,
      fullName: user.fullName,
      birthDate: user.birthDate,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastSeenAt: user.lastSeenAt,
      avatarUrl: user.avatarPath ? `/api/users/${user.id}/avatar` : null,
    };
  }

  private getAdminLogin() {
    return (process.env.ADMIN_LOGIN ?? 'admin').trim().toLowerCase();
  }

  private getAdminNickname() {
    return (process.env.ADMIN_NICKNAME ?? this.getAdminLogin()).trim();
  }

  private getAdminPassword() {
    return process.env.ADMIN_PASSWORD ?? 'admin123';
  }

  private getAdminEmail() {
    return process.env.ADMIN_EMAIL ?? 'admin@local.dev';
  }

  private getTokenTtlHours() {
    return Number(process.env.SESSION_TTL_HOURS ?? 168);
  }

  private normalizeLogin(login: string) {
    return login.trim().toLowerCase();
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private async ensureAdminUser() {
    const login = this.getAdminLogin();
    const passwordHash = hashPassword(this.getAdminPassword());
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ login }, { nickname: this.getAdminNickname() }],
      },
    });

    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: {
          login,
          email: existing.email ?? this.getAdminEmail(),
          fullName: existing.fullName ?? 'System Administrator',
          nickname: this.getAdminNickname(),
          passwordHash,
        },
      });
    }

    return this.prisma.user.create({
      data: {
        login,
        email: this.getAdminEmail(),
        fullName: 'System Administrator',
        nickname: this.getAdminNickname(),
        passwordHash,
      },
    });
  }

  private async issueToken(user: { id: string; login: string | null; nickname: string }) {
    const ttlHours = this.getTokenTtlHours();
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);
    const sessionId = randomUUID();

    await this.prisma.session.create({
      data: {
        userId: user.id,
        token: sessionId,
        expiresAt,
      },
    });

    const token = signAuthToken(
      {
        sub: user.id,
        sid: sessionId,
        login: user.login ?? user.nickname,
        nickname: user.nickname,
      },
      ttlHours * 3600,
    );

    return { token, expiresAt };
  }

  async register(dto: RegisterDto) {
    const login = this.normalizeLogin(dto.login);
    const email = this.normalizeEmail(dto.email);
    const nickname = (dto.nickname?.trim() || login).trim();

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ login }, { email }, { nickname }],
      },
    });

    if (existing) {
      throw new ConflictException('User with this login, email or display name already exists');
    }

    const user = await this.prisma.user.create({
      data: {
        login,
        email,
        fullName: dto.fullName.trim(),
        birthDate: new Date(dto.birthDate),
        nickname,
        passwordHash: hashPassword(dto.password),
      },
    });

    const session = await this.issueToken(user);

    return {
      token: session.token,
      user: this.serializeUser(user),
      expiresAt: session.expiresAt,
    };
  }

  async login(dto: LoginDto) {
    const login = this.normalizeLogin(dto.login);
    const isAdminLogin = login === this.getAdminLogin();
    const user = isAdminLogin
      ? await this.ensureAdminUser()
      : await this.prisma.user.findUnique({
          where: { login },
        });

    if (!user || !user.passwordHash || !verifyPassword(dto.password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid login or password');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    });

    const session = await this.issueToken(user);

    return {
      token: session.token,
      user: this.serializeUser(user),
      expiresAt: session.expiresAt,
    };
  }

  async deleteSession(jwtToken: string) {
    const payload = verifyAuthToken(jwtToken);
    await this.prisma.session.deleteMany({ where: { token: payload.sid } });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.serializeUser(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const nextLogin = dto.login ? this.normalizeLogin(dto.login) : undefined;
    const nextEmail = dto.email ? this.normalizeEmail(dto.email) : undefined;
    const nextNickname = dto.nickname?.trim();

    if (dto.newPassword && (!dto.currentPassword || !user.passwordHash || !verifyPassword(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is invalid');
    }

    if (nextLogin || nextEmail || nextNickname) {
      const existing = await this.prisma.user.findFirst({
        where: {
          id: { not: userId },
          OR: [
            ...(nextLogin ? [{ login: nextLogin }] : []),
            ...(nextEmail ? [{ email: nextEmail }] : []),
            ...(nextNickname ? [{ nickname: nextNickname }] : []),
          ],
        },
      });

      if (existing) {
        throw new ConflictException('Login, email or display name is already in use');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(nextLogin ? { login: nextLogin } : {}),
        ...(nextEmail ? { email: nextEmail } : {}),
        ...(nextNickname ? { nickname: nextNickname } : {}),
        ...(dto.fullName ? { fullName: dto.fullName.trim() } : {}),
        ...(dto.birthDate ? { birthDate: new Date(dto.birthDate) } : {}),
        ...(dto.newPassword ? { passwordHash: hashPassword(dto.newPassword) } : {}),
      },
    });

    return this.serializeUser(updated);
  }

  async uploadAvatar(userId: string, file: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const stored = await this.storage.saveFile('avatar-files', file);

    if (user.avatarPath) {
      await this.storage.remove(user.avatarPath);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        avatarOriginalName: stored.originalName,
        avatarStoredName: stored.storedName,
        avatarMimeType: stored.mimeType,
        avatarPath: stored.path,
      },
    });

    return this.serializeUser(updated);
  }

  async getAvatar(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        avatarOriginalName: true,
        avatarMimeType: true,
        avatarPath: true,
      },
    });

    if (!user || !user.avatarPath) {
      throw new NotFoundException('Avatar not found');
    }

    return user;
  }
}
