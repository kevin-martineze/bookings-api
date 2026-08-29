import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { CatalogModule } from './catalog/catalog.module';
import { HousekeepingModule } from './housekeeping/housekeeping.module';
import { MailModule } from './mail/mail.module';
import { OrgsModule } from './orgs/orgs.module';
import { PricingModule } from './pricing/pricing.module';
import { PrismaModule } from './prisma/prisma.module';
import { PublicModule } from './public/public.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    /* Límite por IP. El techo global es holgado a propósito: lo que de verdad
       hace falta acotar son los endpoints públicos, y cada uno declara su
       propio límite con `@Throttle`. Un techo global agresivo estorbaría al
       personal, que trabaja detrás de una sola IP en el hotel. */
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    // Tareas programadas: hoy sólo liberar retenciones vencidas.
    ScheduleModule.forRoot(),
    PrismaModule,
    MailModule,
    AuthModule,
    OrgsModule,
    CatalogModule,
    PricingModule,
    HousekeepingModule,
    BookingsModule,
    ReportsModule,
    PublicModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
