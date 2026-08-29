import { BadRequestException, Injectable } from '@nestjs/common';
import { BookingSource } from '@prisma/client';
import { PropertiesService } from '../catalog/properties.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  adrMinor,
  allocate,
  countsTowardRevenue,
  nightsBetween,
  occupancyRate,
  revparMinor,
  type StayLike,
} from './reports.util';

/** Tope de ventana. Un año ya es un reporte anual; más es un volcado. */
const MAX_WINDOW_NIGHTS = 366;

type Bucket = { nights: number; netMinor: number; taxMinor: number };

const emptyBucket = (): Bucket => ({ nights: 0, netMinor: 0, taxMinor: 0 });

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
  ) {}

  /**
   * Rendimiento del período: ingreso, ocupación, ADR y RevPAR, más el desglose
   * por tipo de unidad y por origen de la reserva.
   *
   * El ingreso que encabeza el reporte es el **neto, sin impuesto**. El ITBMS
   * no es ingreso del hotel: es plata que se cobra para la DGI y se entrega.
   * Mostrarlo dentro del ingreso infla todos los indicadores un 10% y hace que
   * el ADR no se pueda comparar con ninguna tarifa publicada.
   */
  async performance(
    orgId: string,
    propertyId: string,
    fromStr: string,
    toStr: string,
  ) {
    await this.properties.findOrThrow(orgId, propertyId);

    const from = new Date(`${fromStr}T00:00:00.000Z`);
    const to = new Date(`${toStr}T00:00:00.000Z`);
    const windowNights = nightsBetween(from, to);

    if (windowNights === 0) {
      throw new BadRequestException('`to` debe ser posterior a `from`.');
    }
    if (windowNights > MAX_WINDOW_NIGHTS) {
      throw new BadRequestException(
        `El rango no puede superar ${MAX_WINDOW_NIGHTS} noches.`,
      );
    }

    /* Período anterior de la MISMA duración, pegado al actual: comparar 30 días
       contra 28 daría una caída que no ocurrió. */
    const previousFrom = new Date(from.getTime() - windowNights * 86400000);

    const [unitTypes, units, stays, previousStays] = await Promise.all([
      this.prisma.unitType.findMany({
        where: { propertyId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.unit.findMany({
        where: { propertyId, active: true },
        select: { id: true, unitTypeId: true },
      }),
      this.findStays(propertyId, from, to),
      this.findStays(propertyId, previousFrom, from),
    ]);

    const unitsByType = new Map<string, number>();
    for (const unit of units) {
      unitsByType.set(
        unit.unitTypeId,
        (unitsByType.get(unit.unitTypeId) ?? 0) + 1,
      );
    }

    const total = emptyBucket();
    const byType = new Map<string, Bucket>();
    const bySource = new Map<BookingSource, Bucket & { bookings: number }>();

    for (const stay of stays) {
      const part = allocate(stay, from, to);
      if (part.nights === 0) continue;

      total.nights += part.nights;
      total.netMinor += part.netMinor;
      total.taxMinor += part.taxMinor;

      const type = byType.get(stay.unitTypeId) ?? emptyBucket();
      type.nights += part.nights;
      type.netMinor += part.netMinor;
      type.taxMinor += part.taxMinor;
      byType.set(stay.unitTypeId, type);

      const source = bySource.get(stay.source) ?? {
        ...emptyBucket(),
        bookings: 0,
      };
      source.nights += part.nights;
      source.netMinor += part.netMinor;
      source.taxMinor += part.taxMinor;
      source.bookings += 1;
      bySource.set(stay.source, source);
    }

    let previousNetMinor = 0;
    for (const stay of previousStays) {
      previousNetMinor += allocate(stay, previousFrom, from).netMinor;
    }

    const nightsAvailable = units.length * windowNights;
    const netMinor = Math.round(total.netMinor);

    return {
      from: fromStr,
      to: toStr,
      windowNights,
      revenue: {
        netMinor,
        taxMinor: Math.round(total.taxMinor),
        grossMinor: Math.round(total.netMinor + total.taxMinor),
        previousNetMinor: Math.round(previousNetMinor),
      },
      occupancy: {
        nightsSold: total.nights,
        nightsAvailable,
        rate: occupancyRate(total.nights, nightsAvailable),
      },
      adrMinor: adrMinor(total.netMinor, total.nights),
      revparMinor: revparMinor(total.netMinor, nightsAvailable),
      byUnitType: unitTypes.map((unitType) => {
        const bucket = byType.get(unitType.id) ?? emptyBucket();
        const unitCount = unitsByType.get(unitType.id) ?? 0;
        const available = unitCount * windowNights;
        return {
          unitTypeId: unitType.id,
          name: unitType.name,
          units: unitCount,
          nightsSold: bucket.nights,
          nightsAvailable: available,
          occupancy: occupancyRate(bucket.nights, available),
          adrMinor: adrMinor(bucket.netMinor, bucket.nights),
          netMinor: Math.round(bucket.netMinor),
        };
      }),
      bySource: [...bySource.entries()]
        .map(([source, bucket]) => ({
          source,
          bookings: bucket.bookings,
          nightsSold: bucket.nights,
          netMinor: Math.round(bucket.netMinor),
        }))
        .sort((a, b) => b.netMinor - a.netMinor),
    };
  }

  /**
   * Estadías que se solapan con la ventana, con la misma semántica `[)` que el
   * resto del sistema: una que empezó antes y sigue en curso aporta sus noches.
   */
  private async findStays(
    propertyId: string,
    from: Date,
    to: Date,
  ): Promise<StayLike[]> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        propertyId,
        checkIn: { lt: to },
        checkOut: { gt: from },
      },
      select: {
        checkIn: true,
        checkOut: true,
        status: true,
        subtotalMinor: true,
        taxMinor: true,
        unitTypeId: true,
        source: true,
      },
    });
    return bookings.filter(countsTowardRevenue);
  }
}
