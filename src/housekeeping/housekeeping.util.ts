import { BookingStatus, HousekeepingStatus } from '@prisma/client';

/**
 * Estado que ve el personal en el tablero. Combina dos cosas de naturaleza
 * distinta:
 *
 *  - la limpieza, que SÍ está guardada (`units.housekeeping_status`);
 *  - la ocupación, que NO se guarda y se deriva de las reservas del día.
 *
 * Guardar la ocupación sería duplicar las reservas: se desactualiza en cuanto
 * alguien mueve una, y nadie lo nota hasta que el pasillo no coincide con la
 * pantalla.
 */
export type RoomState =
  | 'blocked'
  | 'departing'
  | 'occupied'
  | 'arriving'
  | 'vacant-dirty'
  | 'vacant-clean';

/** Qué trabajo pide la habitación hoy. `null` = ninguno. */
export type TaskType = 'departure' | 'stayover' | 'inspection' | null;

export type BookingLike = {
  checkIn: Date;
  checkOut: Date;
  status: BookingStatus;
};

export type UnitLike = {
  active: boolean;
  housekeepingStatus: HousekeepingStatus;
};

/**
 * Fecha calendario de un `Date`, en UTC.
 *
 * Las columnas de fecha son `@db.Date`, así que Prisma las devuelve a
 * medianoche UTC y este recorte da el día correcto. Construir un `Date` local
 * a partir de ellas corría las reservas una noche en Panamá (UTC-5); es el
 * mismo error que ya nos costó un dashboard en cero.
 */
export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Reservas que no ocupan inventario: no cuentan para nada del tablero. */
function isLive(booking: BookingLike): boolean {
  return (
    booking.status !== BookingStatus.CANCELLED &&
    booking.status !== BookingStatus.NO_SHOW
  );
}

export type Occupancy = {
  /** Alguien se va hoy de esta habitación. */
  departing: boolean;
  /** Alguien llega hoy a esta habitación. */
  arriving: boolean;
  /** Hay un huésped que ya entró y todavía no se va hoy. */
  occupied: boolean;
};

export function occupancyOn(bookings: BookingLike[], day: string): Occupancy {
  const live = bookings.filter(isLive);
  return {
    departing: live.some((b) => dateKey(b.checkOut) === day),
    arriving: live.some((b) => dateKey(b.checkIn) === day),
    occupied: live.some(
      (b) =>
        b.status === BookingStatus.CHECKED_IN &&
        dateKey(b.checkIn) < day &&
        day < dateKey(b.checkOut),
    ),
  };
}

/**
 * Orden de precedencia: fuera de servicio → sale hoy → ocupada → llega hoy →
 * vacía.
 *
 * "Sale hoy" gana sobre "llega hoy" a propósito: en una habitación que se
 * desocupa y se vuelve a vender el mismo día, el trabajo urgente es la salida.
 */
export function roomState(unit: UnitLike, occupancy: Occupancy): RoomState {
  if (!unit.active) return 'blocked';
  if (occupancy.departing) return 'departing';
  if (occupancy.occupied) return 'occupied';
  if (occupancy.arriving) return 'arriving';
  return unit.housekeepingStatus === HousekeepingStatus.DIRTY
    ? 'vacant-dirty'
    : 'vacant-clean';
}

export function taskType(unit: UnitLike, occupancy: Occupancy): TaskType {
  if (!unit.active) return null;
  // Salida = limpieza a fondo, aunque el huésped todavía no haya entregado.
  if (occupancy.departing) return 'departure';
  if (unit.housekeepingStatus === HousekeepingStatus.DIRTY) return 'departure';
  // Huésped que se queda: repaso, no limpieza a fondo.
  if (occupancy.occupied) return 'stayover';
  // Llega alguien a una habitación limpia pero sin verificar.
  if (
    occupancy.arriving &&
    unit.housekeepingStatus === HousekeepingStatus.CLEAN
  ) {
    return 'inspection';
  }
  return null;
}

/**
 * Prioridad alta = hay una hora límite real hoy.
 *
 * Dos casos, y sólo dos:
 *
 *  1. **Rotación el mismo día.** Sale un huésped y entra otro: la ventana entre
 *     el check-out de las 11:00 y el check-in de las 15:00 son cuatro horas, y
 *     es lo único del turno que no se puede correr para más tarde.
 *  2. **Llega alguien a una habitación sucia.** Ya se vendió, el huésped está
 *     en camino y la habitación no está lista.
 */
export function priority(
  unit: UnitLike,
  occupancy: Occupancy,
): 'high' | 'normal' {
  if (!unit.active) return 'normal';
  if (occupancy.departing && occupancy.arriving) return 'high';
  if (
    occupancy.arriving &&
    unit.housekeepingStatus === HousekeepingStatus.DIRTY
  ) {
    return 'high';
  }
  return 'normal';
}

/** Sólo las sucias son trabajo pendiente de limpieza. */
export function needsCleaning(unit: UnitLike): boolean {
  return unit.active && unit.housekeepingStatus === HousekeepingStatus.DIRTY;
}
