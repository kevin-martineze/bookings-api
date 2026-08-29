import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { HousekeepingModule } from '../housekeeping/housekeeping.module';
import { PricingModule } from '../pricing/pricing.module';
import { AvailabilityController } from './availability.controller';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [AuthModule, CatalogModule, PricingModule, HousekeepingModule],
  controllers: [BookingsController, AvailabilityController],
  providers: [BookingsService],
})
export class BookingsModule {}
