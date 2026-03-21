import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: { id: string; nickname: string } }>();
    const authHeader = request.header('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let session = await this.prisma.session.findUnique({
      where: { token },
      include: { user: true },
    }).catch(async () => {
      await this.prisma.$connect();
      return this.prisma.session.findUnique({
        where: { token },
        include: { user: true },
      });
    });

    if (!session) {
      throw new UnauthorizedException('Invalid token');
    }

    if (session.expiresAt && session.expiresAt < new Date()) {
      throw new UnauthorizedException('Token expired');
    }

    request.user = { id: session.user.id, nickname: session.user.nickname };
    return true;
  }
}

