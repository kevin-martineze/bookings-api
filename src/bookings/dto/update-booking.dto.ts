import { IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Modificación de una reserva ya tomada.
 *
 * Lo que **no** está: el precio. Cambiar las fechas recotiza contra el motor,
 * igual que al crearla. Si el importe viniera del formulario, recepción podría
 * teclear cualquier número — y el precio dejaría de tener relación con las
 * tarifas publicadas.
 *
 * Tampoco está el estado: para eso están las transiciones, que sí verifican qué
 * cambio es legal desde dónde.
 */
export class UpdateBookingDto {
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'checkIn debe ser una fecha "YYYY-MM-DD"' })
  checkIn?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'checkOut debe ser una fecha "YYYY-MM-DD"' })
  checkOut?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  guests?: number;

  /** Mover a otra habitación del mismo tipo, o a otro tipo distinto. */
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  guestNotes?: string;
}
