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
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgRolesGuard } from '../auth/guards/org-roles.guard';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { UnitsService } from './units.service';

@ApiTags('Catálogo · Unidades')
@ApiBearerAuth()
@Controller('orgs/:orgId/properties/:propertyId/units')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Get()
  findAll(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
  ) {
    return this.units.findAll(orgId, propertyId);
  }

  @Get(':unitId')
  findOne(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitId') unitId: string,
  ) {
    return this.units.findOrThrow(orgId, propertyId, unitId);
  }

  @Post()
  @Roles(MemberRole.OWNER, MemberRole.MANAGER)
  create(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Body() dto: CreateUnitDto,
  ) {
    return this.units.create(orgId, propertyId, dto);
  }

  @Patch(':unitId')
  @Roles(MemberRole.OWNER, MemberRole.MANAGER)
  update(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitId') unitId: string,
    @Body() dto: UpdateUnitDto,
  ) {
    return this.units.update(orgId, propertyId, unitId, dto);
  }

  /**
   * Sólo si nunca se vendió. Con reservas encima se rechaza y se ofrece
   * `active: false`, que la saca de la venta sin tocar el historial.
   */
  @Delete(':unitId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(MemberRole.OWNER, MemberRole.MANAGER)
  remove(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitId') unitId: string,
  ) {
    return this.units.remove(orgId, propertyId, unitId);
  }
}
