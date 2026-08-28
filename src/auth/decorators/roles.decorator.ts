import { SetMetadata } from '@nestjs/common';
import { MemberRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Roles permitidos para la ruta. `OrgRolesGuard` los lee y los cruza con la Membership real. */
export const Roles = (...roles: MemberRole[]) => SetMetadata(ROLES_KEY, roles);
