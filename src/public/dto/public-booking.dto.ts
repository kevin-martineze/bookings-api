import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class PublicAvailabilityQueryDto {
  @Matches(DATE_PATTERN, { message: 'checkIn debe ser una fecha "YYYY-MM-DD"' })
  checkIn: string;

  @Matches(DATE_PATTERN, {
    message: 'checkOut debe ser una fecha "YYYY-MM-DD"',
  })
  checkOut: string;

  /** `Type` porque un query string llega siempre como texto. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests?: number;
}

/**
 * Reserva desde el sitio del huésped.
 *
 * Nótese lo que **no** está: ni precio, ni total, ni unidad. El precio lo
 * calcula el servidor y la unidad la asigna el servidor. Un formulario público
 * que acepte importes es un formulario donde cualquiera reserva a un dólar.
 *
 * Los largos máximos no son cosmética: sin ellos, un campo de texto abierto en
 * un endpoint sin autenticar es una invitación a llenar la base.
 */
export class PublicBookingDto {
  @IsUUID()
  unitTypeId: string;

  @Matches(DATE_PATTERN, { message: 'checkIn debe ser una fecha "YYYY-MM-DD"' })
  checkIn: string;

  @Matches(DATE_PATTERN, {
    message: 'checkOut debe ser una fecha "YYYY-MM-DD"',
  })
  checkOut: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  guests?: number;

  @IsString()
  @MaxLength(120)
  guestFullName: string;

  @IsEmail({}, { message: 'Hace falta un correo válido para confirmarte.' })
  @MaxLength(160)
  guestEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  guestPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  guestNotes?: string;
}
