import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  PublicAvailabilityQueryDto,
  PublicBookingDto,
} from './dto/public-booking.dto';
import { PublicService } from './public.service';

/**
 * La cara pública de la API: lo que consume el sitio del huésped.
 *
 * **Sin guards de autenticación, a propósito.** Es el único rincón del sistema
 * sin `JwtAuthGuard`, y por eso todo lo demás acá está pensado con eso en
 * mente:
 *
 *  - devuelve tipos de habitación, nunca unidades físicas ni cuántas quedan;
 *  - el precio lo calcula el servidor, jamás llega del cliente;
 *  - las reservas entran en `PENDING` con vencimiento, no confirmadas;
 *  - todo está limitado por IP, porque un endpoint público sin límite es una
 *    forma de llenarle la base a alguien.
 *
 * El alojamiento se direcciona por slug y no por UUID: son URLs que terminan
 * en el sitio público, y un UUID ahí no le sirve a nadie.
 */
/**
 * Reservas por hora y por IP.
 *
 * Configurable porque el valor bueno depende del entorno: en producción cinco
 * por hora es de sobra para una familia decidiendo y poco para un script, pero
 * en desarrollo esa misma cuota se agota probando el formulario tres veces y
 * deja el flujo intestable. Un límite que obliga a editar código para trabajar
 * termina puesto en un número inútilmente alto.
 */
const BOOKING_LIMIT = Number(process.env.PUBLIC_BOOKING_LIMIT_PER_HOUR ?? 5);

@ApiTags('Público')
@Controller('public/orgs/:orgSlug/properties/:propertySlug')
export class PublicController {
  constructor(private readonly service: PublicService) {}

  @Get()
  property(
    @Param('orgSlug') orgSlug: string,
    @Param('propertySlug') propertySlug: string,
  ) {
    return this.service.property(orgSlug, propertySlug);
  }

  /** Consultar fechas es barato, pero no gratis: 30 por minuto por IP. */
  @Get('availability')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  availability(
    @Param('orgSlug') orgSlug: string,
    @Param('propertySlug') propertySlug: string,
    @Query() query: PublicAvailabilityQueryDto,
  ) {
    return this.service.availability(
      orgSlug,
      propertySlug,
      query.checkIn,
      query.checkOut,
      query.guests ?? 1,
    );
  }

  /**
   * Crear reservas es caro: cada una retiene una habitación real durante 48
   * horas.
   */
  @Post('bookings')
  @Throttle({ default: { limit: BOOKING_LIMIT, ttl: 3_600_000 } })
  book(
    @Param('orgSlug') orgSlug: string,
    @Param('propertySlug') propertySlug: string,
    @Body() dto: PublicBookingDto,
  ) {
    return this.service.book(orgSlug, propertySlug, dto);
  }
}
