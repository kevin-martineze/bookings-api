import {
  Body,
  Controller,
  Get,
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
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertiesService } from './properties.service';

@ApiTags('Catálogo · Alojamientos')
@ApiBearerAuth()
@Controller('orgs/:orgId/properties')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  @Get()
  findAll(@Param('orgId') orgId: string) {
    return this.properties.findAll(orgId);
  }

  @Get(':propertyId')
  findOne(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
  ) {
    return this.properties.findOrThrow(orgId, propertyId);
  }

  @Post()
  @Roles(MemberRole.OWNER, MemberRole.MANAGER)
  create(@Param('orgId') orgId: string, @Body() dto: CreatePropertyDto) {
    return this.properties.create(orgId, dto);
  }

  @Patch(':propertyId')
  @Roles(MemberRole.OWNER, MemberRole.MANAGER)
  update(
    @Param('orgId') orgId: string,
    @Param('propertyId') propertyId: string,
    @Body() dto: UpdatePropertyDto,
  ) {
    return this.properties.update(orgId, propertyId, dto);
  }
}
