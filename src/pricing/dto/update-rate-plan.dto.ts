import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class UpdateRatePlanDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, {
    message: 'startDate debe ser una fecha "YYYY-MM-DD"',
  })
  startDate?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'endDate debe ser una fecha "YYYY-MM-DD"' })
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priceMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  weekendPriceMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minNights?: number;

  @IsOptional()
  @IsBoolean()
  closed?: boolean;
}
