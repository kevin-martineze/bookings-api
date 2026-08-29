import { BookingStatus, HousekeepingStatus } from '@prisma/client';
import {
  dateKey,
  needsCleaning,
  occupancyOn,
  priority,
  roomState,
  taskType,
  type BookingLike,
  type UnitLike,
} from './housekeeping.util';

const DAY = '2026-09-10';
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function unit(overrides: Partial<UnitLike> = {}): UnitLike {
  return {
    active: true,
    housekeepingStatus: HousekeepingStatus.CLEAN,
    ...overrides,
  };
}

function booking(
  checkIn: string,
  checkOut: string,
  status: BookingStatus = BookingStatus.CONFIRMED,
): BookingLike {
  return { checkIn: d(checkIn), checkOut: d(checkOut), status };
}

describe('dateKey', () => {
  it('takes the UTC calendar date, not the local one', () => {
    // Las columnas son @db.Date: Prisma las devuelve a medianoche UTC.
    expect(dateKey(d('2026-09-10'))).toBe('2026-09-10');
  });
});

describe('occupancyOn', () => {
  it('sees a departure the day the stay ends', () => {
    const o = occupancyOn([booking('2026-09-08', DAY)], DAY);
    expect(o.departing).toBe(true);
    expect(o.arriving).toBe(false);
  });

  it('sees an arrival the day the stay begins', () => {
    const o = occupancyOn([booking(DAY, '2026-09-12')], DAY);
    expect(o.arriving).toBe(true);
    expect(o.departing).toBe(false);
  });

  it('sees both when one stay ends and another begins the same day', () => {
    const o = occupancyOn(
      [booking('2026-09-08', DAY), booking(DAY, '2026-09-12')],
      DAY,
    );
    expect(o.departing).toBe(true);
    expect(o.arriving).toBe(true);
  });

  it('counts as occupied only a guest already checked in and mid-stay', () => {
    const o = occupancyOn(
      [booking('2026-09-08', '2026-09-12', BookingStatus.CHECKED_IN)],
      DAY,
    );
    expect(o.occupied).toBe(true);
  });

  it('does not count a mid-stay booking that never checked in', () => {
    // Reservada y confirmada, pero el huésped no llegó a recepción: la
    // habitación está físicamente vacía y camarería no debe verla ocupada.
    const o = occupancyOn([booking('2026-09-08', '2026-09-12')], DAY);
    expect(o.occupied).toBe(false);
  });

  it('ignores cancelled and no-show bookings entirely', () => {
    const o = occupancyOn(
      [
        booking('2026-09-08', DAY, BookingStatus.CANCELLED),
        booking(DAY, '2026-09-12', BookingStatus.NO_SHOW),
      ],
      DAY,
    );
    expect(o).toEqual({ departing: false, arriving: false, occupied: false });
  });
});

describe('roomState', () => {
  const empty = { departing: false, arriving: false, occupied: false };

  it('reports an inactive unit as blocked, whatever else is true', () => {
    expect(
      roomState(unit({ active: false }), { ...empty, departing: true }),
    ).toBe('blocked');
  });

  it('puts the departure ahead of the arrival on a same-day turnover', () => {
    expect(
      roomState(unit(), { departing: true, arriving: true, occupied: false }),
    ).toBe('departing');
  });

  it('distinguishes a vacant clean room from a vacant dirty one', () => {
    expect(roomState(unit(), empty)).toBe('vacant-clean');
    expect(
      roomState(unit({ housekeepingStatus: HousekeepingStatus.DIRTY }), empty),
    ).toBe('vacant-dirty');
  });

  it('treats an inspected room as clean', () => {
    expect(
      roomState(
        unit({ housekeepingStatus: HousekeepingStatus.INSPECTED }),
        empty,
      ),
    ).toBe('vacant-clean');
  });
});

describe('taskType', () => {
  const empty = { departing: false, arriving: false, occupied: false };

  it('asks for a full clean after a departure', () => {
    expect(taskType(unit(), { ...empty, departing: true })).toBe('departure');
  });

  it('asks for a full clean on any dirty room', () => {
    expect(
      taskType(unit({ housekeepingStatus: HousekeepingStatus.DIRTY }), empty),
    ).toBe('departure');
  });

  it('asks for a stayover on a guest who is not leaving', () => {
    expect(taskType(unit(), { ...empty, occupied: true })).toBe('stayover');
  });

  it('asks for an inspection when someone arrives to a clean but unverified room', () => {
    expect(taskType(unit(), { ...empty, arriving: true })).toBe('inspection');
  });

  it('asks for nothing when the room was already inspected', () => {
    expect(
      taskType(unit({ housekeepingStatus: HousekeepingStatus.INSPECTED }), {
        ...empty,
        arriving: true,
      }),
    ).toBeNull();
  });

  it('asks for nothing on a room out of service', () => {
    expect(
      taskType(
        unit({ active: false, housekeepingStatus: HousekeepingStatus.DIRTY }),
        empty,
      ),
    ).toBeNull();
  });

  it('asks for nothing on an idle clean room', () => {
    expect(taskType(unit(), empty)).toBeNull();
  });
});

describe('priority', () => {
  const empty = { departing: false, arriving: false, occupied: false };

  it('is high on a same-day turnover — four hours between 11:00 and 15:00', () => {
    expect(
      priority(unit(), { departing: true, arriving: true, occupied: false }),
    ).toBe('high');
  });

  it('is high when a guest is arriving to a room still dirty', () => {
    expect(
      priority(unit({ housekeepingStatus: HousekeepingStatus.DIRTY }), {
        ...empty,
        arriving: true,
      }),
    ).toBe('high');
  });

  it('is normal for a departure with nobody coming in behind it', () => {
    expect(priority(unit(), { ...empty, departing: true })).toBe('normal');
  });

  it('is normal for a room out of service', () => {
    expect(
      priority(unit({ active: false }), {
        departing: true,
        arriving: true,
        occupied: false,
      }),
    ).toBe('normal');
  });
});

describe('needsCleaning', () => {
  it('is true only for a dirty room in service', () => {
    expect(
      needsCleaning(unit({ housekeepingStatus: HousekeepingStatus.DIRTY })),
    ).toBe(true);
    expect(needsCleaning(unit())).toBe(false);
    expect(
      needsCleaning(
        unit({ active: false, housekeepingStatus: HousekeepingStatus.DIRTY }),
      ),
    ).toBe(false);
  });
});
