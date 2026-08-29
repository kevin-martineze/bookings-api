import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateRatePlanDto {
  /** Cómo lo llama el hotel: "Temporada alta", "Semana Santa". */
  @IsString()
  name: string;

  @Matches(DATE_PATTERN, {
    message: 'startDate debe ser una fecha "YYYY-MM-DD"',
  })
  startDate: string;

  /** Inclusivo: la noche del endDate se cobra a esta tarifa. */
  @Matches(DATE_PATTERN, { message: 'endDate debe ser una fecha "YYYY-MM-DD"' })
  endDate: string;

  /** Tarifa por noche en centavos. */
  @IsInt()
  @Min(0)
  priceMinor: number;

  /** Tarifa de viernes y sábado. Omitir = mismo precio todos los días. */
  @IsOptional()
  @IsInt()
  @Min(0)
  weekendPriceMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minNights?: number;

  /** Cierra la venta en este rango sin borrar el plan. */
  @IsOptional()
  @IsBoolean()
  closed?: boolean;
}
