# Flujo: reserva desde el sitio del huésped

Cómo llega una reserva desde el sitio público hasta el panel, sin pagos.

Última actualización: 2026-08-29.

## El circuito

```
Huésped en el sitio          API pública            Panel del hotel
─────────────────────────────────────────────────────────────────────
elige fechas         →  disponibilidad + precio
elige habitación
deja sus datos       →  crea reserva PENDING   →  recepción la ve
                        con retención de 48 h      y la acepta
                                                →  CONFIRMED
```

**No confirma nada por sí solo, y el sitio lo dice.** Sin pagos conectados, lo
que el formulario produce es una *solicitud*. Quien decide es el hotel. Un
formulario que dijera "reserva confirmada" dejaría a alguien viajando a Chiriquí
con una habitación que nadie le apartó.

## Por qué la retención de 48 horas

Una reserva `PENDING` **retiene inventario de verdad**: la restricción de
exclusión de la base la cuenta igual que una confirmada. Sin vencimiento, un
formulario enviado y abandonado bloquea una habitación para siempre, y no hace
falta mala intención para que pase.

Al aceptar, `holdExpiresAt` se limpia: la retención existe mientras nadie
decide, y una vez confirmada ya no vence.

⚠️ Las retenciones vencidas se liberan con un **barrido perezoso**, cuando
alguien consulta disponibilidad o reserva. Lo correcto es un job programado; sin
él, una habitación puede quedar retenida más de 48 h si nadie mira. Está anotado
en `TASKS.md`.

## Es el único rincón sin autenticación

Todo lo demás del sistema exige `JwtAuthGuard` **y** membresía en la
organización. Este módulo no, porque un huésped no tiene cuenta. Todo lo demás
del diseño sale de ahí:

| Decisión | Por qué |
|---|---|
| Devuelve **tipos**, nunca unidades físicas | Cuántas habitaciones hay y cuáles están libres le dice a cualquiera qué tan lleno está el hotel |
| No expone `unitsAvailable`, sólo sí/no | "Queda 1" es un dato de ocupación, y además es urgencia falsa |
| El **precio lo calcula el servidor**, siempre | Si viniera del formulario, cualquiera reservaría a un dólar |
| El DTO no acepta importes ni unidad | Lo que no se acepta no se puede manipular |
| Todos los campos de texto con largo máximo | Un campo abierto sin autenticar es una invitación a llenar la base |
| Máximo 30 noches | Frena que una petición bloquee una habitación un año |
| Rechaza fechas pasadas | No es un error de huésped: es un bot |
| Límite por IP | 30 consultas/min, y las reservas por `PUBLIC_BOOKING_LIMIT_PER_HOUR` (5 en producción) |

### El detalle que más fácil se pasa por alto

`findOrCreateGuest` **no actualiza** la ficha de un huésped existente, a
diferencia de la carga por personal. Si actualizara, cualquiera que conozca el
correo de un huésped podría reescribirle nombre y teléfono en la ficha del hotel
enviando una reserva. Los datos que trae la solicitud quedan en la reserva; la
ficha sólo la toca alguien autenticado.

### Detrás de un proxy

`app.set('trust proxy', 1)` en `main.ts`. Sin eso, el hosting hace que todas las
peticiones lleguen con la IP del proxy y el límite vería a todo internet como un
solo visitante: el primero en reservar consumiría la cuota de todos.

## Endpoints

Bajo `/public`, direccionados por slug —son URLs que terminan en el sitio, y un
UUID ahí no le sirve a nadie:

| Endpoint | Para qué |
|---|---|
| `GET /public/orgs/:orgSlug/properties/:propertySlug` | Alojamiento y tipos vendibles |
| `GET .../availability?checkIn=&checkOut=&guests=` | Qué hay libre y a qué precio, en una llamada |
| `POST .../bookings` | Crea la solicitud, devuelve la referencia |

La disponibilidad y el precio van juntos porque el sitio necesita ambos para
pintar una tarjeta; separarlos obligaría a una llamada por tipo.

Cuando la cotización falla por reglas de venta —mínimo de noches, fechas
cerradas— eso **no es un error**: es un "no se vende así". La respuesta trae
`unavailableReason` para que el sitio lo explique en vez de mostrar una tarjeta
rota.

## Del lado del hotel

La solicitud aparece en el panel como **"Por confirmar"**. Al abrirla, recepción
tiene *Aceptar solicitud* y *Cancelar reserva* — y sólo esas dos, porque son las
únicas transiciones que la máquina de estados permite desde `PENDING`.

`POST .../bookings/:id/confirm` se agregó junto con esto: la máquina de estados
modelaba `PENDING → CONFIRMED` desde el principio, pero no existía el endpoint.
Sin él, las solicitudes del sitio quedaban atascadas.

## Lo que falta, y es importante

- **Correo de confirmación.** Hoy el huésped ve su referencia en pantalla y no
  recibe nada más. Si cierra la pestaña, no le queda registro. Necesita
  proveedor y dominio verificado.
- **Aviso al hotel.** Nadie se entera de que entró una solicitud salvo que abra
  el panel. Con 48 h de retención, alcanza; con pagos, no.
- **Job que libere retenciones vencidas**, en vez del barrido perezoso.
- **Contenido real.** El sitio muestra fotos y descripciones de demostración; el
  formulario vende los tipos reales. Depende de Julius.
- **Pagos.** Bloqueado por el papeleo bancario.

## Probar

Con el seed corrido, sin ninguna credencial:

1. `http://localhost:3001/es/book?checkIn=…&checkOut=…&guests=2` muestra los
   tipos reales con precio e ITBMS desglosado.
2. Completar y enviar → pantalla de "Recibimos tu solicitud" con referencia.
3. Entrar al panel como recepción: la reserva aparece como "Por confirmar".
4. Abrirla en el calendario → *Aceptar solicitud* → pasa a confirmada.
5. Mandar el precio en el cuerpo del POST → se ignora y se cobra el real.
6. Reservar seis veces seguidas → la sexta responde 429.
