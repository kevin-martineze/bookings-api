import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service';
import type { CreateUnitTypeDto } from './dto/create-unit-type.dto';
import type { UpdateUnitTypeDto } from './dto/update-unit-type.dto';
import { PropertiesService } from './properties.service';

@Injectable()
export class UnitTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
  ) {}

  async findAll(orgId: string, propertyId: string) {
    await this.properties.findOrThrow(orgId, propertyId);
    return this.prisma.unitType.findMany({
      where: { propertyId },
      orderBy: { name: 'asc' },
    });
  }

  async findOrThrow(orgId: string, propertyId: string, unitTypeId: string) {
    const unitType = await this.prisma.unitType.findFirst({
      where: { id: unitTypeId, propertyId, orgId },
    });
    if (!unitType) throw new NotFoundException('Tipo de unidad no encontrado.');
    return unitType;
  }

  async create(orgId: string, propertyId: string, dto: CreateUnitTypeDto) {
    await this.properties.findOrThrow(orgId, propertyId);
    try {
      return await this.prisma.unitType.create({
        data: { ...dto, orgId, propertyId },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Ya existe un tipo de unidad con ese slug en este alojamiento.',
        );
      }
      throw error;
    }
  }

  async update(
    orgId: string,
    propertyId: string,
    unitTypeId: string,
    dto: UpdateUnitTypeDto,
  ) {
    await this.findOrThrow(orgId, propertyId, unitTypeId);
    try {
      return await this.prisma.unitType.update({
        where: { id: unitTypeId },
        data: dto,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Ya existe un tipo de unidad con ese slug en este alojamiento.',
        );
      }
      throw error;
    }
  }
}
