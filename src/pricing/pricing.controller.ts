import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MemberRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgRolesGuard } from '../auth/guards/org-roles.guard';
import { CreateRatePlanDto } from './dto/create-rate-plan.dto';
import {
  QuoteQueryDto,
  RateCalendarQueryDto,
} from './dto/date-range-query.dto';
import { UpdateRatePlanDto } from './dto/update-rate-plan.dto';
import { PricingService } from './pricing.service';

@ApiTags('Tarifas · Planes')
@ApiBearerAuth()
@Controller(
  'orgs/:orgId/properties/:propertyId/unit-types/:unitTypeId/rate-plans',
)
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class RatePlansController {
  constructor(private readonly pricing: PricingService) {}

  @Get()
  findAll(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitTypeId') unitTypeId: string,
  ) {
    return this.pricing.findPlans(orgId, propertyId, unitTypeId);
  }

  @Post()
  @Roles(MemberRole.OWNER, MemberRole.MANAGER)
  create(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitTypeId') unitTypeId: string,
    @Body() dto: CreateRatePlanDto,
  ) {
    return this.pricing.createPlan(orgId, propertyId, unitTypeId, dto);
  }

  @Patch(':ratePlanId')
  @Roles(MemberRole.OWNER, MemberRole.MANAGER)
  update(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitTypeId') unitTypeId: string,
    @Param('ratePlanId') ratePlanId: string,
    @Body() dto: UpdateRatePlanDto,
  ) {
    return this.pricing.updatePlan(
      orgId,
      propertyId,
      unitTypeId,
      ratePlanId,
      dto,
    );
  }
}

@ApiTags('Tarifas · Cotización')
@ApiBearerAuth()
@Controller('orgs/:orgId/properties/:propertyId/unit-types/:unitTypeId/quote')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class QuoteController {
  constructor(private readonly pricing: PricingService) {}

  /** Vista previa del desglose sin reservar nada. */
  @Get()
  quote(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitTypeId') unitTypeId: string,
    @Query() query: QuoteQueryDto,
  ) {
    return this.pricing.quote(
      orgId,
      propertyId,
      unitTypeId,
      new Date(query.checkIn),
      new Date(query.checkOut),
    );
  }
}

@ApiTags('Tarifas · Calendario')
@ApiBearerAuth()
@Controller('orgs/:orgId/properties/:propertyId/rate-calendar')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class RateCalendarController {
  constructor(private readonly pricing: PricingService) {}

  /** Precio por tipo de unidad y por fecha. Es lo que dibuja la pantalla de Tarifas. */
  @Get()
  calendar(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Query() query: RateCalendarQueryDto,
  ) {
    return this.pricing.rateCalendar(
      orgId,
      propertyId,
      new Date(query.from),
      new Date(query.to),
    );
  }
}
