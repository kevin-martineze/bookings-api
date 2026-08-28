import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';

/**
 * Solapamiento de dos rangos `[)` — mismo criterio que la migración
 * `booking_overlap_guard` usa para el `daterange` en la base: incluye el
 * check-in, excluye el check-out. Dos estadías adyacentes (una sale el 12,
 * otra entra el 12) NO se solapan.
 */
export function datesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/* `nightsBetween` vivía acá y se fue a `pricing.util.ts` como
   `nightsBetweenDates`: desde que el motor de precios calcula el desglose noche
   por noche, es él quien cuenta las noches. Dos funciones contando lo mismo
   terminan discrepando, y la que discrepa aparece en una factura. */

/** 8 caracteres en mayúscula, tomados de un UUID — corto y fácil de leer por teléfono. */
export function generateReference(): string {
  return randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
}

/**
 * Transiciones válidas de la máquina de estados. `PENDING` no se ejercita
 * todavía (esta pasada crea reservas directo en `CONFIRMED`, sin depósito),
 * pero queda modelado para cuando exista el flujo de reserva directa del
 * huésped.
 */
const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.PENDING]: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
  [BookingStatus.CONFIRMED]: [
    BookingStatus.CHECKED_IN,
    BookingStatus.CANCELLED,
    BookingStatus.NO_SHOW,
  ],
  [BookingStatus.CHECKED_IN]: [BookingStatus.CHECKED_OUT],
  [BookingStatus.CHECKED_OUT]: [],
  [BookingStatus.CANCELLED]: [],
  [BookingStatus.NO_SHOW]: [],
};

export function assertTransition(
  current: BookingStatus,
  next: BookingStatus,
): void {
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    throw new BadRequestException(`No se puede pasar de ${current} a ${next}.`);
  }
}
