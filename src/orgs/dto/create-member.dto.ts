import { MemberRole } from '@prisma/client';
import { IsEmail, IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Alta de una persona del equipo.
 *
 * Nótese que **no lleva contraseña**. La genera el servidor y la devuelve una
 * sola vez: la que elegiría quien da el alta es la que va a repetir para los
 * cinco empleados, y esa termina pegada en un papel al lado de la computadora.
 */
export class CreateMemberDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName: string;

  @IsEmail({}, { message: 'Hace falta un correo válido.' })
  @MaxLength(160)
  email: string;

  @IsEnum(MemberRole)
  role: MemberRole;
}
