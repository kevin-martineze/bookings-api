-- Impide la doble reserva EN LA BASE DE DATOS.
--
-- Por qué aquí y no en la aplicación: entre "consulté disponibilidad" y
-- "guardé la reserva" siempre hay una ventana. Con dos huéspedes reservando la
-- última habitación al mismo tiempo, ambas consultas ven la unidad libre y
-- ambas escriben. Ninguna cantidad de código de aplicación cierra esa ventana
-- de forma fiable; una restricción de exclusión sí, porque Postgres la evalúa
-- dentro de la transacción y aborta la segunda.
--
-- Requiere btree_gist para poder combinar un igual (=) sobre unit_id con un
-- solapamiento (&&) sobre el rango de fechas en el mismo índice GiST.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Columna generada con el rango de la estadía.
--
-- '[)' es intencional: incluye el check-in y EXCLUYE el check-out. Una reserva
-- del 10 al 12 ocupa las noches 10 y 11 y libera la unidad el 12, así que otra
-- que entra el 12 no se solapa. Con '[]' toda salida bloquearía la entrada del
-- mismo día, que es exactamente lo contrario de cómo opera un hotel.
ALTER TABLE "bookings"
  ADD COLUMN "stay" daterange
  GENERATED ALWAYS AS (daterange("check_in", "check_out", '[)')) STORED;

-- La restricción.
--
-- El WHERE deja fuera los estados que no ocupan inventario: una reserva
-- cancelada o un no-show no deben impedir volver a vender esa noche. PENDING
-- sí bloquea — es la retención mientras el huésped paga — y un job libera las
-- que expiran por hold_expires_at.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "unit_id" WITH =,
    "stay" WITH &&
  )
  WHERE ("status" NOT IN ('CANCELLED', 'NO_SHOW'));

-- Una estadía debe tener al menos una noche. Sin esto, check_in = check_out
-- produce un rango vacío, y un rango vacío no se solapa con nada: la
-- restricción de arriba lo dejaría pasar sin protección.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_positive_stay"
  CHECK ("check_out" > "check_in");

-- El desglose debe cuadrar. Barato de verificar y evita que un error de
-- cálculo en la aplicación quede persistido en una factura.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_total_matches_breakdown"
  CHECK ("total_minor" = "subtotal_minor" + "tax_minor" + "fees_minor");

-- Nunca se puede reembolsar más de lo cobrado.
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_refund_within_amount"
  CHECK ("refunded_minor" >= 0 AND "refunded_minor" <= "amount_minor");

-- Una unidad física pertenece al mismo alojamiento que su tipo, y una reserva
-- al mismo alojamiento que su unidad. Son invariantes que el ORM no expresa y
-- que, si se rompen, mezclan inventario entre propiedades.
CREATE OR REPLACE FUNCTION assert_booking_consistency() RETURNS trigger AS $$
DECLARE
  unit_property uuid;
  unit_type     uuid;
  unit_org      uuid;
BEGIN
  SELECT "property_id", "unit_type_id", "org_id"
    INTO unit_property, unit_type, unit_org
    FROM "units" WHERE "id" = NEW."unit_id";

  IF unit_property IS DISTINCT FROM NEW."property_id" THEN
    RAISE EXCEPTION 'La unidad % no pertenece al alojamiento %', NEW."unit_id", NEW."property_id";
  END IF;

  IF unit_type IS DISTINCT FROM NEW."unit_type_id" THEN
    RAISE EXCEPTION 'La unidad % no es del tipo %', NEW."unit_id", NEW."unit_type_id";
  END IF;

  IF unit_org IS DISTINCT FROM NEW."org_id" THEN
    RAISE EXCEPTION 'Cruce de organizaciones en la reserva %', NEW."id";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "bookings_consistency"
  BEFORE INSERT OR UPDATE OF "unit_id", "unit_type_id", "property_id", "org_id"
  ON "bookings"
  FOR EACH ROW EXECUTE FUNCTION assert_booking_consistency();
