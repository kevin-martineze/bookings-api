import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUniqueViolation, PrismaService } from '../prisma/prisma.service';
import type { CreatePropertyDto } from './dto/create-property.dto';
import type { UpdatePropertyDto } from './dto/update-property.dto';

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Por antigüedad, no alfabético.
   *
   * El panel toma el primero de esta lista como el alojamiento sobre el que
   * opera, y con orden alfabético ese default cambia solo: dar de alta "Casa
   * Playa" haría que el panel dejara de mostrar el hotel principal sin que
   * nadie tocara nada. El más antiguo es el negocio principal y no se mueve.
   */
  findAll(orgId: string) {
    return this.prisma.property.findMany({
      where: { orgId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOrThrow(orgId: string, propertyId: string) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, orgId },
    });
    if (!property) throw new NotFoundException('Alojamiento no encontrado.');
    return property;
  }

  async create(orgId: string, dto: CreatePropertyDto) {
    try {
      return await this.prisma.property.create({ data: { ...dto, orgId } });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Ya existe un alojamiento con ese slug en esta organización.',
        );
      }
      throw error;
    }
  }

  async update(orgId: string, propertyId: string, dto: UpdatePropertyDto) {
    await this.findOrThrow(orgId, propertyId);
    try {
      return await this.prisma.property.update({
        where: { id: propertyId },
        data: dto,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Ya existe un alojamiento con ese slug en esta organización.',
        );
      }
      throw error;
    }
  }
}
