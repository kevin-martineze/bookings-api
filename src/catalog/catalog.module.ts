import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';
import { UnitTypesController } from './unit-types.controller';
import { UnitTypesService } from './unit-types.service';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';

@Module({
  imports: [AuthModule],
  controllers: [PropertiesController, UnitTypesController, UnitsController],
  providers: [PropertiesService, UnitTypesService, UnitsService],
  exports: [PropertiesService, UnitTypesService, UnitsService],
})
export class CatalogModule {}
