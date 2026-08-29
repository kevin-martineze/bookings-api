# Flujo: reportes de rendimiento

De dónde sale cada número de la pantalla de Reportes, y por qué está calculado
así y no de otra forma.

Última actualización: 2026-08-29.

## El ingreso es NETO, sin impuesto

Es la decisión más importante del módulo.

El ITBMS **no es ingreso del hotel**: es plata que se le cobra al huésped para
entregársela a la DGI. Meterla dentro del ingreso infla todos los indicadores un
10% y, peor, hace que el ADR no se pueda comparar con ninguna tarifa publicada —
Julius vería un ADR de $88 sobre una habitación que vende a $80.

El impuesto cobrado se muestra aparte, en una línea propia debajo de las
tarjetas.

## Se prorratea por noche, no se imputa al check-in

Una estadía del 28 de agosto al 2 de septiembre pertenece a los dos meses.
Cargarla entera al mes de llegada infla agosto y vacía septiembre, y es
exactamente la clase de número por el que alguien decide subir las tarifas en el
mes equivocado.

Cada estadía reparte su importe entre sus noches, y el reporte suma sólo las que
caen dentro de la ventana.

**El redondeo se hace una sola vez, al final de cada fila.** Durante la suma se
acumulan fracciones de centavo a propósito: redondear noche por noche desviaría
el total del reporte respecto de la suma de las facturas.

## Los cuatro números

| Indicador | Qué es | Por qué está |
|---|---|---|
| **Ingreso** | Neto del período, contra el período anterior | Lo primero que se mira |
| **Ocupación** | Noches vendidas ÷ noches disponibles | Cuánto del inventario se usó |
| **ADR** | Ingreso neto ÷ noches **vendidas** | A cuánto se vendió lo que se vendió |
| **RevPAR** | Ingreso neto ÷ noches **disponibles** | El que no se puede maquillar |

El RevPAR está porque los otros tres se pueden mover haciendo trampa: se sube la
ocupación bajando precios, o se sube el ADR vendiendo menos noches. El RevPAR
sólo sube si el conjunto mejora.

## Detalles que cambian el resultado

**El período anterior tiene la misma duración**, pegado al actual. Comparar 30
días contra 28 mostraría una caída que no ocurrió.

**`to` es exclusivo**, igual que un check-out. El panel pide `to = mañana` para
que entre la noche de hoy.

**Sólo cuentan las unidades activas** para las noches disponibles: una habitación
fuera de servicio no es inventario vendible, y contarla hunde la ocupación por
una razón que no es comercial.

⚠️ Se usa el estado `active` de **hoy**, también para períodos pasados. Si una
habitación se saca de servicio, la ocupación histórica se recalcula como si
nunca hubiera existido. Para un hotel de tres habitaciones es aceptable; con más
inventario habría que fechar las bajas.

**Cancelaciones y no-shows no cuentan** — ni en ingreso ni en ocupación. Todo lo
demás sí, incluidas las reservas pendientes: retienen la habitación.

## Quién lo ve

`OWNER` y `MANAGER`. Nada más.

Está restringido en dos lados a propósito:

- **El endpoint** devuelve 403. Es lo que de verdad protege el dato.
- **La página** muestra "esta sección no es para tu rol". Es lo que evita que
  alguien llegue por URL a una pantalla vacía y crea que el hotel no vendió nada.

Ocultar el enlace en el menú nunca fue un control de acceso.

Verificado: recepción pidiendo `/reports/performance` recibe 403, y entrando a
`/admin/reports` ve el mensaje.

## Endpoint

```
GET /orgs/:orgId/properties/:propertyId/reports/performance?from=&to=
```

Devuelve el total, el desglose por tipo de unidad y el desglose por origen de la
reserva. Ventana máxima de 366 noches: más que eso es un volcado, no un reporte.

## Lo que NO tiene, y por qué

- **Costo por canal.** El mock mostraba comisiones de Booking.com y Airbnb. No
  hay integración con portales (está fuera del alcance cotizado) ni modelo de
  comisiones, así que la tabla mostraba plata inventada. En su lugar va el
  origen real de la reserva: sitio propio, cargada por el personal, portal
  externo.
- **Procedencia de los huéspedes.** Requiere un campo `country` en `Guest` y una
  casilla más que recepción tendría que llenar en cada reserva. Es una decisión
  de producto, no algo que se pueda inventar.
- **Exportar a Excel / PDF.** Nadie lo pidió todavía.

## Probar

Como Julius, en `/admin/reports`:

1. Los cuatro indicadores del último mes, con el ITBMS en su línea aparte.
2. La tabla por tipo de unidad ordenada por ingreso.
3. Entrar como recepción a la misma URL → mensaje de sección restringida.
4. Una estadía que cruce el borde del período aporta sólo sus noches de adentro:
   con los datos sembrados, una reserva de 5 noches aporta 2.
