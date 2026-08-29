# Flujo: camarería y estados de habitación

Cómo sabe el hotel qué habitación está lista para entregar. Complementa
[`flujo-escritura-reservas.md`](flujo-escritura-reservas.md).

Última actualización: 2026-08-29.

## Qué se guarda y qué se deriva

Es la decisión que sostiene todo lo demás.

| Dato | Dónde vive | Por qué |
|---|---|---|
| Limpieza (`DIRTY` / `CLEAN` / `INSPECTED`) | `units.housekeeping_status` | Nadie más lo sabe. Sólo lo sabe quien entró al cuarto. |
| Ocupación (sale hoy, llega hoy, ocupada) | **No se guarda** | Ya está en las reservas. |
| Fuera de servicio | `units.active` | Ya existía, y es lo que respeta la disponibilidad. |

Guardar la ocupación sería duplicar las reservas: se desactualiza en cuanto
alguien mueve una fecha, y nadie se entera hasta que el pasillo no coincide con
la pantalla.

Por la misma razón **no hay un estado `OUT_OF_SERVICE`**: `active` ya lo dice, y
además saca la habitación de la venta. Dos columnas capaces de afirmar lo mismo
terminan discrepando, y la que discrepe va a ser justo la que no mira quien
asigna la habitación.

## El estado que ve el personal

Se compone en el servidor, por precedencia:

```
¿inactiva?        → bloqueada
¿sale alguien hoy? → sale hoy
¿hay huésped dentro? → ocupada
¿llega alguien hoy? → llega hoy
si no              → libre y limpia / libre y por limpiar
```

"Sale hoy" gana sobre "llega hoy" a propósito: cuando una habitación se desocupa
y se vuelve a vender el mismo día, el trabajo urgente es la salida.

## El check-out ensucia la habitación solo

Es la única automatización del módulo, y va **en la misma transacción** que el
cambio de estado de la reserva.

Evita el error más caro de recepción: vender una habitación que nadie limpió. El
personal puede corregirlo a mano después; lo que no puede es acordarse siempre.

Si fueran dos operaciones separadas y la segunda fallara, el sistema afirmaría
que la habitación está limpia porque se cayó un `UPDATE`. Por eso van juntas.

## Prioridad alta: sólo cuando hay hora límite

Dos casos, y sólo dos:

1. **Rotación el mismo día** — sale un huésped y entra otro. Entre el check-out
   de las 11:00 y el check-in de las 15:00 hay cuatro horas, y es lo único del
   turno que no se puede correr para más tarde.
2. **Llega alguien a una habitación sucia** — ya se vendió y el huésped está en
   camino.

Marcar como urgente todo lo que se pueda enseña al personal a ignorar la marca.

## La bitácora

Cada cambio de estado deja una fila en `housekeeping_events`: de qué estado, a
cuál, quién y cuándo. Es append-only.

Existe por dos razones concretas:

- **"¿Quién limpió la 302 ayer?"** es una pregunta real cuando un huésped se
  queja, y el estado actual de la unidad no puede responderla.
- **El progreso del turno.** El denominador sale de la bitácora: lo que falta
  (sucias ahora) más lo que ya se hizo (eventos de hoy). Sin ella, marcar una
  habitación limpia la sacaría del total y el progreso diría siempre 100%.

Reasignar a otra persona o corregir una nota **no** genera evento: no es un
hecho que haya que auditar.

## Quién puede hacer qué

| Acción | Quién |
|---|---|
| Ver el tablero | Cualquier miembro, camarería incluida |
| Marcar limpia / sucia / inspeccionada | Cualquier miembro, camarería incluida |
| Asignar una habitación | Cualquier miembro |
| Check-in / check-out | OWNER, MANAGER, FRONT_DESK — **camarería no** |

Que camarería pueda marcar es deliberado: un tablero que la camarera ve pero no
puede tocar obliga a pedirle a recepción que lo marque por ella, y entonces no lo
marca nadie. Verificado: con las credenciales de camarería, el check-out
responde 403.

⚠️ **La restricción es por endpoint, no por página.** Camarería no ve los enlaces
al resto del panel, pero si escribe la URL entra. Falta el bloqueo por rol a
nivel de página — está en `TASKS.md`.

## La pantalla

Pensada para un celular sostenido con una mano en el pasillo: tarjetas altas, una
sola acción principal por tarjeta y ningún menú anidado. La acción que se ofrece
depende del estado — sucia ofrece "marcar limpia", limpia ofrece "inspeccionada".

**No hay estado local de "ya la limpié".** Todo viene del servidor y todo vuelve
al servidor. Si la pantalla dijera que está limpia y la base no, recepción
entregaría una habitación sucia — es exactamente el bug que tenían los botones de
check-in antes de conectarlos.

## Endpoints

| Endpoint | Para qué |
|---|---|
| `GET .../housekeeping?date=` | El tablero del día |
| `PATCH .../housekeeping/units/:unitId` | Estado, nota y asignación |
| `GET .../housekeeping/units/:unitId/history` | La bitácora de esa habitación |

`date` lo manda el cliente. La API corre en UTC y no sabe en qué día está quien
mira la pantalla; en Panamá (UTC-5) eso son cinco horas mostrando el turno
equivocado.

## Probar

Con el seed corrido, entrando como `camareria@daughtersofsun.test`:

1. El tablero muestra la 102 sucia con su nota de mantenimiento, la 101 con
   llegada de hoy y la 201 ocupada.
2. Marcar la 102 limpia: sube el progreso y la tarjeta baja al final.
3. Intentar un check-out con ese usuario → 403.
4. Entrar como recepción, hacer el check-out de una estadía y volver al tablero:
   esa habitación aparece sucia sin que nadie la tocara.
5. `GET .../history` de esa unidad muestra las dos transiciones con su autor.

## Lo que falta

- **Bloqueo por rol a nivel de página**, no sólo por endpoint.
- **Fuera de servicio desde el tablero.** Hoy `active` se cambia por el CRUD de
  unidades; camarería no lo puede marcar desde acá.
- **Editar la nota desde la pantalla.** Se lee, no se escribe.
- **Turnos.** La asignación es del día y se reescribe; no hay noción de turno de
  mañana y de tarde.
