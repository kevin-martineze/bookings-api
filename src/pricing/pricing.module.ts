import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import {
  QuoteController,
  RateCalendarController,
  RatePlansController,
} from './pricing.controller';
import { PricingService } from './pricing.service';

@Module({
  imports: [AuthModule, CatalogModule],
  controllers: [RatePlansController, QuoteController, RateCalendarController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
