import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MemberRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateMemberDto } from './dto/create-member.dto';
import type { UpdateMemberDto } from './dto/update-member.dto';

/**
 * Alta y baja del personal.
 *
 * Existía sólo la lectura, así que las únicas cuentas del sistema eran las tres
 * del seed. Sin esto, entrenar al personal el 1 de octubre habría requerido que
 * yo creara cada usuario a mano contra la base.
 */
@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(orgId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { orgId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((m) => ({
      userId: m.userId,
      name: m.user.fullName ?? m.user.email,
      email: m.user.email,
      role: m.role,
      /* Útil para el panel: una cuenta bloqueada por intentos fallidos parece
         "la contraseña no funciona" hasta que alguien puede verlo. */
      lockedUntil: m.user.lockedUntil,
      createdAt: m.createdAt,
    }));
  }

  /**
   * Crea la cuenta y la deja adentro de la organización.
   *
   * Devuelve **una contraseña temporal generada acá**, y es la única vez que
   * existe en claro. No se deja elegir la contraseña a quien da el alta: la que
   * elegiría es la que va a repetir para los cinco empleados, y esa contraseña
   * termina pegada en un papel al lado de la computadora de recepción.
   *
   * Si el correo ya tiene cuenta —la misma persona trabajando en dos
   * alojamientos— se reutiliza la cuenta y sólo se agrega la membresía. No se
   * le toca la contraseña: quien administra una organización no tiene por qué
   * poder cambiarle la clave a alguien de otra.
   */
  async create(orgId: string, dto: CreateMemberDto) {
    const email = dto.email.toLowerCase().trim();

    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      const already = await this.prisma.membership.findUnique({
        where: { orgId_userId: { orgId, userId: existing.id } },
      });
      if (already) {
        throw new ConflictException('Esa persona ya es parte del equipo.');
      }

      await this.prisma.membership.create({
        data: { orgId, userId: existing.id, role: dto.role },
      });

      return {
        userId: existing.id,
        email: existing.email,
        name: existing.fullName ?? existing.email,
        role: dto.role,
        /* Ya tenía cuenta: entra con la contraseña que ya usaba, y por eso no
           se devuelve ninguna. */
        temporaryPassword: null,
      };
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, {
      type: argon2.argon2id,
    });

    const user = await this.prisma.user.create({
      data: { email, fullName: dto.fullName, passwordHash },
    });
    await this.prisma.membership.create({
      data: { orgId, userId: user.id, role: dto.role },
    });

    return {
      userId: user.id,
      email: user.email,
      name: user.fullName ?? user.email,
      role: dto.role,
      temporaryPassword,
    };
  }

  /** Cambiar el rol de alguien. */
  async update(
    orgId: string,
    userId: string,
    dto: UpdateMemberDto,
    actorId: string,
  ) {
    const membership = await this.findMembershipOrThrow(orgId, userId);

    if (userId === actorId && dto.role !== membership.role) {
      /* Nadie se quita a sí mismo el rol con el que administra. Es la forma más
         fácil de dejar una organización sin dueño, y no hay pantalla para
         arreglarlo desde adentro. */
      throw new ForbiddenException('No podés cambiarte el rol a vos mismo.');
    }
    await this.assertNotLastOwner(orgId, userId, dto.role);

    const updated = await this.prisma.membership.update({
      where: { id: membership.id },
      data: { role: dto.role },
      include: { user: true },
    });

    return {
      userId: updated.userId,
      email: updated.user.email,
      name: updated.user.fullName ?? updated.user.email,
      role: updated.role,
    };
  }

  /**
   * Saca a alguien de la organización.
   *
   * Borra la **membresía**, no la cuenta: la persona puede seguir existiendo
   * como huésped, o trabajar en otro alojamiento. Y borrar el usuario se
   * llevaría por delante quién hizo cada check-in en la bitácora.
   */
  async remove(orgId: string, userId: string, actorId: string) {
    const membership = await this.findMembershipOrThrow(orgId, userId);

    if (userId === actorId) {
      throw new ForbiddenException('No podés sacarte a vos mismo del equipo.');
    }
    await this.assertNotLastOwner(orgId, userId, null);

    await this.prisma.membership.delete({ where: { id: membership.id } });
  }

  /**
   * Genera una contraseña temporal nueva para alguien que perdió la suya.
   *
   * Es el camino de recepción: el empleado le avisa a gerencia en vez de
   * esperar un correo. Convive con el restablecimiento por correo, que es el
   * camino de quien no tiene a quién avisarle.
   */
  async resetPassword(orgId: string, userId: string) {
    await this.findMembershipOrThrow(orgId, userId);

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, {
      type: argon2.argon2id,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        /* Se limpia el bloqueo por intentos fallidos: si llegó acá pidiendo
           contraseña nueva, dejarlo bloqueado no protege de nada. */
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    /* Todas las sesiones abiertas se caen. Si la contraseña se cambió porque
       alguien más la tenía, dejar viva su sesión hace inútil el cambio. */
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { temporaryPassword };
  }

  private async findMembershipOrThrow(orgId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });
    if (!membership) throw new NotFoundException('Esa persona no está en el equipo.');
    return membership;
  }

  /**
   * Una organización sin OWNER queda sin nadie que pueda administrarla, y no
   * hay forma de arreglarlo desde la aplicación.
   */
  private async assertNotLastOwner(
    orgId: string,
    userId: string,
    nextRole: MemberRole | null,
  ): Promise<void> {
    const current = await this.prisma.membership.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });
    if (current?.role !== MemberRole.OWNER) return;
    if (nextRole === MemberRole.OWNER) return;

    const owners = await this.prisma.membership.count({
      where: { orgId, role: MemberRole.OWNER },
    });
    if (owners <= 1) {
      throw new BadRequestException(
        'Es el único propietario. Nombrá otro antes de cambiarlo o sacarlo.',
      );
    }
  }
}

/**
 * Contraseña temporal legible por teléfono.
 *
 * Sin caracteres que se confundan al dictarla (`0/O`, `1/l/I`) porque el modo
 * real de entregarla es alguien leyéndosela a otra persona en voz alta. Una
 * contraseña "más segura" que se transcribe mal tres veces termina siendo
 * "hotel123".
 */
function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if (i === 3 || i === 7) out += '-';
  }
  return out;
}
