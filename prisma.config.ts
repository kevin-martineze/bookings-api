import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Configuración de las herramientas de Prisma (migrate, introspect, studio).
 *
 * Ojo con cuál URL va aquí: `prisma migrate` usa sentencias que el pooler de
 * Supabase no soporta, así que esto apunta a la conexión DIRECTA. La aplicación
 * en cambio se conecta por el pooler, y esa URL se pasa al adapter en
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
