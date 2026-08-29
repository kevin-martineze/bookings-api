import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgRolesGuard } from '../auth/guards/org-roles.guard';
import {
  BoardQueryDto,
  UpdateHousekeepingDto,
} from './dto/update-housekeeping.dto';
import { HousekeepingService } from './housekeeping.service';
import { dateKey } from './housekeeping.util';

@ApiTags('Camarería')
@ApiBearerAuth()
@Controller('orgs/:orgId/properties/:propertyId/housekeeping')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class HousekeepingController {
  constructor(private readonly housekeeping: HousekeepingService) {}

  /**
   * Tablero del día: una fila por unidad con su estado de limpieza y su
   * ocupación.
   *
   * Sin `@Roles`: el guard ya exige membresía en la organización, y camarería
   * —el rol con menos permisos del sistema— es justamente quien más necesita
   * esta pantalla.
   */
  @Get()
  board(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Query() query: BoardQueryDto,
  ) {
    return this.housekeeping.board(
      orgId,
      propertyId,
      query.date ?? dateKey(new Date()),
    );
  }

  /** Bitácora de una unidad: quién cambió su estado, cuándo y desde cuál. */
  @Get('units/:unitId/history')
  history(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitId') unitId: string,
  ) {
    return this.housekeeping.history(orgId, propertyId, unitId);
  }

  /**
   * Marcar limpia, sucia o inspeccionada; asignar a alguien; dejar una nota.
   *
   * Tampoco lleva `@Roles`: quien limpia la habitación tiene que poder decir
   * que la limpió. Un tablero que la camarera puede ver pero no marcar obliga a
   * pedirle a recepción que lo haga por ella, y entonces nadie lo marca.
   */
  @Patch('units/:unitId')
  update(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitId') unitId: string,
    @Body() dto: UpdateHousekeepingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.housekeeping.update(orgId, propertyId, unitId, dto, user.id);
  }
}
