import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { verifyAuthToken } from '../auth/token.util';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: { id: string; nickname: string; login?: string } }>();
    const authHeader = request.header('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!bearerToken) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload;
    try {
      payload = verifyAuthToken(bearerToken);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const session = await this.prisma.session.findUnique({
      where: { token: payload.sid },
      include: { user: true },
    }).catch(async () => {
      await this.prisma.$connect();
      return this.prisma.session.findUnique({
        where: { token: payload.sid },
        include: { user: true },
      });
    });

    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid session');
    }

    if (session.expiresAt && session.expiresAt < new Date()) {
      throw new UnauthorizedException('Token expired');
    }

    request.user = { id: session.user.id, nickname: session.user.nickname, login: session.user.login ?? undefined };
    return true;
  }
}
