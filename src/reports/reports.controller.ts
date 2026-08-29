import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MemberRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgRolesGuard } from '../auth/guards/org-roles.guard';
import { ReportRangeQueryDto } from './dto/report-range.dto';
import { ReportsService } from './reports.service';

@ApiTags('Reportes')
@ApiBearerAuth()
@Controller('orgs/:orgId/properties/:propertyId/reports')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /**
   * Ingreso, ocupación, ADR y RevPAR del período.
   *
   * Restringido a OWNER y MANAGER: es el ingreso del hotel. Recepción y
   * camarería no tienen por qué verlo para hacer su trabajo, y el que no se
   * muestra no se filtra.
   */
  @Get('performance')
  @Roles(MemberRole.OWNER, MemberRole.MANAGER)
  performance(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Query() query: ReportRangeQueryDto,
  ) {
    return this.reports.performance(orgId, propertyId, query.from, query.to);
  }
}
