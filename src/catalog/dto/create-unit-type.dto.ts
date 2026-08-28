import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateUnitTypeDto {
  @IsString()
  name: string;

  @Matches(SLUG_PATTERN, {
    message: 'slug debe ser minúsculas, números y guiones',
  })
  slug: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  maxGuests: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  beds?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baths?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  sizeSqm?: number;

  /** Centavos, no la unidad mayor. 12550 es $125.50. */
  @IsInt()
  @Min(0)
  basePriceMinor: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minNights?: number;
}
