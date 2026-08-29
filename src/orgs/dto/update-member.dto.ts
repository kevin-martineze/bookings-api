import { MemberRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

/** Sólo el rol. El nombre y el correo los cambia su dueño, no la gerencia. */
export class UpdateMemberDto {
  @IsEnum(MemberRole)
  role: MemberRole;
}
