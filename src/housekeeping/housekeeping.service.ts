import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BookingStatus,
  HousekeepingStatus,
  MemberRole,
  Prisma,
} from '@prisma/client';
import { PropertiesService } from '../catalog/properties.service';
import { UnitsService } from '../catalog/units.service';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateHousekeepingDto } from './dto/update-housekeeping.dto';
import {
  dateKey,
  needsCleaning,
  occupancyOn,
  priority,
  roomState,
  taskType,
} from './housekeeping.util';

/** Estados que cuentan como "trabajo terminado" en el progreso del turno. */
const DONE_STATUSES: HousekeepingStatus[] = [
  HousekeepingStatus.CLEAN,
  HousekeepingStatus.INSPECTED,
];

@Injectable()
export class HousekeepingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly properties: PropertiesService,
    private readonly units: UnitsService,
  ) {}

  /**
   * El tablero de un día: una fila por unidad, con su estado de limpieza real y
   * su ocupación derivada de las reservas.
   *
   * `day` llega del cliente y no se calcula acá: el panel sabe en qué día está
   * el usuario, y el servidor —que corre en UTC— no. Es la misma razón por la
   * que el dashboard mostraba cero llegadas después de las 7pm en Panamá.
   */
  async board(orgId: string, propertyId: string, day: string) {
    await this.properties.findOrThrow(orgId, propertyId);

    const [units, bookings, cleaners, cleanedToday] = await Promise.all([
      this.prisma.unit.findMany({
        where: { propertyId },
        include: {
          unitType: { select: { name: true } },
          housekeeper: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { label: 'asc' },
      }),
      /* Sólo las reservas que tocan este día: las que llegan, las que salen y
         las que están en curso. Traer el histórico completo para derivar la
         ocupación de una fecha sería absurdo. */
      this.prisma.booking.findMany({
        where: {
          propertyId,
          status: {
            notIn: [BookingStatus.CANCELLED, BookingStatus.NO_SHOW],
          },
          checkIn: { lte: new Date(day) },
          checkOut: { gte: new Date(day) },
        },
        select: {
          unitId: true,
          checkIn: true,
          checkOut: true,
          status: true,
          guest: { select: { fullName: true } },
        },
      }),
      this.findCleaners(orgId),
      this.countCleanedOn(orgId, propertyId, day),
    ]);

    const byUnit = new Map<string, typeof bookings>();
    for (const booking of bookings) {
      const list = byUnit.get(booking.unitId) ?? [];
      list.push(booking);
      byUnit.set(booking.unitId, list);
    }

    const rooms = units.map((unit) => {
      const unitBookings = byUnit.get(unit.id) ?? [];
      const occupancy = occupancyOn(unitBookings, day);

      /* Quién está en la habitación, para que camarería sepa a qué puerta no
         tocar. Sale de la reserva en curso o de la que llega hoy. */
      const current =
        unitBookings.find((b) => dateKey(b.checkOut) === day) ??
        unitBookings.find((b) => b.status === BookingStatus.CHECKED_IN) ??
        unitBookings.find((b) => dateKey(b.checkIn) === day);

      return {
        unitId: unit.id,
        label: unit.label,
        unitTypeName: unit.unitType.name,
        active: unit.active,
        housekeepingStatus: unit.housekeepingStatus,
        note: unit.housekeepingNote,
        state: roomState(unit, occupancy),
        taskType: taskType(unit, occupancy),
        priority: priority(unit, occupancy),
        needsCleaning: needsCleaning(unit),
        housekeeper: unit.housekeeper
          ? {
              id: unit.housekeeper.id,
              name: unit.housekeeper.fullName ?? unit.housekeeper.email,
            }
          : null,
        guestName: current?.guest.fullName ?? null,
      };
    });

    const pending = rooms.filter((room) => room.needsCleaning).length;

    return {
      date: day,
      /* El denominador del progreso sale de la bitácora, no de un contador de
         turno: lo que falta (sucias ahora) más lo que ya se hizo (eventos de
         hoy). Sin la bitácora, marcar una habitación limpia la haría
         desaparecer del total y el progreso siempre diría 100%. */
      summary: {
        pending,
        cleanedToday,
        total: pending + cleanedToday,
        highPriority: rooms.filter(
          (room) => room.needsCleaning && room.priority === 'high',
        ).length,
      },
      rooms,
      cleaners,
    };
  }

  /**
   * Cambia el estado de limpieza de una unidad y lo deja anotado.
   *
   * Escribir el estado y la bitácora van en una transacción: un estado sin su
   * evento deja un cambio sin autor, y es justo lo que se pregunta cuando algo
   * sale mal.
   */
  async update(
    orgId: string,
    propertyId: string,
    unitId: string,
    dto: UpdateHousekeepingDto,
    actorId: string,
  ) {
    const unit = await this.units.findOrThrow(orgId, propertyId, unitId);

    if (dto.housekeeperId !== undefined) {
      await this.assertHousekeeperBelongsToOrg(orgId, dto.housekeeperId);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.unit.update({
        where: { id: unitId },
        data: {
          ...(dto.status !== undefined
            ? { housekeepingStatus: dto.status }
            : {}),
          ...(dto.note !== undefined ? { housekeepingNote: dto.note } : {}),
          ...(dto.housekeeperId !== undefined
            ? { housekeeperId: dto.housekeeperId }
            : {}),
        },
      });

      // Sólo el cambio de estado va a la bitácora. Reasignar a otra persona o
      // corregir una nota no es un hecho que haya que auditar.
      if (dto.status !== undefined && dto.status !== unit.housekeepingStatus) {
        await tx.housekeepingEvent.create({
          data: {
            orgId,
            unitId,
            fromStatus: unit.housekeepingStatus,
            toStatus: dto.status,
            actorId,
            note: dto.note,
          },
        });
      }

      return updated;
    });
  }

  /**
   * Deja la unidad sucia tras un check-out, dentro de la transacción de quien
   * llama.
   *
   * Es la única automatización del módulo, y es la que evita el error más caro
   * de recepción: vender una habitación que nadie limpió. El personal puede
   * corregirla a mano después; lo que no puede es acordarse siempre.
   */
  async markDirtyAfterCheckOut(
    tx: Prisma.TransactionClient,
    unit: { id: string; orgId: string; housekeepingStatus: HousekeepingStatus },
    actorId: string,
  ): Promise<void> {
    if (unit.housekeepingStatus === HousekeepingStatus.DIRTY) return;

    await tx.unit.update({
      where: { id: unit.id },
      data: { housekeepingStatus: HousekeepingStatus.DIRTY },
    });
    await tx.housekeepingEvent.create({
      data: {
        orgId: unit.orgId,
        unitId: unit.id,
        fromStatus: unit.housekeepingStatus,
        toStatus: HousekeepingStatus.DIRTY,
        actorId,
        note: 'Check-out',
      },
    });
  }

  /** Bitácora de una unidad, lo más reciente primero. */
  async history(orgId: string, propertyId: string, unitId: string) {
    await this.units.findOrThrow(orgId, propertyId, unitId);
    return this.prisma.housekeepingEvent.findMany({
      where: { unitId },
      include: {
        actor: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  private async findCleaners(orgId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { orgId, role: MemberRole.HOUSEKEEPING },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
    return memberships.map((m) => ({
      id: m.user.id,
      name: m.user.fullName ?? m.user.email,
    }));
  }

  /**
   * Cuántas habitaciones se terminaron hoy, según la bitácora.
   *
   * La ventana es el día UTC. El sistema entero trata las fechas de calendario
   * en UTC —las columnas son `@db.Date`— y mezclar husos acá haría que el
   * progreso del turno no cuadre con el resto del panel.
   */
  private async countCleanedOn(orgId: string, propertyId: string, day: string) {
    const start = new Date(`${day}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    return this.prisma.housekeepingEvent.count({
      where: {
        orgId,
        unit: { propertyId },
        toStatus: { in: DONE_STATUSES },
        createdAt: { gte: start, lt: end },
      },
    });
  }

  private async assertHousekeeperBelongsToOrg(
    orgId: string,
    housekeeperId: string | null,
  ): Promise<void> {
    if (housekeeperId === null) return;
    const membership = await this.prisma.membership.findFirst({
      where: { orgId, userId: housekeeperId },
    });
    if (!membership) {
      throw new BadRequestException(
        'La persona que intentás asignar no pertenece a esta organización.',
      );
    }
  }
}
