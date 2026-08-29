import { BadRequestException } from '@nestjs/common';
import {
  isWeekendNight,
  nightlyRateMinor,
  nightsBetweenDates,
  quoteStay,
  resolveRatePlan,
  type RatePlanLike,
} from './pricing.util';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Tipo de unidad de referencia: $80 la noche, sin mínimo. */
const UNIT_TYPE = { basePriceMinor: 8000, minNights: 1 };

function plan(
  overrides: Partial<RatePlanLike> & { startDate: Date; endDate: Date },
): RatePlanLike {
  return {
    priceMinor: 10000,
    weekendPriceMinor: null,
    minNights: null,
    closed: false,
    ...overrides,
  };
}

describe('nightsBetweenDates', () => {
  it('counts nights, not days inclusive', () => {
    expect(nightsBetweenDates(d('2026-09-10'), d('2026-09-12'))).toBe(2);
  });

  it('is 1 for a single-night stay', () => {
    expect(nightsBetweenDates(d('2026-09-10'), d('2026-09-11'))).toBe(1);
  });
});

describe('isWeekendNight', () => {
  it('counts Friday and Saturday nights', () => {
    // 2026-09-04 es viernes, 05 sábado.
    expect(isWeekendNight(d('2026-09-04'))).toBe(true);
    expect(isWeekendNight(d('2026-09-05'))).toBe(true);
  });

  it('does not count Sunday — that night guests go home', () => {
    expect(isWeekendNight(d('2026-09-06'))).toBe(false);
  });

  it('does not count weekdays', () => {
    expect(isWeekendNight(d('2026-09-07'))).toBe(false); // lunes
    expect(isWeekendNight(d('2026-09-10'))).toBe(false); // jueves
  });
});

describe('resolveRatePlan', () => {
  const highSeason = plan({
    startDate: d('2026-12-01'),
    endDate: d('2026-12-31'),
  });
  const christmas = plan({
    startDate: d('2026-12-24'),
    endDate: d('2026-12-26'),
    priceMinor: 25000,
  });

  it('returns null when no plan covers the date', () => {
    expect(resolveRatePlan([highSeason], d('2026-11-30'))).toBeNull();
  });

  it('includes both ends of the range', () => {
    expect(resolveRatePlan([highSeason], d('2026-12-01'))).toBe(highSeason);
    expect(resolveRatePlan([highSeason], d('2026-12-31'))).toBe(highSeason);
  });

  it('the most specific plan wins — a short override beats the season around it', () => {
    expect(resolveRatePlan([highSeason, christmas], d('2026-12-25'))).toBe(
      christmas,
    );
    // Fuera de la semana de Navidad vuelve a mandar la temporada.
    expect(resolveRatePlan([highSeason, christmas], d('2026-12-20'))).toBe(
      highSeason,
    );
  });

  it('order of the input does not change the winner', () => {
    expect(resolveRatePlan([christmas, highSeason], d('2026-12-25'))).toBe(
      christmas,
    );
  });

  it('breaks a tie in span by the later start date', () => {
    const older = plan({
      startDate: d('2026-12-01'),
      endDate: d('2026-12-07'),
    });
    const newer = plan({
      startDate: d('2026-12-03'),
      endDate: d('2026-12-09'),
    });
    expect(resolveRatePlan([older, newer], d('2026-12-05'))).toBe(newer);
  });
});

describe('nightlyRateMinor', () => {
  it('falls back to the unit type base price with no plan', () => {
    expect(nightlyRateMinor(UNIT_TYPE, null, d('2026-09-07'))).toBe(8000);
  });

  it('uses the plan price on a weekday', () => {
    const p = plan({
      startDate: d('2026-09-01'),
      endDate: d('2026-09-30'),
      priceMinor: 12000,
    });
    expect(nightlyRateMinor(UNIT_TYPE, p, d('2026-09-07'))).toBe(12000);
  });

  it('uses the weekend price on Friday and Saturday when the plan defines one', () => {
    const p = plan({
      startDate: d('2026-09-01'),
      endDate: d('2026-09-30'),
      priceMinor: 12000,
      weekendPriceMinor: 16000,
    });
    expect(nightlyRateMinor(UNIT_TYPE, p, d('2026-09-04'))).toBe(16000);
    expect(nightlyRateMinor(UNIT_TYPE, p, d('2026-09-07'))).toBe(12000);
  });

  it('keeps the weekday price on weekends when the plan has no weekend price', () => {
    const p = plan({
      startDate: d('2026-09-01'),
      endDate: d('2026-09-30'),
      priceMinor: 12000,
    });
    expect(nightlyRateMinor(UNIT_TYPE, p, d('2026-09-04'))).toBe(12000);
  });
});

describe('quoteStay', () => {
  it('charges the base price per night with no plans, plus tax', () => {
    // Lunes a miércoles: 2 noches de semana a $80.
    const quote = quoteStay({
      unitType: UNIT_TYPE,
      plans: [],
      checkIn: d('2026-09-07'),
      checkOut: d('2026-09-09'),
      taxRatePct: 10,
    });

    expect(quote.nights).toHaveLength(2);
    expect(quote.subtotalMinor).toBe(16000);
    expect(quote.taxMinor).toBe(1600);
    expect(quote.totalMinor).toBe(17600);
  });

  it('prices a weekend stay night by night, not as an average', () => {
    // Viernes y sábado caros, domingo normal.
    const p = plan({
      startDate: d('2026-09-01'),
      endDate: d('2026-09-30'),
      priceMinor: 10000,
      weekendPriceMinor: 15000,
    });

    const quote = quoteStay({
      unitType: UNIT_TYPE,
      plans: [p],
      checkIn: d('2026-09-04'), // viernes
      checkOut: d('2026-09-07'), // sale el lunes → noches vie, sáb, dom
      taxRatePct: 10,
    });

    expect(quote.nights.map((n) => n.priceMinor)).toEqual([
      15000, 15000, 10000,
    ]);
    expect(quote.subtotalMinor).toBe(40000);
  });

  it('the total always equals subtotal plus tax — the DB CHECK depends on it', () => {
    const quote = quoteStay({
      unitType: UNIT_TYPE,
      plans: [],
      checkIn: d('2026-09-07'),
      checkOut: d('2026-09-10'),
      taxRatePct: 10,
    });
    expect(quote.totalMinor).toBe(quote.subtotalMinor + quote.taxMinor);
  });

  it('refuses to sell a night inside a closed plan', () => {
    const closed = plan({
      startDate: d('2026-09-08'),
      endDate: d('2026-09-08'),
      closed: true,
    });

    expect(() =>
      quoteStay({
        unitType: UNIT_TYPE,
        plans: [closed],
        checkIn: d('2026-09-07'),
        checkOut: d('2026-09-10'),
        taxRatePct: 10,
      }),
    ).toThrow(BadRequestException);
  });

  it('enforces the minimum nights of the plan covering the arrival', () => {
    const p = plan({
      startDate: d('2026-12-24'),
      endDate: d('2026-12-26'),
      minNights: 3,
    });

    expect(() =>
      quoteStay({
        unitType: UNIT_TYPE,
        plans: [p],
        checkIn: d('2026-12-24'),
        checkOut: d('2026-12-25'),
        taxRatePct: 10,
      }),
    ).toThrow(/mínima de 3/);
  });

  it('falls back to the unit type minimum when the plan sets none', () => {
    expect(() =>
      quoteStay({
        unitType: { basePriceMinor: 8000, minNights: 2 },
        plans: [],
        checkIn: d('2026-09-07'),
        checkOut: d('2026-09-08'),
        taxRatePct: 10,
      }),
    ).toThrow(/mínima de 2/);
  });

  it('rejects a checkout that is not after the check-in', () => {
    expect(() =>
      quoteStay({
        unitType: UNIT_TYPE,
        plans: [],
        checkIn: d('2026-09-07'),
        checkOut: d('2026-09-07'),
        taxRatePct: 10,
      }),
    ).toThrow(BadRequestException);
  });

  it('charges no tax when the property has none', () => {
    const quote = quoteStay({
      unitType: UNIT_TYPE,
      plans: [],
      checkIn: d('2026-09-07'),
      checkOut: d('2026-09-08'),
      taxRatePct: 0,
    });
    expect(quote.taxMinor).toBe(0);
    expect(quote.totalMinor).toBe(quote.subtotalMinor);
  });
});
