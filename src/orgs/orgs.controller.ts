import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MemberRole } from '@prisma/client';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgRolesGuard } from '../auth/guards/org-roles.guard';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { MembersService } from './members.service';

/**
 * El equipo del hotel.
 *
 * Todo restringido a OWNER y MANAGER: quién trabaja acá y con qué permisos no
 * es información que recepción necesite para atender, y poder cambiarlo sería
 * poder darse permisos a uno mismo.
 */
@ApiTags('Organización · Equipo')
@ApiBearerAuth()
@Controller('orgs/:orgId/members')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
@Roles(MemberRole.OWNER, MemberRole.MANAGER)
export class OrgsController {
  constructor(private readonly members: MembersService) {}

  @Get()
  findAll(@Param('orgId') orgId: string) {
    return this.members.findAll(orgId);
  }

  /** Devuelve una contraseña temporal. Es la única vez que existe en claro. */
  @Post()
  create(@Param('orgId') orgId: string, @Body() dto: CreateMemberDto) {
    return this.members.create(orgId, dto);
  }

  @Patch(':userId')
  update(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.members.update(orgId, userId, dto, user.id);
  }

  /** Genera una contraseña nueva y cierra todas las sesiones de esa persona. */
  @Post(':userId/reset-password')
  resetPassword(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
  ) {
    return this.members.resetPassword(orgId, userId);
  }

  /** Saca a la persona del equipo. La cuenta sigue existiendo. */
  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.members.remove(orgId, userId, user.id);
  }
}
