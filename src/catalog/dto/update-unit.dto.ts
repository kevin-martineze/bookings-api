import { IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * No permite mover la unidad a otro `unitTypeId` — reasignar el tipo de una
 * unidad ya en uso es una operación más delicada (afecta precios y reservas
 * existentes) que no hace falta todavía.
 */
export class UpdateUnitDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
