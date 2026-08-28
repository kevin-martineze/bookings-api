import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MemberRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Autoriza el acceso a una organización, y opcionalmente por rol dentro de ella.
 *
 * No confía en claims de rol dentro del JWT: consulta `Membership` en cada
 * petición, tal como lo documenta el propio schema. Así un cambio de rol (o un
 * despido) surte efecto en la siguiente request, no en la siguiente vez que el
 * usuario vuelva a loguearse.
 *
 * La verificación de membership corre SIEMPRE que se aplica este guard, tenga
 * o no `@Roles(...)` la ruta — `@Roles` sólo agrega una restricción extra
 * encima, nunca la reemplaza. Sin esto, una ruta de solo lectura sin `@Roles`
 * dejaría pasar a cualquier usuario autenticado de CUALQUIER organización, no
 * solo a los miembros de esta.
 *
 * Requiere correr después de `JwtAuthGuard` (necesita `request.user`) y que la
 * ruta tenga un parámetro `:orgId`.
 */
@Injectable()
export class OrgRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user: AuthenticatedUser;
      params: Record<string, string>;
    }>();
    const orgId = request.params.orgId;
    if (!orgId) {
      throw new ForbiddenException('La ruta no tiene organización en el path.');
    }

    const membership = await this.prisma.membership.findUnique({
      where: { orgId_userId: { orgId, userId: request.user.id } },
    });
    if (!membership) {
      throw new ForbiddenException(
        'No tenés permiso para operar en esta organización.',
      );
    }

    const requiredRoles = this.reflector.getAllAndOverride<MemberRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (
      requiredRoles &&
      requiredRoles.length > 0 &&
      !requiredRoles.includes(membership.role)
    ) {
      throw new ForbiddenException(
        'No tenés permiso para operar en esta organización.',
      );
    }

    return true;
  }
}
