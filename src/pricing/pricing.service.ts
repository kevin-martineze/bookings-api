import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PropertiesService } from '../catalog/properties.service';
import { UnitTypesService } from '../catalog/unit-types.service';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service';
import type { CreateRatePlanDto } from './dto/create-rate-plan.dto';
import type { UpdateRatePlanDto } from './dto/update-rate-plan.dto';
import {
  addDaysUtc,
  isWeekendNight,
  nightlyRateMinor,
  quoteStay,
  resolveRatePlan,
  toDateKey,
  type StayQuote,
} from './pricing.util';

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
    private readonly unitTypes: UnitTypesService,
  ) {}

  // --- Planes tarifarios ----------------------------------------------------

  async findPlans(orgId: string, propertyId: string, unitTypeId: string) {
    await this.unitTypes.findOrThrow(orgId, propertyId, unitTypeId);
    return this.prisma.ratePlan.findMany({
      where: { unitTypeId },
      orderBy: { startDate: 'asc' },
    });
  }

  async createPlan(
    orgId: string,
    propertyId: string,
    unitTypeId: string,
    dto: CreateRatePlanDto,
  ) {
    await this.unitTypes.findOrThrow(orgId, propertyId, unitTypeId);
    try {
      return await this.prisma.ratePlan.create({
        data: {
          orgId,
          unitTypeId,
          name: dto.name,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          priceMinor: dto.priceMinor,
          weekendPriceMinor: dto.weekendPriceMinor,
          minNights: dto.minNights,
          closed: dto.closed ?? false,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Ya existe un plan tarifario igual.');
      }
      throw error;
    }
  }

  async updatePlan(
    orgId: string,
    propertyId: string,
    unitTypeId: string,
    ratePlanId: string,
    dto: UpdateRatePlanDto,
  ) {
    await this.findPlanOrThrow(orgId, propertyId, unitTypeId, ratePlanId);
    return this.prisma.ratePlan.update({
      where: { id: ratePlanId },
      data: {
        ...dto,
        ...(dto.startDate ? { startDate: new Date(dto.startDate) } : {}),
        ...(dto.endDate ? { endDate: new Date(dto.endDate) } : {}),
      },
    });
  }

  async findPlanOrThrow(
    orgId: string,
    propertyId: string,
    unitTypeId: string,
    ratePlanId: string,
  ) {
    await this.unitTypes.findOrThrow(orgId, propertyId, unitTypeId);
    const found = await this.prisma.ratePlan.findFirst({
      where: { id: ratePlanId, unitTypeId, orgId },
    });
    if (!found) throw new NotFoundException('Plan tarifario no encontrado.');
    return found;
  }

  // --- Cotización -----------------------------------------------------------

  /**
   * Cotiza una estadía para un tipo de unidad.
   *
   * Es la única puerta al cálculo de precios: la usan el endpoint de vista
   * previa y la creación de reservas. Dos implementaciones del mismo desglose
   * terminan discrepando en un centavo, y ese centavo aparece entre lo que el
   * huésped vio al reservar y lo que dice su factura.
   */
  async quote(
    orgId: string,
    propertyId: string,
    unitTypeId: string,
    checkIn: Date,
    checkOut: Date,
  ): Promise<StayQuote & { currency: string }> {
    const property = await this.properties.findOrThrow(orgId, propertyId);
    const unitType = await this.unitTypes.findOrThrow(
      orgId,
      propertyId,
      unitTypeId,
    );
    const plans = await this.plansCovering(unitTypeId, checkIn, checkOut);

    const result = quoteStay({
      unitType: {
        basePriceMinor: unitType.basePriceMinor,
        minNights: unitType.minNights,
      },
      plans,
      checkIn,
      checkOut,
      taxRatePct: property.taxRatePct,
    });

    return { ...result, currency: property.currency };
  }

  /**
   * Precio por tipo de unidad y por fecha, en una sola consulta.
   *
   * La pantalla de Tarifas dibuja 28 días × cada tipo; pedirlo con una llamada
   * por celda serían cientos de consultas para una sola pantalla.
   */
  async rateCalendar(orgId: string, propertyId: string, from: Date, to: Date) {
    await this.properties.findOrThrow(orgId, propertyId);

    const unitTypes = await this.prisma.unitType.findMany({
      where: { propertyId },
      orderBy: { name: 'asc' },
    });
    const plans = await this.prisma.ratePlan.findMany({
      where: {
        unitTypeId: { in: unitTypes.map((t) => t.id) },
        startDate: { lte: to },
        endDate: { gte: from },
      },
    });

    return unitTypes.map((unitType) => {
      const own = plans.filter((plan) => plan.unitTypeId === unitType.id);
      const nights: {
        date: string;
        priceMinor: number;
        weekend: boolean;
        closed: boolean;
        planName: string | null;
      }[] = [];

      for (let date = from; date <= to; date = addDaysUtc(date, 1)) {
        const plan = resolveRatePlan(own, date);
        nights.push({
          date: toDateKey(date),
          priceMinor: nightlyRateMinor(
            {
              basePriceMinor: unitType.basePriceMinor,
              minNights: unitType.minNights,
            },
            plan,
            date,
          ),
          weekend: isWeekendNight(date),
          closed: plan?.closed ?? false,
          planName: plan?.name ?? null,
        });
      }

      return {
        unitTypeId: unitType.id,
        unitTypeName: unitType.name,
        basePriceMinor: unitType.basePriceMinor,
        nights,
      };
    });
  }

  /** Sólo los planes que tocan el rango pedido: no hace falta traer el año entero. */
  private plansCovering(unitTypeId: string, checkIn: Date, checkOut: Date) {
    return this.prisma.ratePlan.findMany({
      where: {
        unitTypeId,
        startDate: { lt: checkOut },
        endDate: { gte: checkIn },
      },
    });
  }
}
