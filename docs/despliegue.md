# Despliegue

Qué hace falta para poner el sistema en producción, en orden. Escrito para
seguirlo el día que existan las cuentas a nombre de Julius.

Última actualización: 2026-08-29.

## Antes de empezar: lo que no es código

Nada de esto se puede adelantar programando, y todo bloquea al resto.

- [ ] **Cuentas a nombre de Julius**, no tuyas: base de datos, hosting del
      backend, hosting del panel, correo del dominio. El sistema es de él; si
      las cuentas quedan a tu nombre, cualquier problema futuro pasa por vos y
      cobrar el mantenimiento se vuelve incómodo.
- [ ] **Dominio registrado.**
- [ ] **Inventario real**: habitaciones, tipos, capacidades y tarifas.

## Orden

Cada paso depende del anterior.

```
1. Base de datos   → da la cadena de conexión
2. Backend         → necesita la base, da la URL de la API
3. Panel           → necesita la URL de la API
4. Datos reales    → necesita el backend en pie
```

## 1. Base de datos

Postgres gestionado. En desarrollo usamos **Neon**, que sirve igual para
producción; Railway, Render o Supabase también.

Requisito que no es negociable: **Postgres**, no otro motor. La garantía
anti-doble-reserva es una restricción de exclusión de Postgres
(`EXCLUDE USING gist`), y ningún motor de documentos tiene equivalente. Ver
[`flujo-escritura-reservas.md`](flujo-escritura-reservas.md).

Dos URLs, y no son intercambiables:

| Variable | Cuál | Por qué |
|---|---|---|
| `DATABASE_URL` | La del **pooler** | La usa la aplicación |
| `DIRECT_URL` | **Sin** pooler | Las migraciones: un pooler en modo transacción rompe `prisma migrate` |

Si el proveedor no distingue, se repite la misma en las dos.

## 2. Backend

Cualquier hosting que corra Node. Railway y Render tienen plan gratuito
suficiente para empezar; una VPS también sirve.

```bash
pnpm install --frozen-lockfile
pnpm exec prisma migrate deploy   # NO `migrate dev`: en producción no se generan migraciones
pnpm run build
node dist/main.js
```

Variables de entorno — la lista completa está en
[`.env.example`](../.env.example):

| Variable | Valor en producción |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Del paso 1 |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | **Distintos entre sí**, generados con `openssl rand -base64 48` |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | `15m` / `30d` |
| `CORS_ORIGINS` | El dominio del panel y el del sitio. **Sin `localhost`** |
| `NODE_ENV` | `production` |
| `PORT` | Lo que exija el hosting |

Los secretos de JWT son distintos a propósito: si se filtra el de acceso, no
debe servir para forjar un refresh.

`NODE_ENV=production` además **apaga Swagger**. La documentación interactiva de
la API no tiene por qué estar abierta en internet.

### Chequeo de salud

`GET /health` responde `200` con la latencia de la base, o `503` si Postgres no
contesta. Apuntá ahí el monitor de uptime, no a `/`: consulta la base de verdad,
así que detecta el caso que importa —el servidor en pie sin poder atender una
sola reserva— y no sólo que el proceso viva.

## 3. Panel

Next.js. **Vercel** es el camino corto: el repo ya está ahí.

Una sola variable:

```
NEXT_PUBLIC_API_URL=https://api.eldominio.com
```

Ojo con el prefijo `NEXT_PUBLIC_`: esa variable viaja al navegador. Es sólo la
URL pública de la API — ningún secreto lleva ese prefijo, y ninguno debe
llevarlo.

## 4. Cargar los datos reales

En este orden, y con el backend ya en pie:

1. Crear la organización y el usuario OWNER de Julius.
2. Crear el alojamiento, con su `taxRatePct` (10 para Panamá) y su moneda.
3. Cargar tipos de unidad y unidades reales.
4. Cargar las temporadas **desde el panel**, en Tarifas → Nueva temporada.
5. Crear los usuarios del personal con su rol: recepción y camarería.

**No corras `prisma/seed.ts` contra producción.** Crea usuarios con contraseñas
de desarrollo conocidas y borra las reservas cuya referencia empieza con `SEED`.
Es para desarrollo y nada más.

## 5. Antes de dar por bueno el despliegue

- [ ] `GET /health` responde 200
- [ ] Login desde el panel en producción
- [ ] Crear una reserva de prueba y verificar el total con impuesto
- [ ] Check-in y check-out, y que la habitación quede sucia sola
- [ ] Entrar como recepción y confirmar que Reportes queda bloqueado
- [ ] Abrir el panel en un teléfono real, no sólo en el simulador
- [ ] Confirmar que `/docs` **no** responde en producción
- [ ] Borrar las reservas de prueba

## Backups

El plan gestionado de Neon incluye restauración a un punto en el tiempo. Hay que
**verificar el plan contratado**: en los planes gratuitos la ventana es corta.

Un hotel que pierde sus reservas pierde el negocio, no un archivo. Antes de la
primera reserva real conviene además un volcado periódico a otro lado:

```bash
pg_dump "$DATABASE_URL" > backup-$(date +%F).sql
```

- [ ] Confirmar la ventana de restauración del plan
- [ ] Programar un volcado semanal fuera del proveedor
- [ ] **Probar una restauración** — un backup que nunca se restauró no es un
      backup, es una suposición

## Monitoreo de errores

Todavía no hay nada instalado. Sentry tiene plan gratuito y SDK para Nest y para
Next. Sin esto, el primer aviso de que algo falla en producción va a ser Julius
por WhatsApp.

## Lo que queda pendiente

- [ ] Elegir hosting y crear las cuentas a nombre de Julius
- [ ] Registrar el dominio
- [ ] Conectar Sentry en los dos proyectos
- [ ] Correos transaccionales (falta el proveedor y el dominio verificado)
