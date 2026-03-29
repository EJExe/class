import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { CourseRole } from '@prisma/client';
import { CurrentUser } from '../common/current-user.decorator';
import { SessionAuthGuard } from '../common/session-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@UseGuards(SessionAuthGuard)
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list(@CurrentUser() user: { id: string }, @Query('limit') limit = '100') {
    const adminMemberships = await this.prisma.courseMember.count({
      where: {
        userId: user.id,
        role: CourseRole.admin,
      },
    });

    if (adminMemberships === 0) {
      throw new ForbiddenException('Audit logs are available only for admins');
    }

    return this.auditService.listAll(Number(limit));
  }
}
