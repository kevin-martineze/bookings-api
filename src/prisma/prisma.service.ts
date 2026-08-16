import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('Falta DATABASE_URL. Copia .env.example a .env y complétalo.');
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
 * Códigos de error de Postgres que la API traduce a respuestas HTTP en vez de
 * dejar escapar como 500.
 *
 * `23P01` es el que devuelve la restricción de exclusión cuando dos reservas se
 * solapan. No es un fallo del servidor: significa que alguien se adelantó por
 * milisegundos y la unidad ya no está libre. Ver la migración
 * 20260815000001_booking_overlap_guard.
 */
export const PG_ERROR = {
  EXCLUSION_VIOLATION: '23P01',
  UNIQUE_VIOLATION: '23505',
  CHECK_VIOLATION: '23514',
  FOREIGN_KEY_VIOLATION: '23503',
} as const;

/** Detecta el choque de reservas solapadas sobre la misma unidad. */
export function isOverlapConflict(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === PG_ERROR.EXCLUSION_VIOLATION;
}
