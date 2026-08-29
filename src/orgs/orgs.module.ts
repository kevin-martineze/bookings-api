import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MembersService } from './members.service';
import { OrgsController } from './orgs.controller';

@Module({
  imports: [AuthModule],
  controllers: [OrgsController],
  providers: [MembersService],
})
export class OrgsModule {}
