import { HousekeepingStatus } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateHousekeepingDto {
  /**
   * Nuevo estado de limpieza. Sólo el cambio de estado queda en la bitácora.
   *
   * No incluye "fuera de servicio": eso es `active` en la unidad, y es el campo
   * que además saca la habitación de la venta.
   */
  @IsOptional()
  @IsEnum(HousekeepingStatus)
  status?: HousekeepingStatus;

  /** Nota operativa del tablero. Cadena vacía para borrarla. */
  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;

  /**
   * A quién se le asigna la habitación. `null` la deja sin asignar.
   *
   * `ValidateIf` en vez de `IsOptional` porque acá el `null` es un valor con
   * significado —desasignar— y `IsOptional` lo dejaría pasar sin validar el
   * resto de los casos.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  housekeeperId?: string | null;
}

export class BoardQueryDto {
  /**
   * Día del tablero. Lo manda el cliente porque el servidor corre en UTC y no
   * sabe en qué día está el usuario.
   */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date debe ser una fecha "YYYY-MM-DD"',
  })
  date?: string;
}
