import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { PropertiesService } from './properties.service';
import { UnitsService } from './units.service';

type FakeProperty = { id: string; orgId: string };
type FakeUnitType = { id: string; orgId: string; propertyId: string };
type FakeUnit = {
  id: string;
  orgId: string;
  propertyId: string;
  unitTypeId: string;
  label: string;
};

/**
 * Doble en memoria de PrismaService, igual en espíritu al de
 * auth.service.spec.ts: sólo cubre lo que UnitsService y PropertiesService
 * usan, pero con estado real entre llamadas.
 */
function createFakePrisma() {
  const properties = new Map<string, FakeProperty>();
  const unitTypes = new Map<string, FakeUnitType>();
  const units = new Map<string, FakeUnit>();

  return {
    property: {
      findFirst({ where }: { where: { id: string; orgId: string } }) {
        const property = properties.get(where.id);
        return property && property.orgId === where.orgId ? property : null;
      },
    },
    unitType: {
      findFirst({ where }: { where: { id: string; orgId: string } }) {
        const unitType = unitTypes.get(where.id);
        return unitType && unitType.orgId === where.orgId ? unitType : null;
      },
    },
    unit: {
      create({ data }: { data: Omit<FakeUnit, 'id'> }) {
        const unit: FakeUnit = { ...data, id: randomUUID() };
        units.set(unit.id, unit);
        return unit;
      },
      findFirst({
        where,
      }: {
        where: { id: string; propertyId: string; orgId: string };
      }) {
        const unit = units.get(where.id);
        return unit &&
          unit.propertyId === where.propertyId &&
          unit.orgId === where.orgId
          ? unit
          : null;
      },
    },
    _seed: { properties, unitTypes },
  };
}

describe('UnitsService', () => {
  const orgId = randomUUID();

  function setup() {
    const prisma = createFakePrisma();
    const properties = new PropertiesService(
      prisma as unknown as PrismaService,
    );
    const units = new UnitsService(
      prisma as unknown as PrismaService,
      properties,
    );
    return { prisma, units };
  }

  it('rejects a unitTypeId that belongs to a different property', async () => {
    const { prisma, units } = setup();
    const propertyA = { id: randomUUID(), orgId };
    const propertyB = { id: randomUUID(), orgId };
    const unitTypeOfB = { id: randomUUID(), orgId, propertyId: propertyB.id };
    prisma._seed.properties.set(propertyA.id, propertyA);
    prisma._seed.properties.set(propertyB.id, propertyB);
    prisma._seed.unitTypes.set(unitTypeOfB.id, unitTypeOfB);

    await expect(
      units.create(orgId, propertyA.id, {
        label: '101',
        unitTypeId: unitTypeOfB.id,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a unitTypeId that does not exist', async () => {
    const { prisma, units } = setup();
    const propertyA = { id: randomUUID(), orgId };
    prisma._seed.properties.set(propertyA.id, propertyA);

    await expect(
      units.create(orgId, propertyA.id, {
        label: '101',
        unitTypeId: randomUUID(),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates the unit when the unitTypeId belongs to the same property', async () => {
    const { prisma, units } = setup();
    const propertyA = { id: randomUUID(), orgId };
    const unitTypeOfA = { id: randomUUID(), orgId, propertyId: propertyA.id };
    prisma._seed.properties.set(propertyA.id, propertyA);
    prisma._seed.unitTypes.set(unitTypeOfA.id, unitTypeOfA);

    const unit = await units.create(orgId, propertyA.id, {
      label: '101',
      unitTypeId: unitTypeOfA.id,
    });

    expect(unit.label).toBe('101');
    expect(unit.propertyId).toBe(propertyA.id);
  });
});
