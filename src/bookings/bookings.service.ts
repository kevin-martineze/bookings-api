import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingSource, BookingStatus } from '@prisma/client';
import { PropertiesService } from '../catalog/properties.service';
import { UnitTypesService } from '../catalog/unit-types.service';
import { HousekeepingService } from '../housekeeping/housekeeping.service';
import { PricingService } from '../pricing/pricing.service';
import {
  isOverlapConflict,
  isUniqueViolation,
  PrismaService,
} from '../prisma/prisma.service';
import { assertTransition, generateReference } from './bookings.util';
import type { CreateBookingDto } from './dto/create-booking.dto';
import type { UpdateBookingDto } from './dto/update-booking.dto';

const MAX_REFERENCE_ATTEMPTS = 3;

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
    private readonly unitTypes: UnitTypesService,
    private readonly pricing: PricingService,
    private readonly housekeeping: HousekeepingService,
  ) {}

  /**
   * El panel necesita el nombre del huésped y el número de habitación, no los
   * IDs: un calendario que muestra `bde8989f-…` en vez de "101" no sirve.
   */
  private static readonly DETAIL_INCLUDE = {
    guest: true,
    unit: true,
    unitType: true,
  } as const;

  async findAll(
    orgId: string,
    propertyId: string,
    filters: { status?: BookingStatus; from?: string; to?: string } = {},
  ) {
    await this.properties.findOrThrow(orgId, propertyId);

    /* Rango con la misma semántica `[)` que el resto del sistema: entran las
       estadías que se solapan con la ventana pedida, no solo las que empiezan
       dentro. Una reserva que arrancó antes y sigue en curso tiene que
       aparecer en el calendario. */
    const { from, to } = filters;
    const overlapsWindow = {
      ...(to ? { checkIn: { lt: new Date(to) } } : {}),
      ...(from ? { checkOut: { gt: new Date(from) } } : {}),
    };

    return this.prisma.booking.findMany({
      where: {
        propertyId,
        ...(filters.status ? { status: filters.status } : {}),
        ...overlapsWindow,
      },
      include: BookingsService.DETAIL_INCLUDE,
      orderBy: { checkIn: 'asc' },
    });
  }

  async findOrThrow(orgId: string, propertyId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, propertyId, orgId },
      include: BookingsService.DETAIL_INCLUDE,
    });
    if (!booking) throw new NotFoundException('Reserva no encontrada.');
    return booking;
  }

  async checkAvailability(
    orgId: string,
    propertyId: string,
    unitTypeId: string,
    checkInStr: string,
    checkOutStr: string,
  ) {
    await this.unitTypes.findOrThrow(orgId, propertyId, unitTypeId);
    const { checkIn, checkOut } = this.parseRange(checkInStr, checkOutStr);

    const { units, free } = await this.findFreeUnits(
      unitTypeId,
      checkIn,
      checkOut,
    );
    return {
      unitsTotal: units.length,
      unitsAvailable: free.length,
      available: free.length > 0,
    };
  }

  async create(orgId: string, propertyId: string, dto: CreateBookingDto) {
    const property = await this.properties.findOrThrow(orgId, propertyId);
    const unitType = await this.unitTypes.findOrThrow(
      orgId,
      propertyId,
      dto.unitTypeId,
    );

    const guests = dto.guests ?? 1;
    if (guests > unitType.maxGuests) {
      throw new BadRequestException(
        `Esta unidad admite hasta ${unitType.maxGuests} huéspedes.`,
      );
    }

    const { checkIn, checkOut } = this.parseRange(dto.checkIn, dto.checkOut);

    /* El precio sale del motor, no de `base × noches`: aplica temporadas y
       recargo de fin de semana, suma el impuesto, y hace cumplir la estadía
       mínima y los cierres de venta. Si esas fechas no son vendibles, lanza
       antes de tocar el inventario. */
    const quote = await this.pricing.quote(
      orgId,
      propertyId,
      unitType.id,
      checkIn,
      checkOut,
    );

    const { free } = await this.findFreeUnits(unitType.id, checkIn, checkOut);
    if (free.length === 0) {
      throw new ConflictException(
        'No hay unidades disponibles para esas fechas.',
      );
    }
    const unit = free[0];

    const guest = await this.findOrCreateGuest(orgId, dto);

    for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.booking.create({
          data: {
            orgId,
            propertyId,
            unitTypeId: unitType.id,
            unitId: unit.id,
            guestId: guest.id,
            reference: generateReference(),
            checkIn,
            checkOut,
            guests,
            status: BookingStatus.CONFIRMED,
            source: BookingSource.STAFF,
            /* El desglose se congela acá. Las tarifas cambian; una reserva ya
               tomada tiene que seguir cuadrando con lo que se le cobró al
               huésped. La base además verifica que total = subtotal + impuesto
               + cargos con una restricción CHECK. */
            subtotalMinor: quote.subtotalMinor,
            taxMinor: quote.taxMinor,
            feesMinor: 0,
            totalMinor: quote.totalMinor,
            currency: property.currency,
            guestNotes: dto.guestNotes,
          },
        });
      } catch (error) {
        if (isOverlapConflict(error)) {
          throw new ConflictException(
            'La unidad se reservó justo ahora. Intentá de nuevo.',
          );
        }
        // Único campo `@unique` en Booking es `reference` — cualquier otro
        // choque de unicidad acá sería un bug, no un caso a reintentar.
        if (isUniqueViolation(error) && attempt < MAX_REFERENCE_ATTEMPTS - 1) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException(
      'No se pudo generar una referencia única. Intentá de nuevo.',
    );
  }

  /**
   * Modifica una reserva ya tomada: fechas, huéspedes, habitación o notas.
   *
   * Hasta ahora sólo existían las transiciones de estado, así que "el huésped
   * llama y extiende una noche" —que pasa todos los días— obligaba a cancelar y
   * volver a cargar. Eso pierde la referencia que el huésped ya tiene y borra
   * el precio con el que se le vendió.
   *
   * Tres reglas:
   *
   *  - **Recotiza siempre que cambien las fechas.** El precio nuevo sale del
   *    motor, no de lo que había: extender una noche a un viernes cuesta lo que
   *    cuesta ese viernes.
   *  - **No toca reservas cerradas.** Una estadía que ya terminó o se canceló
   *    es un hecho histórico.
   *  - **La restricción de exclusión sigue mandando.** Si las fechas nuevas
   *    chocan con otra reserva de esa habitación, la base rechaza el UPDATE
   *    igual que rechazaría un INSERT.
   */
  async update(
    orgId: string,
    propertyId: string,
    bookingId: string,
    dto: UpdateBookingDto,
  ) {
    const booking = await this.findOrThrow(orgId, propertyId, bookingId);

    const CLOSED: BookingStatus[] = [
      BookingStatus.CHECKED_OUT,
      BookingStatus.CANCELLED,
      BookingStatus.NO_SHOW,
    ];
    if (CLOSED.includes(booking.status)) {
      throw new BadRequestException(
        'Esta reserva ya está cerrada y no se puede modificar.',
      );
    }

    const checkInStr = dto.checkIn ?? toDateKey(booking.checkIn);
    const checkOutStr = dto.checkOut ?? toDateKey(booking.checkOut);
    const datesChanged =
      checkInStr !== toDateKey(booking.checkIn) ||
      checkOutStr !== toDateKey(booking.checkOut);

    const { checkIn, checkOut } = this.parseRange(checkInStr, checkOutStr);

    /* Mover de habitación puede cambiar el tipo, y el tipo es lo que fija el
       precio y el máximo de huéspedes. */
    let unitId = booking.unitId;
    let unitTypeId = booking.unitTypeId;
    if (dto.unitId && dto.unitId !== booking.unitId) {
      const unit = await this.prisma.unit.findFirst({
        where: { id: dto.unitId, propertyId, orgId },
      });
      if (!unit) throw new BadRequestException('Esa habitación no existe acá.');
      if (!unit.active) {
        throw new BadRequestException('Esa habitación está fuera de servicio.');
      }
      unitId = unit.id;
      unitTypeId = unit.unitTypeId;
    }

    const unitType = await this.unitTypes.findOrThrow(
      orgId,
      propertyId,
      unitTypeId,
    );

    const guests = dto.guests ?? booking.guests;
    if (guests > unitType.maxGuests) {
      throw new BadRequestException(
        `Esta unidad admite hasta ${unitType.maxGuests} huéspedes.`,
      );
    }

    /* Si cambian las fechas o el tipo, se recotiza. Si sólo se corrigió una
       nota o la cantidad de huéspedes dentro del mismo tipo, el precio
       acordado se respeta: recotizar ahí le cambiaría el total a alguien por
       haber escrito una observación. */
    const needsRequote = datesChanged || unitTypeId !== booking.unitTypeId;
    const quote = needsRequote
      ? await this.pricing.quote(orgId, propertyId, unitTypeId, checkIn, checkOut)
      : null;

    try {
      return await this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          checkIn,
          checkOut,
          guests,
          unitId,
          unitTypeId,
          ...(dto.guestNotes !== undefined ? { guestNotes: dto.guestNotes } : {}),
          ...(quote
            ? {
                subtotalMinor: quote.subtotalMinor,
                taxMinor: quote.taxMinor,
                totalMinor: quote.totalMinor,
              }
            : {}),
        },
        include: BookingsService.DETAIL_INCLUDE,
      });
    } catch (error) {
      if (isOverlapConflict(error)) {
        throw new ConflictException(
          'Esas fechas chocan con otra reserva de esa habitación.',
        );
      }
      throw error;
    }
  }

  /**
   * Confirma una reserva pendiente.
   *
   * Es el paso que faltaba desde que el sitio del huésped puede reservar: una
   * reserva directa entra en `PENDING` con una retención, y sin esto quedaría
   * atascada — el personal podía cancelarla pero no aceptarla.
   *
   * Al confirmar se limpia `holdExpiresAt`: la retención existe para que una
   * reserva sin confirmar no bloquee el inventario para siempre, y una vez
   * confirmada ya no vence.
   */
  async confirm(orgId: string, propertyId: string, bookingId: string) {
    const booking = await this.findOrThrow(orgId, propertyId, bookingId);
    assertTransition(booking.status, BookingStatus.CONFIRMED);
    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CONFIRMED, holdExpiresAt: null },
    });
  }

  async checkIn(orgId: string, propertyId: string, bookingId: string) {
    return this.transition(
      orgId,
      propertyId,
      bookingId,
      BookingStatus.CHECKED_IN,
    );
  }

  /**
   * El check-out cierra la estadía y deja la habitación sucia, en la misma
   * transacción.
   *
   * Es la única automatización de camarería, y evita el error más caro de
   * recepción: vender una habitación que nadie limpió. Va junto porque son un
   * solo hecho — si el estado de la reserva cambiara y el de la unidad no, el
   * sistema afirmaría que la habitación está limpia porque falló un UPDATE.
   */
  async checkOut(
    orgId: string,
    propertyId: string,
    bookingId: string,
    actorId: string,
  ) {
    const booking = await this.findOrThrow(orgId, propertyId, bookingId);
    assertTransition(booking.status, BookingStatus.CHECKED_OUT);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.CHECKED_OUT },
      });
      await this.housekeeping.markDirtyAfterCheckOut(tx, booking.unit, actorId);
      return updated;
    });
  }

  async noShow(orgId: string, propertyId: string, bookingId: string) {
    return this.transition(orgId, propertyId, bookingId, BookingStatus.NO_SHOW);
  }

  async cancel(orgId: string, propertyId: string, bookingId: string) {
    const booking = await this.findOrThrow(orgId, propertyId, bookingId);
    assertTransition(booking.status, BookingStatus.CANCELLED);
    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CANCELLED, cancelledAt: new Date() },
    });
  }

  private async transition(
    orgId: string,
    propertyId: string,
    bookingId: string,
    next: BookingStatus,
  ) {
    const booking = await this.findOrThrow(orgId, propertyId, bookingId);
    assertTransition(booking.status, next);
    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: next },
    });
  }

  private parseRange(checkInStr: string, checkOutStr: string) {
    const checkIn = new Date(checkInStr);
    const checkOut = new Date(checkOutStr);
    if (!(checkOut > checkIn)) {
      throw new BadRequestException('checkOut debe ser posterior a checkIn.');
    }
    return { checkIn, checkOut };
  }

  /**
   * Unidades activas del tipo menos las que tienen una reserva no
   * cancelada/no-show que se solapa. El solapamiento usa la misma semántica
   * `[)` que el exclusion constraint de la base
   * (`checkIn < otroCheckOut && otroCheckIn < checkOut`), expresada acá con
   * el query builder de Prisma en vez de SQL crudo.
   */
  private async findFreeUnits(
    unitTypeId: string,
    checkIn: Date,
    checkOut: Date,
  ) {
    const units = await this.prisma.unit.findMany({
      where: { unitTypeId, active: true },
    });
    if (units.length === 0) return { units, free: [] };

    const conflicting = await this.prisma.booking.findMany({
      where: {
        unitId: { in: units.map((u) => u.id) },
        status: { notIn: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
        checkIn: { lt: checkOut },
        checkOut: { gt: checkIn },
      },
      select: { unitId: true },
    });
    const takenIds = new Set(conflicting.map((b) => b.unitId));
    const free = units.filter((u) => !takenIds.has(u.id));
    return { units, free };
  }

  private async findOrCreateGuest(orgId: string, dto: CreateBookingDto) {
    const email = dto.guestEmail.toLowerCase().trim();
    return this.prisma.guest.upsert({
      where: { orgId_email: { orgId, email } },
      update: { fullName: dto.guestFullName, phone: dto.guestPhone },
      create: {
        orgId,
        email,
        fullName: dto.guestFullName,
        phone: dto.guestPhone,
      },
    });
  }
}

/**
 * Fecha calendario de un `@db.Date`, en UTC.
 *
 * Comparar `Date` contra `Date` para saber si el usuario cambió la fecha da
 * falsos positivos por milisegundos y husos; comparar las cadenas del día es lo
 * único que responde la pregunta que importa.
 */
function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
