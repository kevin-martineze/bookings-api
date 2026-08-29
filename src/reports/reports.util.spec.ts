import { BookingSource, BookingStatus } from '@prisma/client';
import {
  adrMinor,
  allocate,
  countsTowardRevenue,
  nightsBetween,
  nightsInWindow,
  occupancyRate,
  revparMinor,
  type StayLike,
} from './reports.util';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function stay(overrides: Partial<StayLike> = {}): StayLike {
  return {
    checkIn: d('2026-09-10'),
    checkOut: d('2026-09-14'), // 4 noches
    status: BookingStatus.CONFIRMED,
    subtotalMinor: 40000, // $400 → $100 la noche
    taxMinor: 4000,
    unitTypeId: 'ut-1',
    source: BookingSource.DIRECT,
    ...overrides,
  };
}

describe('countsTowardRevenue', () => {
  it('excludes cancelled and no-show', () => {
    expect(countsTowardRevenue(stay({ status: BookingStatus.CANCELLED }))).toBe(
      false,
    );
    expect(countsTowardRevenue(stay({ status: BookingStatus.NO_SHOW }))).toBe(
      false,
    );
  });

  it('includes every state that still holds the room', () => {
    for (const status of [
      BookingStatus.PENDING,
      BookingStatus.CONFIRMED,
      BookingStatus.CHECKED_IN,
      BookingStatus.CHECKED_OUT,
    ]) {
      expect(countsTowardRevenue(stay({ status }))).toBe(true);
    }
  });
});

describe('nightsInWindow', () => {
  it('counts every night when the stay is fully inside', () => {
    expect(nightsInWindow(stay(), d('2026-09-01'), d('2026-10-01'))).toBe(4);
  });

  it('counts nothing when the stay ends the day the window starts', () => {
    // Check-out el 14, ventana desde el 14: esa noche no existe.
    expect(nightsInWindow(stay(), d('2026-09-14'), d('2026-09-20'))).toBe(0);
  });

  it('counts nothing when the stay starts the day the window ends', () => {
    expect(nightsInWindow(stay(), d('2026-09-01'), d('2026-09-10'))).toBe(0);
  });

  it('counts only the overlapping nights when the stay straddles the edge', () => {
    // Ventana termina el 12: quedan las noches del 10 y del 11.
    expect(nightsInWindow(stay(), d('2026-09-01'), d('2026-09-12'))).toBe(2);
  });
});

describe('allocate', () => {
  it('splits a stay that straddles two periods instead of charging it whole', () => {
    // 4 noches a $100. La ventana toma 2 → $200 netos, no $400.
    const part = allocate(stay(), d('2026-09-01'), d('2026-09-12'));
    expect(part.nights).toBe(2);
    expect(part.netMinor).toBe(20000);
    expect(part.taxMinor).toBe(2000);
  });

  it('gives the whole amount when the window contains the stay', () => {
    const whole = allocate(stay(), d('2026-09-01'), d('2026-10-01'));
    expect(whole.netMinor).toBe(40000);
  });

  it('gives nothing for a stay outside the window', () => {
    expect(allocate(stay(), d('2026-10-01'), d('2026-11-01'))).toEqual({
      nights: 0,
      netMinor: 0,
      taxMinor: 0,
    });
  });

  it('keeps fractions of a cent so the rounding happens once at the end', () => {
    // $100 en 3 noches no divide exacto: 3333.33… por noche.
    const part = allocate(
      stay({ checkOut: d('2026-09-13'), subtotalMinor: 10000 }),
      d('2026-09-10'),
      d('2026-09-11'),
    );
    expect(part.netMinor).toBeCloseTo(3333.33, 1);
    // Las tres partes tienen que volver a sumar el importe original.
    const all = [0, 1, 2].map(
      (i) =>
        allocate(
          stay({ checkOut: d('2026-09-13'), subtotalMinor: 10000 }),
          d(`2026-09-1${i}`),
          d(`2026-09-1${i + 1}`),
        ).netMinor,
    );
    expect(Math.round(all.reduce((a, b) => a + b, 0))).toBe(10000);
  });
});

describe('adrMinor', () => {
  it('is the net revenue per night sold', () => {
    expect(adrMinor(40000, 4)).toBe(10000);
  });

  it('is zero with nothing sold, instead of dividing by zero', () => {
    expect(adrMinor(0, 0)).toBe(0);
  });
});

describe('revparMinor', () => {
  it('divides by every available night, sold or not', () => {
    // $400 netos sobre 10 noches-habitación disponibles.
    expect(revparMinor(40000, 10)).toBe(4000);
  });

  it('is lower than the ADR whenever the hotel is not full', () => {
    expect(revparMinor(40000, 10)).toBeLessThan(adrMinor(40000, 4));
  });

  it('is zero with no inventory', () => {
    expect(revparMinor(40000, 0)).toBe(0);
  });
});

describe('occupancyRate', () => {
  it('is sold over available', () => {
    expect(occupancyRate(4, 10)).toBe(0.4);
  });

  it('is zero with no inventory', () => {
    expect(occupancyRate(0, 0)).toBe(0);
  });
});

describe('nightsBetween', () => {
  it('never returns a negative count', () => {
    expect(nightsBetween(d('2026-09-14'), d('2026-09-10'))).toBe(0);
  });
});
