import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { createHash, randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private hashPassword(password: string) {
    return createHash('sha256').update(password).digest('hex');
  }

  async createSession(dto: CreateSessionDto) {
    const nickname = dto.nickname.trim();
    const passwordHash = dto.password ? this.hashPassword(dto.password) : null;

    let user = await this.prisma.user.findUnique({ where: { nickname } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          nickname,
          passwordHash,
        },
      });
    } else if (user.passwordHash) {
      if (!dto.password) {
        throw new UnauthorizedException('Password required');
      }
      if (user.passwordHash !== passwordHash) {
        throw new UnauthorizedException('Invalid password');
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    });

    const ttlHours = Number(process.env.SESSION_TTL_HOURS ?? 168);
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        token: randomUUID(),
        expiresAt,
      },
    });

    return {
      token: session.token,
      user: {
        id: user.id,
        nickname: user.nickname,
      },
      expiresAt,
    };
  }

  async deleteSession(token: string) {
    await this.prisma.session.deleteMany({ where: { token } });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      nickname: user.nickname,
      createdAt: user.createdAt,
      lastSeenAt: user.lastSeenAt,
    };
  }
}

