import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

@ApiTags('Sistema')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Estado del servicio, para el monitoreo de uptime y para el chequeo de salud
   * del hosting.
   *
   * Toca la base de verdad en vez de devolver `{ok:true}` sin más: el modo de
   * falla que importa no es que el proceso se caiga —eso lo reinicia el
   * hosting— sino que siga en pie sin poder hablar con Postgres. Un chequeo que
   * no consulta la base declara sano un servidor que no puede atender una sola
   * reserva.
   *
   * Devuelve 503 cuando la base no responde, que es lo que un monitor entiende
   * como caída sin necesidad de leer el cuerpo.
   */
  @Get('health')
  async health() {
    const startedAt = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      /* No se propaga el error de Postgres: un chequeo de salud es público y no
         tiene por qué revelar el host de la base ni la versión del motor. */
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'unreachable',
      });
    }

    return {
      status: 'ok',
      database: 'ok',
      databaseLatencyMs: Date.now() - startedAt,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
