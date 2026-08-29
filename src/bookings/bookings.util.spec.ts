import { BadRequestException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { assertTransition, datesOverlap } from './bookings.util';

const d = (s: string) => new Date(s);

describe('datesOverlap', () => {
  it('does not overlap when one stay ends the day the other begins', () => {
    expect(
      datesOverlap(
        d('2026-09-10'),
        d('2026-09-12'),
        d('2026-09-12'),
        d('2026-09-14'),
      ),
    ).toBe(false);
  });

  it('overlaps when the ranges are identical', () => {
    expect(
      datesOverlap(
        d('2026-09-10'),
        d('2026-09-12'),
        d('2026-09-10'),
        d('2026-09-12'),
      ),
    ).toBe(true);
  });

  it('overlaps on a partial overlap', () => {
    expect(
      datesOverlap(
        d('2026-09-10'),
        d('2026-09-15'),
        d('2026-09-14'),
        d('2026-09-20'),
      ),
    ).toBe(true);
  });

  it('does not overlap when completely separate', () => {
    expect(
      datesOverlap(
        d('2026-09-10'),
        d('2026-09-12'),
        d('2026-09-20'),
        d('2026-09-22'),
      ),
    ).toBe(false);
  });

  it('overlaps when one range fully contains the other', () => {
    expect(
      datesOverlap(
        d('2026-09-01'),
        d('2026-09-30'),
        d('2026-09-10'),
        d('2026-09-12'),
      ),
    ).toBe(true);
  });
});

/* El conteo de noches se probaba acá; ahora vive en `pricing.util.spec.ts`,
   junto a la función que quedó como única. */

describe('assertTransition', () => {
  it.each([
    [BookingStatus.PENDING, BookingStatus.CONFIRMED],
    [BookingStatus.PENDING, BookingStatus.CANCELLED],
    [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN],
    [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
    [BookingStatus.CONFIRMED, BookingStatus.NO_SHOW],
    [BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT],
  ])('allows %s -> %s', (current, next) => {
    expect(() => assertTransition(current, next)).not.toThrow();
  });

  it.each([
    [BookingStatus.PENDING, BookingStatus.CHECKED_IN],
    [BookingStatus.CONFIRMED, BookingStatus.CHECKED_OUT],
    [BookingStatus.CHECKED_IN, BookingStatus.CONFIRMED],
    [BookingStatus.CHECKED_OUT, BookingStatus.CHECKED_IN],
    [BookingStatus.CANCELLED, BookingStatus.CONFIRMED],
    [BookingStatus.NO_SHOW, BookingStatus.CHECKED_IN],
  ])('rejects %s -> %s', (current, next) => {
    expect(() => assertTransition(current, next)).toThrow(BadRequestException);
  });
});
