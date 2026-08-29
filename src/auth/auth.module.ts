import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { OrgRolesGuard } from './guards/org-roles.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      // El JwtService global firma con este TTL; login/refresh pasan su propio
      // `expiresIn` igual, así que este valor es sólo el respaldo por defecto.
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        // `expiresIn` tipa como el `StringValue` de `ms`, no `string` — el valor
        // viene de una env var y jsonwebtoken lo acepta en runtime igual.
        signOptions: {
          expiresIn: config.getOrThrow<string>(
            'JWT_ACCESS_TTL',
          ) as unknown as number,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordResetService, JwtStrategy, OrgRolesGuard],
  exports: [OrgRolesGuard],
})
export class AuthModule {}
