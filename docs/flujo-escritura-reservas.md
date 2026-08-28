# Flujo: escribir reservas desde el panel

Cómo recepción carga una reserva y mueve su estado (entrada, salida,
cancelación) desde el PMS. Complementa
[`flujo-sesion-y-panel.md`](flujo-sesion-y-panel.md), que cubre la lectura.

Última actualización: 2026-08-28.

## El mapa

```
botón → server action → bookings-api → Postgres
          (lee cookie)   (guards + reglas)   (exclusion constraint)
            ↓
      revalidatePath → las pantallas vuelven a pedir datos
```

## 1. Por qué server actions

Las escrituras viven en `src/lib/bookings/actions.ts` con `"use server"`. Dos
razones:

- El token está en una cookie **httpOnly**, que sólo el servidor puede leer. Una
  action corre en el servidor: llama a la API sin exponer nada al navegador.
- Después de escribir, `revalidatePath("/[lang]/admin", "layout")` invalida el
  panel entero. Se invalida todo y no sólo la pantalla actual porque **una
  entrada registrada cambia tres pantallas a la vez**: el dashboard, el
  calendario y la lista.

## 2. Los errores se devuelven, no se lanzan

Cada action devuelve `{ ok: true }` o `{ ok: false, error }`.

Esto es deliberado. La API responde con casos de negocio legítimos que recepción
necesita leer:

| Respuesta | Qué significa para recepción |
|---|---|
| `409` al crear | No hay habitaciones libres de ese tipo en esas fechas |
| `409` en carrera | Alguien tomó esa habitación en el mismo instante |
| `400` transición | La reserva ya está en un estado que no admite esa acción |
| `400` capacidad | Pidieron más huéspedes de los que entran |

Si se dejaran explotar como excepción, todas terminarían en la misma pantalla
de error genérica — justo la información que no sirve con un huésped esperando
en el mostrador.

## 3. Registrar entrada y salida

`today-lists.tsx`, en el dashboard.

**Antes esto era una mentira**: el botón guardaba el resultado en un `useState`
local y mostraba un toast de éxito sin llamar a nada. Mientras todo alrededor
era una maqueta, era inofensivo. Cuando el resto pasó a ser real, se volvió
peligroso: recepción daría por registrada una entrada que la base no tiene, y
el huésped figuraría como no llegado con la llave en la mano.

Ahora:
- el botón llama a la action dentro de un `useTransition` y se deshabilita
  mientras corre;
- el toast de éxito sale **después** de que la API confirmó;
- si falla, muestra el mensaje real del servidor;
- **el estado que se ve viene del servidor**, no de un estado local. Si la
  escritura falla, la fila no puede quedar marcada como hecha.

Camarería no ve estos botones (`useRole()`). La API igual lo rechaza con 403 —
ocultarlos es para no ofrecer lo que no se puede hacer.

## 4. Cargar una reserva

`new-booking-dialog.tsx`, desde la pantalla de Reservas.

**No se elige habitación, se elige tipo.** El servidor asigna una unidad libre.
Es la regla que el schema documenta desde el primer commit: un hotel no vende
"la 302", vende "habitación doble". Dejar que recepción fije la habitación a
mano reintroduce el problema que la asignación automática resuelve.

**Disponibilidad en vivo:** al cambiar tipo o fechas se consulta
`GET .../availability` y se muestra "1 de 2 habitaciones libres en esas fechas".
Es el dato que recepción necesita con el huésped enfrente, y evita llenar el
formulario entero para chocar con un rechazo al final.

Esa consulta es **informativa, no una reserva**. Entre consultar y guardar puede
entrar otra reserva — y esa ventana no la cierra la pantalla, la cierra la
restricción de exclusión en la base. Por eso `createBooking` igual maneja el
409.

Detalle de implementación: el resultado se guarda junto con la clave de la
consulta que lo produjo (`tipo|entrada|salida`) y el render sólo lo muestra si
esa clave sigue siendo la actual. Así una respuesta lenta de una consulta vieja
no pisa a la nueva, y "consultando…" se **deriva** de no tener respuesta fresca
en vez de ser otro estado que mantener en sincronía.

## 5. Acciones desde el calendario

El panel lateral del tape chart ofrece **sólo lo que la máquina de estados
permite desde el estado actual**:

| Estado | Botones |
|---|---|
| `confirmed` | Cancelar · Registrar entrada |
| `in-house` | Registrar salida |
| `checked-out`, `cancelled`, `no-show` | ninguno |

No se ofrecen acciones que la API va a rechazar. La máquina de estados vive en
`src/bookings/bookings.util.ts` del backend (`assertTransition`) y es la
autoridad; la UI la refleja.

## 6. Datos de desarrollo alrededor de hoy

`prisma/seed.ts` crea tres reservas **relativas a hoy**: una que llega hoy, una
que sale hoy y una en curso. Sin eso el dashboard muestra cero llegadas y cero
salidas, y no hay nada que probar ni que mostrarle al cliente. Con fechas fijas,
la demo se vería rota tres semanas después de escribirla.

**Trampa de zona horaria (ya nos mordió):** "hoy" se toma del calendario
**local**, y recién después se fija a medianoche UTC para guardarlo como fecha
pura. En Panamá (UTC-5), a las 9 de la noche el día UTC ya cambió: un seed
basado en UTC crea la llegada "de hoy" para mañana, y el panel —que usa la
fecha local— muestra cero llegadas.

El seed hace `upsert` por referencia, así que volver a correrlo reajusta las
fechas a hoy en vez de dejar las de la corrida anterior.

## Probar el flujo

Con ambos servidores arriba y `pnpm run seed` corrido:

1. **Dashboard** → "Registrar entrada" sobre la llegada del día.
2. **Recargar la página.** Si sigue marcada como registrada, se persistió; si
   se desmarca, sólo se había pintado. Ésa es la prueba, no el toast.
3. Confirmar el estado también en Swagger (`/docs`): es la verificación de que
   la escritura llegó a la base.
4. **Reservas → Nueva reserva**: cambiar fechas y ver el conteo de
   disponibilidad moverse. Agotar el tipo y confirmar que rechaza con un
   mensaje legible.
5. **Calendario** → abrir una reserva confirmada → Cancelar. La barra
   desaparece de la cinta y esa habitación vuelve a estar disponible.
