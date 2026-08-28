# Flujo: sesión del panel y lectura de datos

Cómo entra un miembro del personal al PMS y cómo llegan los datos reales a la
pantalla. Cubre los dos repos: `bookings-api` (NestJS) y `pms-frontend`
(Next.js).

Última actualización: 2026-08-28.

## El mapa en una línea

```
navegador → Next Route Handler → bookings-api → Postgres
             (guarda cookie)      (valida JWT + Membership)
```

El navegador **nunca** habla directo con `bookings-api`. Todo pasa por Next,
que es quien tiene el token.

---

## 1. Login

1. `AdminLoginScreen` (cliente) hace `POST /api/session` con correo y
   contraseña. No llama a la API del hotel: llama a su propio servidor.
2. `src/app/api/session/route.ts` (Route Handler de Next) recibe eso y llama a
   `POST /auth/login` de bookings-api.
3. `AuthService.login` (`src/auth/auth.service.ts`):
   - busca el usuario por correo, normalizado a minúsculas;
   - si la cuenta está bloqueada (`lockedUntil` en el futuro), corta;
   - verifica la contraseña con argon2id;
   - si falla, suma un intento fallido y **bloquea 15 minutos al quinto**;
   - si acierta, resetea el contador y emite el par de tokens.
4. El Route Handler guarda ambos tokens en cookies **httpOnly**
   (`dos_access`, `dos_refresh`) y devuelve el usuario.
5. El cliente hace `router.refresh()`. El layout vuelve a renderizarse en el
   servidor, ahora con cookie, y muestra el panel.

**Por qué el rodeo por Next y no un fetch directo:** una cookie httpOnly no la
puede leer el JavaScript de la página. Eso saca el token del alcance de
cualquier XSS. Si el navegador llamara directo a la API, el token tendría que
vivir en memoria o en `localStorage`, y ahí sí es robable.

**Por qué cookie y no memoria:** recepción trabaja ocho horas con esta pantalla
abierta. Una sesión que muere al recargar (F5, o un cierre accidental de
pestaña) es inaceptable en un mostrador. Además, las pantallas del panel son
Server Components: el token tiene que estar donde el servidor pueda leerlo.

## 2. Cada pantalla del panel

1. `src/app/[lang]/admin/layout.tsx` (Server Component) llama a `getSession()`.
2. `src/lib/auth/server-session.ts` lee la cookie, llama a `/auth/me` y pide las
   properties de la organización. Devuelve `null` si no hay cookie, si el token
   venció, o si el usuario no tiene ninguna Membership.
   - Está envuelto en `cache()` de React: el layout, el shell y la página la
     piden por separado, y sin eso serían tres viajes a `/auth/me` por pantalla.
3. Sin sesión → el layout renderiza el login y **el HTML del PMS nunca se
   genera**. No hay parpadeo de datos del hotel antes de la pantalla de acceso.
4. Con sesión → renderiza `AdminShell` y la página pedida.

**Ojo con lo que cruza al cliente:** el layout arma un `SessionSummary` a mano
en vez de pasar `session` entero. Todo prop que un Server Component le pasa a un
Client Component se serializa dentro del HTML — pasar la sesión completa metería
el access token en el payload de la página y anularía el sentido de la cookie
httpOnly.

## 3. De dónde salen los datos

`src/lib/api/server.ts` expone las lecturas autenticadas (`getBookings`,
`getUnits`, `getUnitTypes`). Todas van con `cache: "no-store"`: una reserva
creada hace diez segundos tiene que verse.

Del lado de la API, cada request pasa por dos guards en orden:

1. `JwtAuthGuard` — valida la firma del access token.
2. `OrgRolesGuard` (`src/auth/guards/org-roles.guard.ts`) — **consulta la
   tabla `Membership` en cada petición**, no confía en claims del JWT. Así un
   cambio de rol (o un despido) surte efecto en el siguiente request, no en el
   siguiente login.
   - La verificación de membership corre **siempre**; `@Roles(...)` sólo agrega
     una restricción extra encima. Sin eso, una ruta de sólo lectura sin
     `@Roles` dejaría entrar a cualquier usuario autenticado de *cualquier*
     organización.

## 4. Traducción API → pantalla

Las formas del backend y las del dominio del frontend son distintas a
propósito, y `src/lib/bookings/mapper.ts` es el único puente.

| API | Pantalla |
|---|---|
| `status: "CHECKED_IN"` | `status: "in-house"` |
| `unit.label` | `room` |
| `checkIn: "2026-09-10T00:00:00Z"` | `range.checkIn: "2026-09-10"` |
| `totalMinor` + `currency` | `total: Money` |

**La trampa de la fecha:** la API devuelve datetime ISO en UTC aunque en la base
sean fechas puras. El mapper **corta el string** (`slice(0, 10)`) en vez de
pasar por `new Date()`: en Panamá (UTC-5), construir un `Date` desde esa cadena
y formatearlo en local devuelve el día anterior — una noche entera de
diferencia en una reserva.

## 5. Qué NO se muestra, y por qué

Tres columnas salieron de las pantallas: **pago, saldo y canal**.

- `payment` y `balance` salen del modelo `Payment`, que existe en el schema pero
  todavía no tiene endpoints ni un solo registro.
- `channel` (Booking / Airbnb / directo) necesita un desglose por OTA; el
  backend sólo guarda `source` (`DIRECT` / `STAFF` / `CHANNEL`), y la
  sincronización con plataformas está fuera del alcance cotizado.

Por eso en el tipo `Reservation` son **opcionales** y no campos con valor de
relleno: así TypeScript obliga a cada pantalla a decidir qué hacer cuando
faltan. Un badge que dice "sin pagar" cuando en realidad significa "no sabemos"
hace que recepción cobre dos veces.

## 6. Qué alojamiento muestra el panel

`getSession()` toma **el primero** de las properties de la organización, y
`PropertiesService.findAll` las ordena por antigüedad (`createdAt`), no
alfabéticamente. Con orden alfabético, dar de alta "Casa Playa" haría que el
panel dejara de mostrar el hotel principal sin que nadie tocara nada — pasó de
verdad durante el desarrollo y se veía como "no hay reservas".

Por eso además **el header muestra el nombre del alojamiento**: ver "no hay
reservas" sin saber de qué alojamiento se habla es indistinguible de estar
mirando el equivocado.

**Pendiente:** cuando entren las casas hace falta un selector de alojamiento en
el shell. Hoy no existe.

## 7. Logout

`AdminShell` hace `DELETE /api/session`. El Route Handler llama a
`/auth/logout` de la API para **revocar la familia entera de refresh tokens** y
después borra las cookies. Revocar del lado del servidor importa: un refresh
token vivo en la base es una sesión abierta aunque el navegador ya no la tenga.

## Probar el flujo

```bash
# API (puerto 3000)
pnpm run start:dev
# Panel (puerto 3001 — el 3000 lo ocupa la API)
pnpm exec next dev -p 3001
```

- `http://localhost:3000/docs` — Swagger. Login, copiar el `accessToken`,
  pegarlo en **Authorize**, y probar cualquier endpoint.
- `http://localhost:3001/en/admin` — el panel. Credenciales de desarrollo en
  `prisma/seed.ts`.
- **La prueba de que la sesión funciona es recargar con F5 y seguir adentro.**
