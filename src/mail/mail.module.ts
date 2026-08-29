import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * Global porque lo usan auth, reservas y el módulo público, y ninguno de ellos
 * tiene otra razón para conocerse entre sí. Importarlo en cada uno sólo
 * agregaría ruido.
 */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
