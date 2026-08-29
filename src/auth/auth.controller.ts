import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import {
  CurrentUser,
  type AuthenticatedUser,
} from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import {
  RequestPasswordResetDto,
  ResetPasswordDto,
} from './dto/password-reset.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PasswordResetService } from './password-reset.service';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, requestContext(req));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, requestContext(req));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }

  /**
   * Pide un enlace de restablecimiento.
   *
   * Responde 200 exista o no la cuenta: decir "ese correo no está registrado"
   * convertiría el endpoint en una forma de averiguar quién tiene cuenta, y en
   * un hotel chico saber qué correos son del personal es el primer paso de un
   * intento de suplantación.
   *
   * Limitado por IP: sin freno, es un generador de correos hacia terceros.
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  forgotPassword(@Body() dto: RequestPasswordResetDto) {
    return this.passwordReset.request(dto.email);
  }

  /** Consuma el token, fija la contraseña y cierra todas las sesiones. */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordReset.reset(dto.token, dto.password);
  }
}

function requestContext(req: Request): { userAgent?: string; ip?: string } {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}
