# Flujo: cómo se calcula el precio de una estadía

De dónde sale el número que paga el huésped. Complementa
[`flujo-escritura-reservas.md`](flujo-escritura-reservas.md).

Última actualización: 2026-08-28.

## El orden de decisión

Para **cada noche** de la estadía, por separado:

```
¿hay un plan que cubra esta fecha?
├── no  → tarifa base del tipo de unidad
└── sí  → ¿el plan está cerrado?
          ├── sí → esa noche NO se vende (400)
          └── no → ¿es viernes o sábado Y el plan define precio de fin de semana?
                   ├── sí → precio de fin de semana
                   └── no → precio del plan
```

Al final: `subtotal` = suma de las noches, `impuesto` = subtotal × tasa de la
propiedad, `total` = subtotal + impuesto.

## Por qué noche por noche y no un promedio

Quien llega el viernes y se va el lunes paga **tres tarifas distintas**. Un
total que no las explica es la principal fuente de disputas en recepción, y
`GET .../quote` devuelve el desglose completo para que se pueda mostrar.

## Cuando dos planes se pisan: gana el más específico

Criterio: **el de rango más corto**, y ante empate el de inicio más reciente.

Así una semana de Navidad puede sobrescribir a "temporada alta" sin borrarla ni
partirla en tres planes. Sin una regla explícita, dos planes solapados darían un
precio que depende del orden en que Postgres los devuelva — es decir, un precio
aleatorio.

Ejemplo con los datos sembrados:

| Fecha | Planes que la cubren | Gana | Precio |
|---|---|---|---|
| 20 dic | Temporada alta (dic 15 – abr 15) | Temporada alta | $110 |
| 29 dic | Temporada alta **y** Fin de año (dic 28 – ene 2) | **Fin de año** (más corto) | $180 |
| 9 ene (vie) | Temporada alta | Temporada alta, precio de finde | $140 |

## Fin de semana = viernes y sábado

Es la noche que se vende cara en un hotel de playa con sports bar. **El domingo
queda afuera a propósito**: esa noche la gente se vuelve a casa.

⚠️ **Pendiente de confirmar con Julius.** Está en su lista de tareas ("pedir las
tarifas: alta, baja, fin de semana"). Si para él el domingo también es fin de
semana, se cambia en `isWeekendNight` (`src/pricing/pricing.util.ts`) y en
ningún otro lado. Ojo que el mock del frontend (`isWeekend` en `lib/format.ts`)
sí cuenta el domingo, pero eso sólo sombrea celdas — los precios los calcula
siempre el backend.

## El impuesto

ITBMS de hospedaje, **10%**, guardado como `properties.tax_rate_pct` y no como
constante en el código: si la tasa cambia, o entra un alojamiento con otro
tratamiento fiscal, es un UPDATE y no un despliegue.

Las tarifas se publican **sin impuesto** y este se suma al cotizar. Por eso
`Booking` guarda `subtotalMinor`, `taxMinor` y `totalMinor` por separado, y la
base tiene una restricción CHECK que exige que cuadren: si el motor y el schema
alguna vez discrepan, el INSERT falla en vez de guardar una factura mal sumada.

El redondeo al centavo se hace **una sola vez**, sobre el subtotal entero.
Redondear noche por noche acumula el error y el total deja de coincidir con la
suma que el huésped ve.

## Reglas que el motor hace cumplir

No sólo calcula: rechaza.

| Regla | Qué pasa |
|---|---|
| Noche dentro de un plan `closed` | 400 nombrando la fecha |
| Estadía más corta que `minNights` | 400 con el mínimo exigido |
| Salida anterior o igual a la entrada | 400 |

`minNights` lo fija **el plan que cubre la noche de entrada** — es el que define
la temporada en la que el huésped llega. Si ese plan no lo especifica, vale el
del tipo de unidad.

## Dónde vive cada cosa

| Archivo | Qué hace |
|---|---|
| `src/pricing/pricing.util.ts` | El motor. Funciones puras, sin base de datos. |
| `src/pricing/pricing.service.ts` | Trae los planes y llama al motor. Única puerta al cálculo. |
| `src/pricing/pricing.controller.ts` | `rate-plans`, `quote`, `rate-calendar`. |
| `src/bookings/bookings.service.ts` | Al crear, pide la cotización y congela el desglose. |

**Una sola implementación.** La creación de reservas y la vista previa pasan por
el mismo `PricingService.quote`. Dos implementaciones del mismo desglose
terminan discrepando en un centavo, y ese centavo aparece entre lo que el
huésped vio al reservar y lo que dice su factura.

## Precios congelados

El desglose se guarda **en la reserva**. Cambiar una tarifa hoy no altera lo que
se le cobró a alguien el mes pasado: un precio cobrado es un hecho histórico, no
un cálculo que se rehace.

## Endpoints

| Endpoint | Para qué |
|---|---|
| `GET/POST/PATCH .../unit-types/:id/rate-plans` | Administrar temporadas (escritura: OWNER/MANAGER) |
| `GET .../unit-types/:id/quote?checkIn=&checkOut=` | Vista previa del desglose sin reservar |
| `GET .../rate-calendar?from=&to=` | Precio por tipo y fecha — lo que dibuja la pantalla de Tarifas |

`rate-calendar` existe para no pedir 28 días × cada tipo con una llamada por
celda: serían cientos de consultas para una sola pantalla.

## Probar

Con el seed corrido, en Swagger (`/docs`):

1. `GET .../quote` sobre un rango de lunes a miércoles → todas las noches a la
   misma tarifa.
2. El mismo rango pero de viernes a domingo → las dos primeras noches más caras.
3. Un rango en `2026-12-29` → $180 la noche: el plan "Fin de año" gana sobre
   "Temporada alta".
4. Una sola noche en ese rango → 400, exige mínimo 3 noches.
5. Crear una reserva de fin de semana y otra entre semana con la misma cantidad
   de noches: la de fin de semana tiene un total mayor.

En el panel, **Tarifas** muestra el mapa de las próximas cuatro semanas: los
viernes y sábados se ven más oscuros, y las noches cerradas aparecen con trama y
un guion.

## Lo que falta

- **Editar tarifas desde la pantalla.** Hoy se cargan por API o seed; la pantalla
  es de sólo lectura.
- **Cargos extra** (`feesMinor`) — el campo existe y se guarda en cero. La
  limpieza de las casas iría acá.
- **Descuento por canal propio.** El frontend lo modela en `lib/quote.ts` (7%),
  el backend todavía no.
