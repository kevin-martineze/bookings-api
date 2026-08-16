import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Global para que ningún módulo tenga que importarlo explícitamente. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
