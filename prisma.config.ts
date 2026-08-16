import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Configuración de las herramientas de Prisma (migrate, introspect, studio).
 *
 * Apunta a `DIRECT_URL`, la conexión sin pooler. Varios Postgres gestionados
 * sirven la aplicación por un pooler en modo transacción que no soporta las
 * sentencias que usa migrate; cuando el proveedor no distingue, ambas variables
 * llevan la misma URL. La aplicación se conecta aparte, por el adapter en
 * src/prisma/prisma.service.ts.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DIRECT_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
  },
});
