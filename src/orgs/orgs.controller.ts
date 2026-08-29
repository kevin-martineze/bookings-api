import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MemberRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgRolesGuard } from '../auth/guards/org-roles.guard';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Organización')
@ApiBearerAuth()
@Controller('orgs')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class OrgsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':orgId/members')
  @Roles(MemberRole.OWNER, MemberRole.MANAGER)
  async members(@Param('orgId') orgId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { orgId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((m) => ({
      userId: m.userId,
      name: m.user.fullName ?? m.user.email,
      email: m.user.email,
      role: m.role,
    }));
  }
}
