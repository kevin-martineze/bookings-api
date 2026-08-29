-- Idioma del huésped.
--
-- Sin esto, los correos que dispara el personal —confirmación, cancelación—
-- salían todos en español, incluso a quien había reservado el sitio en inglés.
-- El idioma sólo se conoce en el momento de la solicitud; después se perdía.
--
-- Nullable: las reservas que carga el personal no lo preguntan, y en ese caso
-- vale el idioma del hotel.
ALTER TABLE "guests"
  ADD COLUMN "locale" TEXT;

-- Sólo los idiomas que el sistema sabe escribir. Un `locale` con cualquier
-- cadena obliga a que cada plantilla adivine qué hacer con "pt-BR".
ALTER TABLE "guests"
  ADD CONSTRAINT "guests_locale_supported"
  CHECK ("locale" IS NULL OR "locale" IN ('es', 'en'));
