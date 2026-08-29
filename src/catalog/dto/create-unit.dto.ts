import { IsString, IsUUID } from 'class-validator';

export class CreateUnitDto {
  /** Identificador visible para el personal: "302", "Apto B". */
  @IsString()
  label: string;

  @IsUUID()
  unitTypeId: string;
}
