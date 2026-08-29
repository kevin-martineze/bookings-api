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
import { CreateUnitTypeDto } from './dto/create-unit-type.dto';
import { UpdateUnitTypeDto } from './dto/update-unit-type.dto';
import { UnitTypesService } from './unit-types.service';

@ApiTags('Catálogo · Tipos de unidad')
@ApiBearerAuth()
@Controller('orgs/:orgId/properties/:propertyId/unit-types')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class UnitTypesController {
  constructor(private readonly unitTypes: UnitTypesService) {}

  @Get()
  findAll(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
  ) {
    return this.unitTypes.findAll(orgId, propertyId);
  }

  @Get(':unitTypeId')
  findOne(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitTypeId') unitTypeId: string,
  ) {
    return this.unitTypes.findOrThrow(orgId, propertyId, unitTypeId);
  }

  @Post()
  @Roles(MemberRole.OWNER, MemberRole.MANAGER)
  create(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Body() dto: CreateUnitTypeDto,
  ) {
    return this.unitTypes.create(orgId, propertyId, dto);
  }

  @Patch(':unitTypeId')
  @Roles(MemberRole.OWNER, MemberRole.MANAGER)
  update(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitTypeId') unitTypeId: string,
    @Body() dto: UpdateUnitTypeDto,
  ) {
    return this.unitTypes.update(orgId, propertyId, unitTypeId, dto);
  }

  /** Sólo si no tiene habitaciones ni reservas. */
  @Delete(':unitTypeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(MemberRole.OWNER, MemberRole.MANAGER)
  remove(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Param('unitTypeId') unitTypeId: string,
  ) {
    return this.unitTypes.remove(orgId, propertyId, unitTypeId);
  }
}
