import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MemberRole } from '@prisma/client';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgRolesGuard } from '../auth/guards/org-roles.guard';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto';

/** Roles que pueden crear reservas y mover su estado. Camarería no. */
const STAFF_ROLES = [
  MemberRole.OWNER,
  MemberRole.MANAGER,
  MemberRole.FRONT_DESK,
] as const;

@ApiTags('Reservas')
@ApiBearerAuth()
@Controller('orgs/:orgId/properties/:propertyId/bookings')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  findAll(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Query() query: ListBookingsQueryDto,
  ) {
    return this.bookings.findAll(orgId, propertyId, query);
  }

  @Get(':bookingId')
  findOne(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookings.findOrThrow(orgId, propertyId, bookingId);
  }

  @Post()
  @Roles(...STAFF_ROLES)
  create(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookings.create(orgId, propertyId, dto);
  }

  @Post(':bookingId/check-in')
  @Roles(...STAFF_ROLES)
  checkIn(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookings.checkIn(orgId, propertyId, bookingId);
  }

  @Post(':bookingId/check-out')
  @Roles(...STAFF_ROLES)
  checkOut(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Param('bookingId') bookingId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Quién hizo el check-out queda en la bitácora de camarería: es el mismo
    // acto que deja la habitación sucia.
    return this.bookings.checkOut(orgId, propertyId, bookingId, user.id);
  }

  @Post(':bookingId/cancel')
  @Roles(...STAFF_ROLES)
  cancel(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookings.cancel(orgId, propertyId, bookingId);
  }

  @Post(':bookingId/no-show')
  @Roles(...STAFF_ROLES)
  noShow(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Param('bookingId') bookingId: string,
  ) {
    return this.bookings.noShow(orgId, propertyId, bookingId);
  }
}
