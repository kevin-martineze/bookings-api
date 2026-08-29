import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RequestPasswordResetDto {
  @IsEmail({}, { message: 'Hace falta un correo válido.' })
  @MaxLength(160)
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(10)
  @MaxLength(512)
  token: string;

  /**
   * Mínimo de 10 caracteres y nada más.
   *
   * Sin reglas de mayúscula, número y símbolo: obligan a `Hotel2026!` y a
   * escribirla en un papel. La longitud es lo único que de verdad mide algo.
   */
  @IsString()
  @MinLength(10, { message: 'La contraseña necesita al menos 10 caracteres.' })
  @MaxLength(200)
  password: string;
}
