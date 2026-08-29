import { BookingSource, BookingStatus } from '@prisma/client';

/**
 * Agregaciones del período. Funciones puras: reciben las estadías ya traídas y
 * no tocan la base.
 */

export type StayLike = {
  checkIn: Date;
  checkOut: Date;
  status: BookingStatus;
  subtotalMinor: number;
  taxMinor: number;
  unitTypeId: string;
  source: BookingSource;
};

const MS_PER_NIGHT = 24 * 60 * 60 * 1000;

/** Reservas que no ocupan inventario ni generan ingreso. */
export function countsTowardRevenue(stay: StayLike): boolean {
  return (
    stay.status !== BookingStatus.CANCELLED &&
    stay.status !== BookingStatus.NO_SHOW
  );
}

export function nightsBetween(from: Date, to: Date): number {
  return Math.max(
    0,
    Math.round((to.getTime() - from.getTime()) / MS_PER_NIGHT),
  );
}

/**
 * Noches de la estadía que caen dentro de la ventana `[from, to)`.
 *
 * `to` es exclusivo, igual que el check-out: una ventana de "los últimos 30
 * días" termina mañana a la medianoche y no incluye la noche de mañana.
 */
export function nightsInWindow(stay: StayLike, from: Date, to: Date): number {
  const start = stay.checkIn > from ? stay.checkIn : from;
  const end = stay.checkOut < to ? stay.checkOut : to;
  return nightsBetween(start, end);
}

export type Allocation = {
  nights: number;
  /** Ingreso sin impuesto. Fracción de centavo: se redondea al final. */
  netMinor: number;
  taxMinor: number;
};

/**
 * Reparte el importe de una estadía entre sus noches y devuelve sólo la parte
 * que cae en la ventana.
 *
 * Se prorratea por noche y no se imputa todo al check-in porque una estadía a
 * caballo de dos meses pertenece a los dos: cargarla entera al mes de llegada
 * infla un mes y vacía el otro, y es la clase de número por el que alguien
 * decide subir tarifas en el mes equivocado.
 *
 * Acá se acumulan fracciones de centavo a propósito; el redondeo se hace una
 * sola vez sobre el total de cada fila. Redondear noche por noche desviaría el
 * total del reporte respecto de la suma de las facturas.
 */
export function allocate(stay: StayLike, from: Date, to: Date): Allocation {
  const totalNights = nightsBetween(stay.checkIn, stay.checkOut);
  const nights = nightsInWindow(stay, from, to);
  if (totalNights === 0 || nights === 0) {
    return { nights: 0, netMinor: 0, taxMinor: 0 };
  }
  const share = nights / totalNights;
  return {
    nights,
    netMinor: stay.subtotalMinor * share,
    taxMinor: stay.taxMinor * share,
  };
}

/** ADR: ingreso neto por noche vendida. Cero noches vendidas → cero. */
export function adrMinor(netMinor: number, nightsSold: number): number {
  return nightsSold === 0 ? 0 : Math.round(netMinor / nightsSold);
}

/**
 * RevPAR: ingreso por habitación disponible, vendida o no.
 *
 * Es el número que no se puede maquillar. Se puede subir la ocupación bajando
 * precios, o subir el ADR vendiendo menos; el RevPAR sólo sube si el conjunto
 * mejora.
 */
export function revparMinor(netMinor: number, nightsAvailable: number): number {
  return nightsAvailable === 0 ? 0 : Math.round(netMinor / nightsAvailable);
}

export function occupancyRate(
  nightsSold: number,
  nightsAvailable: number,
): number {
  return nightsAvailable === 0 ? 0 : nightsSold / nightsAvailable;
}
