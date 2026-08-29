import { BookingStatus } from '@prisma/client';
import { IsEnum, IsOptional, Matches } from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ListBookingsQueryDto {
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  /** Inicio de la ventana. Devuelve las estadías que se solapan con ella, no solo las que empiezan dentro. */
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'from debe ser una fecha "YYYY-MM-DD"' })
  from?: string;

  /** Fin de la ventana, exclusivo. */
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'to debe ser una fecha "YYYY-MM-DD"' })
  to?: string;
}
