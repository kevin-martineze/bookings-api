import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgRolesGuard } from '../auth/guards/org-roles.guard';
import { BookingsService } from './bookings.service';
import { AvailabilityQueryDto } from './dto/availability-query.dto';

/**
 * El motor de disponibilidad en sí. Vive junto a `bookings` (no en catálogo)
 * porque reusa exactamente la misma consulta que `BookingsService.create()`
 * usa para elegir unidad — un solo lugar de verdad para "qué está libre".
 */
@ApiTags('Disponibilidad')
@ApiBearerAuth()
@Controller(
  'orgs/:orgId/properties/:propertyId/unit-types/:unitTypeId/availability',
)
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class AvailabilityController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  check(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitTypeId') unitTypeId: string,
    @Query() query: AvailabilityQueryDto,
  ) {
    return this.bookings.checkAvailability(
      orgId,
      propertyId,
      unitTypeId,
      query.checkIn,
      query.checkOut,
    );
  }
}
