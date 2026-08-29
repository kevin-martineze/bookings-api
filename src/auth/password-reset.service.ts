import { BadRequestException, Injectable } from '@nestjs/common';
import { TokenPurpose } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { MailService } from '../mail/mail.service';
import { passwordReset } from '../mail/mail.templates';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Restablecimiento de contraseña por correo.
 *
 * El modelo `VerificationToken` estaba en el schema desde el principio y nunca
 * tuvo endpoint. Sin esto, el primer empleado que olvidara su clave quedaba
 * afuera hasta que alguien tocara la base a mano.
 *
 * Convive con el restablecimiento que hace la gerencia desde el panel: ese es
 * el camino de quien tiene a quién avisarle; este es el de quien no.
 */

/** Una hora. Suficiente para revisar el correo, corto para un enlace robado. */
const TOKEN_TTL_MINUTES = 60;

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /**
   * Pide un restablecimiento.
   *
   * **Responde igual exista o no la cuenta.** Si dijera "ese correo no está
   * registrado", cualquiera podría averiguar quién tiene cuenta probando
   * direcciones — y en un hotel chico, saber qué correos son del personal es el
   * primer paso de un intento de suplantación.
   */
  async request(rawEmail: string): Promise<{ sent: true }> {
    const email = rawEmail.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) return { sent: true };

    /* Los pedidos anteriores sin usar se invalidan. Si alguien pidió tres
       veces, tres enlaces vivos son tres oportunidades de que uno se filtre. */
    await this.prisma.verificationToken.updateMany({
      where: {
        userId: user.id,
        purpose: TokenPurpose.PASSWORD_RESET,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        purpose: TokenPurpose.PASSWORD_RESET,
        // Se guarda el hash: quien lea esta tabla no puede tomar cuentas.
        tokenHash: hashToken(token),
        expiresAt,
      },
    });

    /* El token viaja SÓLO por correo, nunca en la respuesta: devolverlo
       convertiría el endpoint en una forma de tomar cualquier cuenta conociendo
       el correo. */
    const link = `${process.env.PANEL_URL ?? 'http://localhost:3001'}/es/admin?reset=${token}`;
    const mail = passwordReset(link);

    /* No se espera el envío. El pedido ya está registrado y el token ya existe;
       hacer esperar al usuario por el SMTP sólo convierte un correo lento en una
       pantalla lenta. `MailService.send` no lanza. */
    void this.mail.send({ to: email, ...mail });

    return { sent: true };
  }

  /**
   * Consuma el token y fija la contraseña nueva.
   *
   * El token se marca usado y se revocan todas las sesiones abiertas: si el
   * restablecimiento fue porque alguien más tenía la contraseña, dejarle la
   * sesión viva hace inútil el cambio.
   */
  async reset(token: string, newPassword: string): Promise<{ ok: true }> {
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });

    /* Un solo mensaje para "no existe", "ya se usó" y "venció". Distinguirlos
       le diría a quien prueba tokens cuáles existieron alguna vez. */
    const invalid = new BadRequestException(
      'Ese enlace no sirve o ya venció. Pedí uno nuevo.',
    );
    if (!record) throw invalid;
    if (record.consumedAt) throw invalid;
    if (record.expiresAt < new Date()) throw invalid;

    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });

    await this.prisma.$transaction([
      this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          // Quien llega hasta acá probó que tiene el correo: el bloqueo por
          // intentos fallidos ya no protege de nada.
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { ok: true };
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
