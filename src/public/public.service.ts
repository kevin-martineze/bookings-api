import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingSource, BookingStatus } from '@prisma/client';
import { isOverlapConflict, PrismaService } from '../prisma/prisma.service';
import { generateReference } from '../bookings/bookings.util';
import { MailService } from '../mail/mail.service';
import { bookingRequested } from '../mail/mail.templates';
import { PricingService } from '../pricing/pricing.service';
import type { PublicBookingDto } from './dto/public-booking.dto';

/**
 * Cuánto vive una reserva del sitio sin que el hotel la confirme.
 *
 * Existe porque una reserva `PENDING` **retiene inventario de verdad** — la
 * restricción de exclusión de la base la cuenta igual que una confirmada. Sin
 * vencimiento, un formulario dejado a medias bloquea una habitación para
 * siempre, y no hace falta mala intención para que pase.
 */
const HOLD_HOURS = 48;

/**
 * Tope de noches de una reserva pública. No es una regla de negocio del hotel:
 * es un freno a que alguien pida una estadía de dos años y bloquee una
 * habitación entera con una sola petición.
 */
const MAX_PUBLIC_NIGHTS = 30;

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly mail: MailService,
  ) {}

  /**
   * Alojamiento y tipos vendibles.
   *
   * Devuelve tipos, **nunca unidades**. Cuántas habitaciones físicas hay y
   * cuáles están libres es información de operación: le dice a cualquiera qué
   * tan lleno está el hotel, y no le sirve de nada a quien quiere reservar.
   */
  async property(orgSlug: string, propertySlug: string) {
    const property = await this.findPropertyOrThrow(orgSlug, propertySlug);

    const unitTypes = await this.prisma.unitType.findMany({
      where: { propertyId: property.id },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        maxGuests: true,
        bedrooms: true,
        beds: true,
        baths: true,
        sizeSqm: true,
        basePriceMinor: true,
        minNights: true,
      },
      orderBy: { basePriceMinor: 'asc' },
    });

    return {
      name: property.name,
      slug: property.slug,
      locality: property.locality,
      region: property.region,
      country: property.country,
      currency: property.currency,
      checkIn: property.checkIn,
      checkOut: property.checkOut,
      unitTypes,
    };
  }

  /**
   * Qué se puede vender en esas fechas y a qué precio, en una sola llamada.
   *
   * Junto y no en dos endpoints porque el sitio necesita las dos cosas para
   * pintar una tarjeta, y separarlas obligaría a una llamada por tipo.
   */
  async availability(
    orgSlug: string,
    propertySlug: string,
    checkInStr: string,
    checkOutStr: string,
    guests: number,
  ) {
    const property = await this.findPropertyOrThrow(orgSlug, propertySlug);
    const { checkIn, checkOut } = this.parseRange(checkInStr, checkOutStr);

    await this.releaseExpiredHolds(property.id);

    const unitTypes = await this.prisma.unitType.findMany({
      where: { propertyId: property.id },
      orderBy: { basePriceMinor: 'asc' },
    });

    const results = await Promise.all(
      unitTypes.map(async (unitType) => {
        const free = await this.countFreeUnits(unitType.id, checkIn, checkOut);
        const fitsGuests = guests <= unitType.maxGuests;

        /* La cotización puede fallar por reglas de venta —mínimo de noches,
           fechas cerradas— y eso NO es un error: es un "no se vende así". Se
           devuelve el motivo para que el sitio lo explique en vez de mostrar
           una tarjeta rota. */
        let quote: Awaited<ReturnType<PricingService['quote']>> | null = null;
        let unavailableReason: string | null = null;
        try {
          quote = await this.pricing.quote(
            property.orgId,
            property.id,
            unitType.id,
            checkIn,
            checkOut,
          );
        } catch (error) {
          unavailableReason =
            error instanceof BadRequestException
              ? ((error.getResponse() as { message?: string }).message ??
                'No disponible para esas fechas.')
              : 'No disponible para esas fechas.';
        }

        return {
          unitTypeId: unitType.id,
          slug: unitType.slug,
          name: unitType.name,
          maxGuests: unitType.maxGuests,
          /* `unitsAvailable` NO se expone: sólo si hay o no hay. "Queda 1"
             es un dato de ocupación, y además es la clase de urgencia falsa
             que un hotel serio no necesita fabricar. */
          available: free > 0 && fitsGuests && quote !== null,
          fitsGuests,
          quote: quote && {
            nights: quote.nights.length,
            subtotalMinor: quote.subtotalMinor,
            taxMinor: quote.taxMinor,
            totalMinor: quote.totalMinor,
            perNight: quote.nights.map((night) => ({
              date: night.date,
              priceMinor: night.priceMinor,
            })),
          },
          unavailableReason,
        };
      }),
    );

    return {
      checkIn: checkInStr,
      checkOut: checkOutStr,
      guests,
      currency: property.currency,
      unitTypes: results,
    };
  }

  /**
   * Crea una reserva desde el sitio, en `PENDING` y con retención.
   *
   * No queda confirmada: sin pagos, quien decide si la acepta es el hotel. El
   * personal la confirma desde el panel, y hasta entonces la retención impide
   * que quede bloqueando una habitación indefinidamente.
   */
  async book(orgSlug: string, propertySlug: string, dto: PublicBookingDto) {
    const property = await this.findPropertyOrThrow(orgSlug, propertySlug);
    const { checkIn, checkOut } = this.parseRange(dto.checkIn, dto.checkOut);

    const unitType = await this.prisma.unitType.findFirst({
      where: { id: dto.unitTypeId, propertyId: property.id },
    });
    if (!unitType) {
      throw new NotFoundException('Ese tipo de habitación no existe.');
    }

    const guests = dto.guests ?? 1;
    if (guests > unitType.maxGuests) {
      throw new BadRequestException(
        `Esta habitación admite hasta ${unitType.maxGuests} huéspedes.`,
      );
    }

    await this.releaseExpiredHolds(property.id);

    /* El precio lo calcula el servidor, siempre. El sitio muestra una
       cotización, pero lo que se guarda se vuelve a calcular acá: si el precio
       viniera del formulario, cualquiera podría reservar a un dólar. */
    const quote = await this.pricing.quote(
      property.orgId,
      property.id,
      unitType.id,
      checkIn,
      checkOut,
    );

    const free = await this.findFreeUnits(unitType.id, checkIn, checkOut);
    if (free.length === 0) {
      throw new ConflictException(
        'Esa habitación ya no está disponible para esas fechas.',
      );
    }

    const guest = await this.findOrCreateGuest(property.orgId, dto);

    const holdExpiresAt = new Date(Date.now() + HOLD_HOURS * 60 * 60 * 1000);

    try {
      const booking = await this.prisma.booking.create({
        data: {
          orgId: property.orgId,
          propertyId: property.id,
          unitTypeId: unitType.id,
          unitId: free[0].id,
          guestId: guest.id,
          reference: generateReference(),
          checkIn,
          checkOut,
          guests,
          status: BookingStatus.PENDING,
          source: BookingSource.DIRECT,
          holdExpiresAt,
          subtotalMinor: quote.subtotalMinor,
          taxMinor: quote.taxMinor,
          feesMinor: 0,
          totalMinor: quote.totalMinor,
          currency: property.currency,
          guestNotes: dto.guestNotes,
        },
      });

      /* El correo sale en el idioma en que reservó — es el único momento en que
         el sistema lo sabe. No se espera: la reserva ya existe, y hacer esperar
         al huésped por el SMTP sólo convierte un correo lento en un formulario
         lento. `send` no lanza. */
      void this.mail.send({
        to: guest.email,
        ...bookingRequested(
          {
            guestName: guest.fullName,
            reference: booking.reference,
            propertyName: property.name,
            unitTypeName: unitType.name,
            checkIn: dto.checkIn,
            checkOut: dto.checkOut,
            nights: quote.nights.length,
            totalMinor: quote.totalMinor,
            currency: property.currency,
          },
          dto.locale ?? 'es',
        ),
      });

      /* Se devuelve lo justo para mostrar la confirmación. Ni el id interno ni
         la unidad física asignada: el huésped reservó un tipo de habitación, y
         cuál le toca puede cambiar antes de que llegue. */
      return {
        reference: booking.reference,
        status: booking.status,
        checkIn: dto.checkIn,
        checkOut: dto.checkOut,
        guests,
        unitTypeName: unitType.name,
        nights: quote.nights.length,
        subtotalMinor: quote.subtotalMinor,
        taxMinor: quote.taxMinor,
        totalMinor: quote.totalMinor,
        currency: property.currency,
        holdExpiresAt,
      };
    } catch (error) {
      if (isOverlapConflict(error)) {
        throw new ConflictException(
          'Esa habitación se reservó justo ahora. Probá con otras fechas.',
        );
      }
      throw error;
    }
  }

  /**
   * Cancela las retenciones vencidas antes de mirar el inventario.
   *
   * La restricción de exclusión cuenta las `PENDING` igual que las confirmadas,
   * así que una retención vencida sigue bloqueando la habitación en la base
   * aunque el sistema la considere muerta. Barrerlas acá hace que la base y el
   * sistema digan lo mismo.
   *
   * ⚠️ Es un barrido perezoso: sólo corre cuando alguien consulta. Lo correcto
   * es un job programado; mientras no exista, esto evita el caso que importa.
   */
  private async releaseExpiredHolds(propertyId: string): Promise<void> {
    await this.prisma.booking.updateMany({
      where: {
        propertyId,
        status: BookingStatus.PENDING,
        holdExpiresAt: { lt: new Date() },
      },
      data: { status: BookingStatus.CANCELLED, cancelledAt: new Date() },
    });
  }

  private async findPropertyOrThrow(orgSlug: string, propertySlug: string) {
    const property = await this.prisma.property.findFirst({
      where: { slug: propertySlug, organization: { slug: orgSlug } },
    });
    if (!property) throw new NotFoundException('Alojamiento no encontrado.');
    return property;
  }

  private parseRange(checkInStr: string, checkOutStr: string) {
    const checkIn = new Date(`${checkInStr}T00:00:00.000Z`);
    const checkOut = new Date(`${checkOutStr}T00:00:00.000Z`);

    if (!(checkOut > checkIn)) {
      throw new BadRequestException(
        'La salida debe ser posterior a la entrada.',
      );
    }

    const nights = Math.round(
      (checkOut.getTime() - checkIn.getTime()) / 86400000,
    );
    if (nights > MAX_PUBLIC_NIGHTS) {
      throw new BadRequestException(
        `Para estadías de más de ${MAX_PUBLIC_NIGHTS} noches, escribinos directamente.`,
      );
    }

    /* Una reserva en el pasado no es un error del huésped: es un bot, o un
       formulario manipulado. Se compara contra el día UTC para no rechazar a
       alguien que reserva "hoy" desde otro huso. */
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (checkIn < today) {
      throw new BadRequestException('No se puede reservar en el pasado.');
    }

    return { checkIn, checkOut };
  }

  private async findFreeUnits(
    unitTypeId: string,
    checkIn: Date,
    checkOut: Date,
  ) {
    const units = await this.prisma.unit.findMany({
      where: { unitTypeId, active: true },
      select: { id: true },
    });
    if (units.length === 0) return [];

    const taken = await this.prisma.booking.findMany({
      where: {
        unitId: { in: units.map((u) => u.id) },
        status: { notIn: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW] },
        checkIn: { lt: checkOut },
        checkOut: { gt: checkIn },
      },
      select: { unitId: true },
    });
    const takenIds = new Set(taken.map((b) => b.unitId));
    return units.filter((u) => !takenIds.has(u.id));
  }

  private async countFreeUnits(
    unitTypeId: string,
    checkIn: Date,
    checkOut: Date,
  ): Promise<number> {
    return (await this.findFreeUnits(unitTypeId, checkIn, checkOut)).length;
  }

  /**
   * Encuentra al huésped por correo, y sólo lo crea si no existe.
   *
   * **Deliberadamente NO actualiza** el registro existente, a diferencia de la
   * carga por personal. Este endpoint es público y sin autenticar: si
   * actualizara, cualquiera que conozca el correo de un huésped podría
   * reescribirle el nombre y el teléfono en la ficha del hotel escribiendo una
   * reserva. Los datos que trae la reserva quedan en la reserva; la ficha sólo
   * la toca alguien autenticado.
   */
  private async findOrCreateGuest(orgId: string, dto: PublicBookingDto) {
    const email = dto.guestEmail.toLowerCase().trim();

    const existing = await this.prisma.guest.findUnique({
      where: { orgId_email: { orgId, email } },
    });
    if (existing) return existing;

    return this.prisma.guest.create({
      data: {
        orgId,
        email,
        fullName: dto.guestFullName,
        phone: dto.guestPhone,
        /* Se guarda al crear y no se actualiza después, igual que el resto de
           la ficha: un huésped que vuelve conserva el idioma con el que trató
           con el hotel la primera vez, que casi siempre es el correcto. */
        locale: dto.locale ?? null,
      },
    });
  }
}
