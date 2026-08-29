import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let controller: AppController;
  let queryRaw: jest.Mock;

  beforeEach(async () => {
    queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        // Doble de la base: el chequeo sólo necesita saber si responde.
        { provide: PrismaService, useValue: { $queryRaw: queryRaw } },
      ],
    }).compile();

    controller = app.get(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(controller.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('reports ok when the database answers', async () => {
      const result = await controller.health();
      expect(result.status).toBe('ok');
      expect(result.database).toBe('ok');
      expect(queryRaw).toHaveBeenCalled();
    });

    it('fails when the database does not answer', async () => {
      // El caso que importa: el proceso vive pero no puede atender una reserva.
      queryRaw.mockRejectedValue(new Error('connection refused'));
      await expect(controller.health()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('does not leak the database error to the caller', async () => {
      // El chequeo es público: no puede filtrar el host ni el motor.
      queryRaw.mockRejectedValue(
        new Error('could not connect to ep-secret-host.neon.tech'),
      );
      await expect(controller.health()).rejects.not.toThrow(/neon\.tech/);
    });
  });
});
