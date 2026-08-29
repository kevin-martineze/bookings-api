import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { HousekeepingController } from './housekeeping.controller';
import { HousekeepingService } from './housekeeping.service';

@Module({
  imports: [AuthModule, CatalogModule],
  controllers: [HousekeepingController],
  providers: [HousekeepingService],
  // Reservas lo usa para ensuciar la unidad al hacer check-out.
  exports: [HousekeepingService],
})
export class HousekeepingModule {}
