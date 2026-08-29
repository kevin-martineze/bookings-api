import { randomUUID } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

type FakeUser = {
  id: string;
  email: string;
  passwordHash: string | null;
  fullName: string | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
};

type FakeRefreshToken = {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

/**
 * Doble en memoria de PrismaService. Cubre sólo lo que AuthService usa, pero
 * mantiene estado real entre llamadas — necesario para probar rotación y
 * reuso de refresh tokens, que son inherentemente un flujo de varios pasos.
 */
function createFakePrisma() {
  const users = new Map<string, FakeUser>();
  const refreshTokens = new Map<string, FakeRefreshToken>();

  return {
    user: {
      create({ data }: { data: Partial<FakeUser> & { email: string } }) {
        const user: FakeUser = {
          id: randomUUID(),
          email: data.email,
          passwordHash: data.passwordHash ?? null,
          fullName: data.fullName ?? null,
          failedLoginAttempts: 0,
          lockedUntil: null,
        };
        users.set(user.id, user);
        return user;
      },
      findUnique({ where }: { where: { email?: string; id?: string } }) {
        return (
          [...users.values()].find(
            (u) =>
              (where.email && u.email === where.email) ||
              (where.id && u.id === where.id),
          ) ?? null
        );
      },
      findUniqueOrThrow({ where }: { where: { id: string } }) {
        const user = users.get(where.id);
        if (!user) throw new Error('User not found');
        return user;
      },
      update({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeUser>;
      }) {
        const user = users.get(where.id);
        if (!user) throw new Error('User not found');
        Object.assign(user, data);
        return user;
      },
    },
    refreshToken: {
      create({ data }: { data: Omit<FakeRefreshToken, 'id' | 'revokedAt'> }) {
        const token: FakeRefreshToken = {
          ...data,
          id: randomUUID(),
          revokedAt: null,
        };
        refreshTokens.set(token.id, token);
        return token;
      },
      findUnique({ where }: { where: { tokenHash: string } }) {
        return (
          [...refreshTokens.values()].find(
            (t) => t.tokenHash === where.tokenHash,
          ) ?? null
        );
      },
      update({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeRefreshToken>;
      }) {
        const token = refreshTokens.get(where.id);
        if (!token) throw new Error('Token not found');
        Object.assign(token, data);
        return token;
      },
      updateMany({
        where,
        data,
      }: {
        where: { familyId: string; revokedAt: null };
        data: Partial<FakeRefreshToken>;
      }) {
        let count = 0;
        for (const token of refreshTokens.values()) {
          if (token.familyId === where.familyId && token.revokedAt === null) {
            Object.assign(token, data);
            count += 1;
          }
        }
        return { count };
      },
    },
    _users: users,
  };
}

const CONFIG_VALUES: Record<string, string> = {
  JWT_ACCESS_SECRET: 'test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '30d',
};

function createFakeConfig(): ConfigService {
  return {
    getOrThrow: (key: string) => CONFIG_VALUES[key],
  } as unknown as ConfigService;
}

describe('AuthService', () => {
  let prisma: ReturnType<typeof createFakePrisma>;
  let service: AuthService;
  const context = { userAgent: 'jest', ip: '127.0.0.1' };

  async function seedUser(email: string, password: string) {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    return prisma.user.create({ data: { email, passwordHash } });
  }

  beforeEach(() => {
    prisma = createFakePrisma();
    service = new AuthService(
      prisma as unknown as PrismaService,
      new JwtService({}),
      createFakeConfig(),
    );
  });

  describe('login', () => {
    it('locks the account after 5 failed attempts', async () => {
      await seedUser('julius@daughtersofsun.test', 'correct-password');

      for (let i = 0; i < 5; i++) {
        await expect(
          service.login(
            { email: 'julius@daughtersofsun.test', password: 'wrong' },
            context,
          ),
        ).rejects.toThrow(UnauthorizedException);
      }

      // Contraseña correcta, pero la cuenta ya está bloqueada por los 5 intentos previos.
      await expect(
        service.login(
          { email: 'julius@daughtersofsun.test', password: 'correct-password' },
          context,
        ),
      ).rejects.toThrow('Cuenta bloqueada temporalmente');
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token on each use', async () => {
      await seedUser('julius@daughtersofsun.test', 'correct-password');
      const pair1 = await service.login(
        { email: 'julius@daughtersofsun.test', password: 'correct-password' },
        context,
      );

      const pair2 = await service.refresh(pair1.refreshToken, context);

      expect(pair2.refreshToken).not.toBe(pair1.refreshToken);
    });

    it('revokes the whole token family when a rotated token is reused', async () => {
      await seedUser('julius@daughtersofsun.test', 'correct-password');
      const pair1 = await service.login(
        { email: 'julius@daughtersofsun.test', password: 'correct-password' },
        context,
      );
      const pair2 = await service.refresh(pair1.refreshToken, context);

      // Reusar el token viejo (ya rotado) es la señal de que alguien tiene una copia.
      await expect(
        service.refresh(pair1.refreshToken, context),
      ).rejects.toThrow('Refresh token reutilizado');

      // La familia entera queda revocada, incluyendo el token que sí era válido.
      await expect(
        service.refresh(pair2.refreshToken, context),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
