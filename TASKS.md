# Daughters of Sun — checklist

Basado en tu lista original (`daughters-of-sun-tareas.txt`). Marcá los `[ ]`
directo en el archivo (clic en la vista previa de Markdown de VS Code, o
editando el texto) — yo voy tildando lo que completamos en cada sesión.
Última actualización: 2026-08-29.

## P0 — bloqueante / urgente

- [ ] **BLOQUEANTE** · Julius: abrir cuenta comercial en Banco General (Yappy)
- [ ] **BLOQUEANTE** · Julius: solicitud de pasarela de tarjeta en Banistmo (Wompi)
- [ ] Cobrar primer pago de $1,040
- [ ] Confirmar con Julius: Daughters of Sun vs Don Julius (arquitectura de marca)
- [ ] Confirmar con Julius: cuántas casas entran en el alcance
- [ ] Preguntar a Julius qué significa "set up a little different"
- [ ] Pedir a Julius la lista de habitaciones: tipos, cantidad, capacidad
- [ ] Pedir a Julius las tarifas: alta, baja, fin de semana
- [ ] Decidir y registrar el dominio
- [ ] Crear cuentas a nombre de Julius: hosting, base de datos, correo
- [ ] Revertir o terminar la sección "Read this first" de /proposal
- [ ] Decidir si el repo pms-frontend pasa a privado

## P1 — contenido y marca

- [ ] Definir paleta y tipografía finales con el nombre real
- [ ] Logo o tratamiento tipográfico de Daughters of Sun
- [ ] Recibir de Julius las fotos posteriores al repintado
- [ ] Seleccionar, recortar y optimizar la fotografía
- [ ] Escribir el alt text de todas las fotos
- [ ] Cargar el contenido real de las unidades: nombres, descripciones, capacidades
- [ ] Traducir el contenido de las unidades al inglés
- [ ] Redactar políticas, FAQ, cómo llegar y accesibilidad reales

## P2 — backend

- [x] Esquema de base de datos y migraciones
- [ ] Seeds con el inventario real del hotel _(el seed de desarrollo ya crea inventario y reservas relativas a hoy; falta el inventario real de Julius — depende de un ítem P0)_
- [x] Auth: login, sesiones y **recuperación de contraseña** _(por correo con token de un solo uso, y desde gerencia con contraseña temporal. Al restablecer se cierran todas las sesiones abiertas)_
- [x] **Gestión del equipo**: crear, cambiar de rol y sacar personal desde el panel _(la contraseña temporal la genera el servidor y se muestra una sola vez)_
- [x] **Gestión de inventario**: tipos y habitaciones desde el panel, con borrado protegido por reservas
- [x] **Editar reservas**: fechas, huéspedes, habitación y notas, con recotización automática
- [x] Roles y permisos: propietario, gerencia, recepción, camarería
- [x] Motor de disponibilidad en el servidor
- [x] Motor de precios: temporadas, fin de semana y planes tarifarios _(incluye ITBMS 10%, estadía mínima por fecha y cierres de venta → [`docs/flujo-precios.md`](docs/flujo-precios.md))_
- [x] CRUD de reservas y máquina de estados _(carga de staff y **reserva directa del huésped**; el depósito depende de pagos, P3)_
- [x] **API pública para el sitio del huésped** _(el único módulo sin autenticación: devuelve tipos y no unidades, recalcula el precio en el servidor, limita por IP y no deja sobrescribir la ficha de un huésped existente)_
- [x] Job que libere las retenciones vencidas _(cada diez minutos, además del barrido perezoso al consultar disponibilidad)_
- [x] Aviso al hotel cuando entra una solicitud _(contador en el menú, visible desde cualquier pantalla del panel. El aviso por correo o WhatsApp depende del proveedor)_
- [x] Endpoints de camarería y estados de habitación _(estado de limpieza por unidad, tablero del día con ocupación derivada, bitácora de quién cambió qué, y el check-out ensucia la habitación solo → [`docs/flujo-camareria.md`](docs/flujo-camareria.md))_
- [x] Endpoints de tarifas y temporadas _(CRUD de planes, cotización y calendario de tarifas)_
- [x] Endpoints de reportes y agregaciones _(ingreso neto sin ITBMS, ocupación, ADR y RevPAR, con prorrateo por noche y desglose por tipo de unidad y origen → [`docs/flujo-reportes.md`](docs/flujo-reportes.md))_
- [ ] Correos transaccionales: confirmación, recordatorio, cancelación
- [ ] Notificaciones por WhatsApp
- [x] Tests del motor de disponibilidad y de precios _(90 tests en total: solapamiento de fechas, transiciones de estado, el motor de precios completo — fin de semana, plan más específico, mínimos, cierres, cuadre del impuesto — la derivación de estados de camarería y las agregaciones de reportes)_
- [ ] Desplegar el backend con sus variables de entorno _(**preparado, no ejecutado**: pasos, variables y verificación en [`docs/despliegue.md`](docs/despliegue.md); `GET /health` consulta la base y devuelve 503 si no responde. Falta crear las cuentas a nombre de Julius — P0)_
- [ ] Backups automáticos y monitoreo de errores _(documentado qué hace falta y por qué; sin proveedor todavía. Sentry sin instalar)_

## P3 — pagos

- [ ] Integrar el Botón de Pago Yappy (SDK de Node)
- [ ] Integrar la pasarela de tarjeta (Wompi)
- [ ] Flujo de depósito del 30% y saldo al llegar
- [ ] Webhooks de confirmación de pago
- [ ] Manejo de fallos, reintentos y reembolsos
- [ ] Pruebas de pago de punta a punta con montos reales pequeños

## P4 — integración frontend

- [x] **Conectar el sitio del huésped a la API real** _(el huésped consulta disponibilidad, ve el precio real con ITBMS y envía una solicitud que entra al sistema como `PENDING` con retención de 48 h; recepción la acepta desde el panel → [`docs/flujo-reserva-publica.md`](docs/flujo-reserva-publica.md). Las fotos y textos del sitio siguen siendo de demostración — depende de Julius)_
- [ ] Conectar el checkout a los pagos reales
- [x] **Conectar el PMS completo a la API real** _(hoy, calendario, reservas, tarifas, camarería y reportes: ninguna pantalla del panel lee mocks)_
- [x] Pantallas de login y restricción por rol _(login real con sesión en cookie httpOnly que sobrevive recargas, nav restringido por rol real, y bloqueo por rol **a nivel de página**: quien escriba la URL de una sección que no le toca ve un mensaje explícito)_
- [x] Estados de carga, error y vacío en todas las vistas _(`loading.tsx` con esqueleto y `error.tsx` con reintento a nivel del segmento `/admin`, así cubren toda pantalla del panel; vacíos en tarifas, camarería y reportes)_
- [ ] Revisar el responsive en un móvil real _(verificado en Chromium a 390×844 en las seis pantallas: ninguna desborda horizontalmente. **Falta un teléfono físico** — el táctil, el teclado en pantalla y la barra del navegador no se simulan)_
- [ ] SEO: metadata, sitemap y JSON-LD de Hotel y HotelRoom
- [ ] Rendimiento: LCP bajo 2.5s en portada y ficha de unidad
- [ ] Auditoría de accesibilidad: teclado, foco visible, axe
- [ ] Quitar todos los datos de demostración y el DemoSwitcher _(fuera del panel, que ya no tiene ni un dato falso. Sigue en el sitio del huésped y en `/proposal`, que todavía son material de demostración)_

## P5 — lanzamiento

- [ ] Cargar inventario y tarifas reales en producción
- [ ] Escribir el manual corto para el personal
- [ ] Entrenar al personal (1 de octubre)
- [ ] Reservas de prueba de punta a punta
- [ ] Publicar el sitio en el dominio real
- [ ] Crear el perfil de Google Business del hotel
- [ ] Verificar la indexación en Google Search Console
- [ ] Acompañar las primeras reservas reales

## Extra: trabajo real hecho hoy que no estaba en la lista original

- [x] Endpoints de catálogo (Property/UnitType/Unit) — base necesaria antes de disponibilidad/reservas, no estaba nombrada explícitamente en P2
- [x] Bug real encontrado y corregido: `OrgRolesGuard` dejaba pasar a cualquier usuario autenticado de cualquier organización en rutas sin `@Roles`
- [x] Bug real encontrado y corregido: detección de errores de Prisma comparaba contra el código equivocado, dos veces (`isUniqueViolation` primero, `isOverlapConflict` después — el código real resultó ser `P2039`, ni siquiera el `P2004` que documenta Prisma). Verificado con una carrera real de 3 requests en paralelo: 2×201 + 1×409 limpio, cero 500.
- [x] Fix de layout: scroll del panel admin quedaba en todo el documento en vez de contenerse en `<main>`
- [x] Swagger en `/docs` — estaba como dependencia desde el inicio pero nunca configurado
- [x] Bug real encontrado y corregido: el proxy de i18n redirigía `/api/session` a `/en/api/session` y rompía el login entero
- [x] Bug real encontrado y corregido: el panel elegía alojamiento alfabéticamente, así que crear una property nueva lo hacía mostrar otra en silencio. Ahora ordena por antigüedad y el header dice cuál está mostrando
- [x] Documentar el flujo de sesión y lectura de datos → [`docs/flujo-sesion-y-panel.md`](docs/flujo-sesion-y-panel.md)
- [x] **El panel escribe**: check-in, check-out, cancelar y cargar reservas desde la interfaz, con disponibilidad en vivo → [`docs/flujo-escritura-reservas.md`](docs/flujo-escritura-reservas.md)
- [x] Bug real encontrado y corregido: los botones de check-in/check-out eran falsos — mostraban un toast de éxito sin llamar a nada
- [x] Bug real encontrado y corregido: el seed usaba "hoy" en UTC y el panel la fecha local, así que en Panamá (UTC-5) el dashboard mostraba cero llegadas después de las 7pm
- [x] Pantalla de Tarifas conectada a datos reales _(mapa de 4 semanas + temporadas; **falta poder editarlas desde ahí**)_
- [x] Refactor: se eliminó `nightsBetween` duplicada — el motor de precios cuenta las noches, y dos funciones contando lo mismo terminan discrepando en una factura
- [x] Commitear el trabajo de hoy en ambos repos _(9 commits en bookings-api sobre `feat/api-real-motor-de-precios`, 4 en pms-frontend sobre `feat/panel-sobre-api-real`. **Falta mergear a `main` y publicar** — nada está en GitHub todavía)_
- [x] **Camarería completa**: tablero real en el panel, marcado de limpieza desde el celular, asignación a personal real y bitácora → [`docs/flujo-camareria.md`](docs/flujo-camareria.md)
- [x] Bug real encontrado y corregido: la migración de camarería creaba `created_at` cuando el resto del schema deja `createdAt` sin mapear; el tablero devolvía 500. Migración deshecha y reaplicada corregida.
- [x] **Selector de alojamiento en el panel** _(la elección vive en una cookie y se valida contra los alojamientos de la sesión; con uno solo se muestra como etiqueta, no como menú de un elemento. Verificado con dos alojamientos)_
- [x] **Editor de tarifas en el panel** _(crear, editar y borrar temporadas desde Tarifas, con precio de fin de semana, mínimo de noches y cierre de venta. Se agregó `DELETE` de planes al backend: sin él, un plan cargado con la fecha equivocada quedaba para siempre)_
- [x] `GET /health` que consulta la base _(un chequeo que no la consulta declara sano un servidor que no puede atender una sola reserva)_
- [x] Bug real encontrado y corregido: la página de Tarifas le pasaba **funciones** de formato de un Server Component a uno de cliente, lo que no se puede serializar y tiraba la pantalla entera. Lo detectó la frontera de error recién agregada
- [x] Bug real encontrado y corregido: el panel de Hoy calculaba ADR, RevPAR e ingreso **con** impuesto y Reportes **sin**, así que el mismo hotel mostraba $88 en una pantalla y $80 en la otra
- [x] Bug real encontrado y corregido: la barra lateral seguía avisando que camarería, tarifas y reportes "usan datos de demostración" cuando ya eran todos reales
- [x] **Bloqueo por rol a nivel de página** _(verificado: recepción en `/admin/reports` y camarería en `/admin` o `/admin/rates` ven "esta sección no es para tu rol". `ROLE_ACCESS` salió de `lib/mock/` a `lib/auth/`: dejó de ser dato de demostración el día que empezó a decidir accesos)_
- [x] Bug real encontrado y corregido: el seed dejaba las reservas con ITBMS cero (eran de antes del motor de precios) y no las repisaba al recorrer, así que el reporte de ingresos mostraba impuesto cero y parecía un bug del reporte
- [x] Quitar el DemoSwitcher del panel _(sobre un panel que ya escribe en la base era una barra flotante que invitaba a irse a la propuesta comercial en medio de un check-in. Sigue en el sitio del huésped y en `/proposal`)_
- [x] **Reserva pública sin pagos**: el huésped consulta, cotiza y solicita desde el sitio; el hotel acepta desde el panel → [`docs/flujo-reserva-publica.md`](docs/flujo-reserva-publica.md)
- [x] Bug real encontrado y corregido: el libro de reservas dejaba filtrar por "Por confirmar" y no daba ninguna forma de confirmar — la hoja de detalle vivía dentro del calendario. Ahora es un componente compartido y las filas se abren con clic o con Enter
- [x] Bug real encontrado y corregido: la página `/book` anidaba un `<main>` dentro del `<main>` del layout (HTML inválido; dos contenidos principales para un lector de pantalla)
- [x] Bug real encontrado y corregido: el pie del sitio decía "no reservas reales" después de que `/book` empezara a crear reservas de verdad

## Preguntas abiertas para Julius

- **¿El domingo cuenta como fin de semana para la tarifa?** Implementado como
  viernes y sábado. Cambiarlo es una línea, pero es su decisión de negocio.
- **¿Las tarifas que dé son con ITBMS incluido o sin incluir?** El sistema asume
  SIN incluir y suma el 10% al cotizar.
