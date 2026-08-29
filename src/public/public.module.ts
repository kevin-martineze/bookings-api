import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

/**
 * No importa `AuthModule`: es el único módulo sin autenticación. El límite por
 * IP se configura a nivel de la aplicación (`app.module.ts`).
 */
@Module({
  imports: [PricingModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
