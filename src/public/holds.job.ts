import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Libera las retenciones vencidas de las solicitudes del sitio.
 *
 * Una reserva `PENDING` retiene inventario de verdad: la restricción de
 * exclusión de la base la cuenta igual que una confirmada. Hasta ahora se
 * barrían de forma perezosa —sólo cuando alguien consultaba disponibilidad—, y
 * eso deja un agujero preciso: **si nadie consulta, la habitación queda
 * bloqueada indefinidamente**. En temporada baja pueden pasar días sin una sola
 * consulta, que es justo cuando el hotel menos puede permitirse una habitación
 * bloqueada por error.
 *
 * Cada quince minutos y no cada minuto: el vencimiento es de 48 horas, así que
 * un cuarto de hora de imprecisión no le cambia la vida a nadie, y el barrido
 * perezoso sigue cubriendo el instante exacto en que importa.
 */
@Injectable()
export class HoldsJob {
  private readonly logger = new Logger(HoldsJob.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async releaseExpiredHolds(): Promise<void> {
    const { count } = await this.prisma.booking.updateMany({
      where: {
        status: BookingStatus.PENDING,
        holdExpiresAt: { lt: new Date() },
      },
      data: { status: BookingStatus.CANCELLED, cancelledAt: new Date() },
    });

    /* Sólo se registra cuando hubo algo que liberar. Un log cada diez minutos
       diciendo "cero" entrena a ignorar el log. */
    if (count > 0) {
      this.logger.log(`Retenciones vencidas liberadas: ${count}`);
    }
  }
}
