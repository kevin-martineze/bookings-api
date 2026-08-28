import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

/** Intentos fallidos que disparan el bloqueo temporal de la cuenta. */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con ese correo.');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    const user = await this.prisma.user.create({
      data: { email, passwordHash, fullName: dto.fullName },
    });

    return { id: user.id, email: user.email, fullName: user.fullName };
  }

  async login(
    dto: LoginDto,
    context: { userAgent?: string; ip?: string },
  ): Promise<TokenPair> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Mismo mensaje exista o no la cuenta: no delatar qué correos están registrados.
    const invalidCredentials = () =>
      new UnauthorizedException('Correo o contraseña inválidos.');
    if (!user || !user.passwordHash) throw invalidCredentials();

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Cuenta bloqueada temporalmente por demasiados intentos.',
      );
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      await this.registerFailedAttempt(user.id, user.failedLoginAttempts);
      throw invalidCredentials();
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    return this.issueTokenPair(user.id, user.email, randomUUID(), context);
  }

  async refresh(
    refreshToken: string,
    context: { userAgent?: string; ip?: string },
  ): Promise<TokenPair> {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored) throw new UnauthorizedException('Refresh token inválido.');

    if (stored.revokedAt) {
      // Reuso de un token ya rotado: alguien más tiene una copia. Se corta toda la familia.
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException(
        'Refresh token reutilizado. Sesión revocada, volvé a iniciar sesión.',
      );
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expirado.');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: stored.userId },
    });
    return this.issueTokenPair(user.id, user.email, stored.familyId, context);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!stored) return;

    await this.prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { memberships: { include: { organization: true } } },
    });

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      memberships: user.memberships.map((m) => ({
        orgId: m.orgId,
        orgName: m.organization.name,
        role: m.role,
      })),
    };
  }

  private async registerFailedAttempt(
    userId: string,
    currentAttempts: number,
  ): Promise<void> {
    const attempts = currentAttempts + 1;
    const lockedUntil =
      attempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
        : null;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: attempts >= MAX_FAILED_ATTEMPTS ? 0 : attempts,
        lockedUntil,
      },
    });
  }

  private async issueTokenPair(
    userId: string,
    email: string,
    familyId: string,
    context: { userAgent?: string; ip?: string },
  ): Promise<TokenPair> {
    const accessTtl = this.config.getOrThrow<string>('JWT_ACCESS_TTL');
    const refreshTtl = this.config.getOrThrow<string>('JWT_REFRESH_TTL');

    const accessToken = this.jwt.sign(
      { sub: userId, email },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        // Mismo motivo que en auth.module.ts: `expiresIn` tipa como `StringValue`, no `string`.
        expiresIn: accessTtl as unknown as number,
      },
    );

    const refreshToken = randomBytes(48).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        familyId,
        expiresAt: new Date(Date.now() + parseDurationMs(refreshTtl)),
        userAgent: context.userAgent,
        ip: context.ip,
      },
    });

    return { accessToken, refreshToken, expiresIn: accessTtl };
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Convierte duraciones tipo "30d", "15m", "12h" a milisegundos. Sin dependencias externas. */
function parseDurationMs(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration.trim());
  if (!match)
    throw new Error(
      `Duración inválida: "${duration}". Usar formato "30d", "15m", etc.`,
    );

  const value = Number(match[1]);
  const unitMs = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[
    match[2] as 's' | 'm' | 'h' | 'd'
  ];
  return value * unitMs;
}
