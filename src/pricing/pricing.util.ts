import { BadRequestException } from '@nestjs/common';

/**
 * El motor de precios, sin base de datos.
 *
 * Todo acá es una función pura sobre datos que le pasan: se puede probar sin
 * levantar Postgres, y es donde vive la aritmética que termina en una factura.
 */

/** Lo mínimo que el motor necesita de un plan tarifario. */
export type RatePlanLike = {
  startDate: Date;
  /** Inclusivo: la noche del endDate se cobra a esta tarifa. */
  endDate: Date;
  priceMinor: number;
  weekendPriceMinor: number | null;
  minNights: number | null;
  closed: boolean;
};

export type UnitTypeRates = {
  basePriceMinor: number;
  minNights: number;
};

export type NightBreakdown = {
  /** Fecha de la noche, "YYYY-MM-DD". */
  date: string;
  priceMinor: number;
  weekend: boolean;
};

export type StayQuote = {
  nights: NightBreakdown[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  /** Noches mínimas que aplicaron a esta estadía. */
  minNights: number;
};

const DAY_MS = 86_400_000;

/** Fecha de calendario en UTC, "YYYY-MM-DD". Las noches son días, no instantes. */
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function nightsBetweenDates(checkIn: Date, checkOut: Date): number {
  return Math.round((checkOut.getTime() - checkIn.getTime()) / DAY_MS);
}

/**
 * Noches de fin de semana: viernes y sábado.
 *
 * Es la noche que se vende cara en un hotel de playa con sports bar. El domingo
 * queda fuera a propósito: esa noche la gente se vuelve a casa.
 *
 * PENDIENTE DE CONFIRMAR CON EL CLIENTE — está en su lista de tareas ("pedir
 * las tarifas: alta, baja, fin de semana"). Si para él el domingo también es
 * fin de semana, se cambia acá y en ningún otro lado.
 */
export function isWeekendNight(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 5 || day === 6;
}

/**
 * El plan que manda sobre una fecha: gana el MÁS ESPECÍFICO.
 *
 * Criterio: rango más corto primero, y ante empate el de inicio más reciente.
 * Así una semana de Navidad puede sobrescribir a "temporada alta" sin borrarla
 * ni partirla en tres planes. Sin una regla explícita, dos planes solapados
 * darían un precio que depende del orden en que la base los devuelva — es
 * decir, un precio aleatorio.
 */
export function resolveRatePlan<T extends RatePlanLike>(
  plans: T[],
  date: Date,
): T | null {
  const covering = plans.filter(
    (plan) => date >= plan.startDate && date <= plan.endDate,
  );
  if (covering.length === 0) return null;

  return covering.reduce((best, plan) => {
    const bestSpan = best.endDate.getTime() - best.startDate.getTime();
    const planSpan = plan.endDate.getTime() - plan.startDate.getTime();
    if (planSpan !== bestSpan) return planSpan < bestSpan ? plan : best;
    return plan.startDate > best.startDate ? plan : best;
  });
}

/** Tarifa de una noche: el plan que la cubre, con su precio de fin de semana si lo define. */
export function nightlyRateMinor(
  unitType: UnitTypeRates,
  plan: RatePlanLike | null,
  date: Date,
): number {
  if (!plan) return unitType.basePriceMinor;
  if (isWeekendNight(date) && plan.weekendPriceMinor !== null)
    return plan.weekendPriceMinor;
  return plan.priceMinor;
}

/**
 * Cotiza una estadía, noche por noche.
 *
 * El desglose NO es "promedio × noches": quien llega el viernes y se va el
 * lunes paga tres tarifas distintas, y un total que no las explica es la
 * principal fuente de disputas en recepción.
 *
 * Además de calcular, hace cumplir las reglas del plan: no vende noches
 * cerradas y rechaza estadías más cortas que el mínimo.
 */
export function quoteStay(input: {
  unitType: UnitTypeRates;
  plans: RatePlanLike[];
  checkIn: Date;
  checkOut: Date;
  taxRatePct: number;
}): StayQuote {
  const nightCount = nightsBetweenDates(input.checkIn, input.checkOut);
  if (nightCount <= 0) {
    throw new BadRequestException('La salida debe ser posterior a la entrada.');
  }

  const nights: NightBreakdown[] = [];
  let subtotalMinor = 0;

  for (let i = 0; i < nightCount; i++) {
    const date = addDaysUtc(input.checkIn, i);
    const plan = resolveRatePlan(input.plans, date);

    if (plan?.closed) {
      throw new BadRequestException(
        `La noche del ${toDateKey(date)} no está a la venta.`,
      );
    }

    const priceMinor = nightlyRateMinor(input.unitType, plan, date);
    subtotalMinor += priceMinor;
    nights.push({
      date: toDateKey(date),
      priceMinor,
      weekend: isWeekendNight(date),
    });
  }

  /* El mínimo lo fija el plan que cubre la NOCHE DE ENTRADA: es el que define
     la temporada en la que el huésped llega. Si ese plan no lo especifica, vale
     el del tipo de unidad. */
  const entryPlan = resolveRatePlan(input.plans, input.checkIn);
  const minNights = entryPlan?.minNights ?? input.unitType.minNights;
  if (nightCount < minNights) {
    throw new BadRequestException(
      `Esas fechas exigen una estadía mínima de ${minNights} noche(s).`,
    );
  }

  /* Redondeo al centavo una sola vez, sobre el subtotal entero. Redondear noche
     por noche acumula el error y el total deja de cuadrar con la suma que el
     huésped ve. */
  const taxMinor = Math.round((subtotalMinor * input.taxRatePct) / 100);

  return {
    nights,
    subtotalMinor,
    taxMinor,
    totalMinor: subtotalMinor + taxMinor,
    minNights,
  };
}
