import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class UpdateUnitTypeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Matches(SLUG_PATTERN, {
    message: 'slug debe ser minúsculas, números y guiones',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxGuests?: number;

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

  @IsOptional()
  @IsInt()
  @Min(0)
  basePriceMinor?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minNights?: number;
}
