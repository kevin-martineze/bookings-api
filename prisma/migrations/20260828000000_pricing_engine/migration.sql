-- Motor de precios: tarifa de fin de semana e impuesto por alojamiento.
--
-- Dos campos que faltaban para cumplir lo cotizado ("precios de temporada y de
-- fin de semana, configurados en un solo lugar") y para que el total de una
-- reserva sea el que el huésped realmente paga.

-- Tarifa de viernes y sábado dentro de un plan. Null = mismo precio todos los
-- días. Sin esto, cobrar más el fin de semana obligaría a crear un RatePlan por
-- cada fin de semana del año.
ALTER TABLE "rate_plans"
  ADD COLUMN "weekend_price_minor" INTEGER;

-- El precio de fin de semana es dinero: mismas reglas que el resto.
ALTER TABLE "rate_plans"
  ADD CONSTRAINT "rate_plans_weekend_price_non_negative"
  CHECK ("weekend_price_minor" IS NULL OR "weekend_price_minor" >= 0);

-- Un plan cuyo rango termina antes de empezar no describe ninguna noche, y
-- pasaría inadvertido hasta que alguien no entienda por qué no se aplica.
ALTER TABLE "rate_plans"
  ADD CONSTRAINT "rate_plans_valid_range"
  CHECK ("end_date" >= "start_date");

-- Impuesto sobre hospedaje, en porcentaje entero. 10 = ITBMS de Panamá.
--
-- Como dato de la propiedad y no como constante en el código: si la tasa
-- cambia, o entra un alojamiento con otro tratamiento fiscal, es un UPDATE y no
-- un despliegue.
ALTER TABLE "properties"
  ADD COLUMN "tax_rate_pct" INTEGER NOT NULL DEFAULT 10;

ALTER TABLE "properties"
  ADD CONSTRAINT "properties_tax_rate_sane"
  CHECK ("tax_rate_pct" >= 0 AND "tax_rate_pct" <= 100);
