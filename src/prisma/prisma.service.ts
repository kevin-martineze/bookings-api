import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Cliente de base de datos.
 *
 * Se conecta por `DATABASE_URL`. Las migraciones usan `DIRECT_URL` y se
 * configuran aparte, en prisma.config.ts — mezclarlas hace que `migrate` falle
 * con errores poco descriptivos sobre sentencias preparadas cuando hay un
 * pooler en medio.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'Falta DATABASE_URL. Copia .env.example a .env y complétalo.',
      );
    }

    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conectado a Postgres');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/**
 * Códigos de error que la API traduce a respuestas HTTP en vez de dejar
 * escapar como 500.
 *
 * OJO con la trampa: con el driver adapter (`@prisma/adapter-pg`), el
 * `error.code` de un `PrismaClientKnownRequestError` es el código PROPIO de
 * Prisma (`P2002`, `P2004`...), NO el SQLSTATE crudo de Postgres. El SQLSTATE
 * real queda anidado más adentro, en
 * `error.meta.driverAdapterError.cause.originalCode` — confirmado
 * empíricamente contra un `P2002` real (violación de `properties_org_id_slug`)
 * en desarrollo. La primera versión de este archivo comparaba contra el
 * SQLSTATE crudo directo en `error.code`, que nunca podía matchear.
 */
const PRISMA_ERROR = {
  UNIQUE_CONSTRAINT: 'P2002',
  /**
   * Bucket genérico para constraints sin código propio (CHECK, EXCLUDE) bajo
   * el client engine runtime de Prisma 7 con driver adapter. La documentación
   * de Prisma habla de `P2004` para esto, pero es de la generación anterior
   * del motor (Rust) — confirmado empíricamente en desarrollo contra un
   * choque real de `bookings_no_overlap` que este motor nuevo devuelve
   * `P2039`, no `P2004`.
   */
  CONSTRAINT_VIOLATION: 'P2039',
} as const;

/** SQLSTATE de Postgres. `23P01` es el que devuelve una restricción de exclusión. */
const PG_SQLSTATE = {
  EXCLUSION_VIOLATION: '23P01',
} as const;

function rawPostgresCode(error: unknown): string | undefined {
  const known = error as {
    meta?: { driverAdapterError?: { cause?: { originalCode?: string } } };
  } | null;
  return known?.meta?.driverAdapterError?.cause?.originalCode;
}

/** Detecta la violación de un `@@unique` (slug repetido, label repetido, etc.). */
export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === PRISMA_ERROR.UNIQUE_CONSTRAINT;
}

/**
 * Detecta el choque de reservas solapadas sobre la misma unidad. No es un
 * fallo del servidor: significa que alguien se adelantó por milisegundos y la
 * unidad ya no está libre. Ver la migración 20260815000001_booking_overlap_guard.
 *
 * `P2039` agrupa VARIAS restricciones del schema (esta, `bookings_positive_stay`,
 * `bookings_total_matches_breakdown`), así que hace falta bajar al SQLSTATE
 * crudo para no confundir "la unidad ya está reservada" con "las fechas están
 * mal". Verificado empíricamente disparando una carrera real (dos creates en
 * paralelo contra la misma unidad): el shape es
 * `{ code: 'P2039', meta: { driverAdapterError: { cause: { originalCode: '23P01' } } } }`.
 */
export function isOverlapConflict(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (code !== PRISMA_ERROR.CONSTRAINT_VIOLATION) return false;
  return rawPostgresCode(error) === PG_SQLSTATE.EXCLUSION_VIOLATION;
}
