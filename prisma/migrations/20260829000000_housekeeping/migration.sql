-- Camarería: estado de limpieza por unidad y bitácora de quién lo cambió.
--
-- El estado de limpieza es lo único que se guarda. Si la habitación está
-- ocupada, si sale hoy o si entra alguien hoy se deriva de las reservas: un
-- estado de ocupación almacenado se desactualiza en cuanto alguien mueve una
-- reserva, y nadie se entera hasta que el pasillo no coincide con la pantalla.
--
-- Tampoco hay un estado "fuera de servicio": eso ya lo dice `units.active`, que
-- además es lo que respeta el motor de disponibilidad. Dos columnas capaces de
-- decir lo mismo terminan discrepando.

CREATE TYPE "housekeeping_status" AS ENUM ('DIRTY', 'CLEAN', 'INSPECTED');

-- Arranca en CLEAN: una unidad recién cargada no la ensució nadie, y mandar a
-- limpiar habitaciones vacías el primer día es ruido que enseña al personal a
-- ignorar el tablero.
ALTER TABLE "units"
  ADD COLUMN "housekeeping_status" "housekeeping_status" NOT NULL DEFAULT 'CLEAN';

-- Nota operativa del tablero: "el aire no enfría". Es de camarería y
-- mantenimiento; las notas del huésped viven en la reserva.
ALTER TABLE "units"
  ADD COLUMN "housekeeping_note" TEXT;

-- A quién le toca la habitación en el turno actual. Se reescribe cada día y no
-- guarda historial: quién limpió realmente qué lo responde la bitácora.
--
-- ON DELETE SET NULL y no CASCADE — borrar a un empleado no puede borrar
-- habitaciones.
ALTER TABLE "units"
  ADD COLUMN "housekeeper_id" UUID;

ALTER TABLE "units"
  ADD CONSTRAINT "units_housekeeper_id_fkey"
  FOREIGN KEY ("housekeeper_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "units_housekeeper_id_idx" ON "units"("housekeeper_id");

-- Bitácora append-only. Existe porque "¿quién limpió la 302 ayer?" es una
-- pregunta real cuando un huésped se queja, y el estado actual de la unidad no
-- puede responderla.
--
-- `actor_id` es nullable porque el check-out ensucia la unidad sin que nadie
-- toque el tablero, y porque borrar a un empleado no debe llevarse el historial
-- de lo que hizo.
CREATE TABLE "housekeeping_events" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "org_id"      UUID NOT NULL,
  "unit_id"     UUID NOT NULL,
  "from_status" "housekeeping_status" NOT NULL,
  "to_status"   "housekeeping_status" NOT NULL,
  "actor_id"    UUID,
  "note"        TEXT,
  -- `createdAt` sin snake_case a propósito: es la convención que ya usa el
  -- resto del schema para las marcas de tiempo automáticas, y una tabla que se
  -- salga de ella obliga a un @map que nadie más tiene.
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "housekeeping_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "housekeeping_events"
  ADD CONSTRAINT "housekeeping_events_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "housekeeping_events"
  ADD CONSTRAINT "housekeeping_events_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- El tablero pide "lo último de esta unidad", siempre en ese orden.
CREATE INDEX "housekeeping_events_unit_id_created_at_idx"
  ON "housekeeping_events"("unit_id", "createdAt");

CREATE INDEX "housekeeping_events_org_id_idx"
  ON "housekeeping_events"("org_id");
