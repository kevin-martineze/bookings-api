import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

/** Fecha de calendario, sin hora ni zona — igual al criterio `IsoDate` del frontend. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateBookingDto {
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
  guestFullName: string;

  @IsEmail()
  guestEmail: string;

  @IsOptional()
  @IsString()
  guestPhone?: string;

  @IsOptional()
  @IsString()
  guestNotes?: string;
}
