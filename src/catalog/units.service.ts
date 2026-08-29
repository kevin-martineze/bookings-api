import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service';
import type { CreateUnitDto } from './dto/create-unit.dto';
import type { UpdateUnitDto } from './dto/update-unit.dto';
import { PropertiesService } from './properties.service';

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
  ) {}

  async findAll(orgId: string, propertyId: string) {
    await this.properties.findOrThrow(orgId, propertyId);
    return this.prisma.unit.findMany({
      where: { propertyId },
      orderBy: { label: 'asc' },
    });
  }

  async findOrThrow(orgId: string, propertyId: string, unitId: string) {
    const unit = await this.prisma.unit.findFirst({
      where: { id: unitId, propertyId, orgId },
    });
    if (!unit) throw new NotFoundException('Unidad no encontrada.');
    return unit;
  }

  async create(orgId: string, propertyId: string, dto: CreateUnitDto) {
    await this.properties.findOrThrow(orgId, propertyId);
    await this.assertUnitTypeBelongsToProperty(
      orgId,
      propertyId,
      dto.unitTypeId,
    );

    try {
      return await this.prisma.unit.create({
        data: {
          label: dto.label,
          orgId,
          propertyId,
          unitTypeId: dto.unitTypeId,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Ya existe una unidad con ese identificador en este alojamiento.',
        );
      }
      throw error;
    }
  }

  async update(
    orgId: string,
    propertyId: string,
    unitId: string,
    dto: UpdateUnitDto,
  ) {
    await this.findOrThrow(orgId, propertyId, unitId);
    try {
      return await this.prisma.unit.update({
        where: { id: unitId },
        data: dto,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Ya existe una unidad con ese identificador en este alojamiento.',
        );
      }
      throw error;
    }
  }

  /**
   * Borra una habitación, y sólo si nunca se vendió.
   *
   * Con reservas encima se niega y ofrece la salida correcta: marcarla
   * `active: false`, que la saca de la venta sin tocar el historial. Es la
   * diferencia entre "esta habitación ya no se alquila" y "esta habitación
   * nunca existió", y confundirlas borra las facturas de quien durmió ahí.
   */
  async remove(orgId: string, propertyId: string, unitId: string) {
    await this.findOrThrow(orgId, propertyId, unitId);

    const bookings = await this.prisma.booking.count({ where: { unitId } });
    if (bookings > 0) {
      throw new ConflictException(
        'Esta habitación tiene reservas y no se puede borrar. Marcala como fuera de servicio para dejar de venderla.',
      );
    }

    await this.prisma.unit.delete({ where: { id: unitId } });
  }

  /**
   * El schema no garantiza esto a nivel de base para `Unit` (solo lo hace para
   * `Booking`, vía el trigger `assert_booking_consistency`) — sin esta
   * validación se podría crear una unidad que apunta a un tipo de OTRA
   * property, lo que mezclaría inventario entre alojamientos.
   */
  private async assertUnitTypeBelongsToProperty(
    orgId: string,
    propertyId: string,
    unitTypeId: string,
  ): Promise<void> {
    const unitType = await this.prisma.unitType.findFirst({
      where: { id: unitTypeId, orgId },
    });
    if (!unitType) {
      throw new BadRequestException('El tipo de unidad indicado no existe.');
    }
    if (unitType.propertyId !== propertyId) {
      throw new BadRequestException(
        'El tipo de unidad no pertenece a este alojamiento.',
      );
    }
  }
}
