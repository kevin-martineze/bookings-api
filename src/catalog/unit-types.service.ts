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

  /**
   * Borra un tipo de unidad, y sólo si de verdad se puede.
   *
   * Se niega si todavía tiene habitaciones o si alguna vez se le vendió una
   * reserva. Borrarlo con reservas encima se llevaría por delante el historial
   * —Prisma tiene `onDelete: Restrict` en `Unit`, pero las reservas cuelgan del
   * tipo también— y un hotel necesita poder decir a quién le cobró qué.
   *
   * El caso real es otro: cargar "Suite Doble" con un error de dedo y querer
   * empezar de nuevo antes de vender nada. Para eso sirve. Para retirar un tipo
   * que ya se usó, lo correcto es dejarlo sin habitaciones activas.
   */
  async remove(orgId: string, propertyId: string, unitTypeId: string) {
    await this.findOrThrow(orgId, propertyId, unitTypeId);

    const [units, bookings] = await Promise.all([
      this.prisma.unit.count({ where: { unitTypeId } }),
      this.prisma.booking.count({ where: { unitTypeId } }),
    ]);

    if (bookings > 0) {
      throw new ConflictException(
        'Este tipo tiene reservas asociadas y no se puede borrar. Quitale las habitaciones para dejar de venderlo.',
      );
    }
    if (units > 0) {
      throw new ConflictException(
        `Todavía tiene ${units} habitación(es). Borralas o movelas de tipo primero.`,
      );
    }

    // Los planes tarifarios sí se van con él: sin tipo no describen nada.
    await this.prisma.unitType.delete({ where: { id: unitTypeId } });
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
