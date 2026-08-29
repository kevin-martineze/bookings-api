import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  BookingSource,
  BookingStatus,
  HousekeepingStatus,
  MemberRole,
  PrismaClient,
} from '@prisma/client';
import * as argon2 from 'argon2';

/**
 * Datos mínimos para poder loguearse y probar el RolesGuard en desarrollo, más
 * un inventario de ejemplo (una property, dos unit types, tres units) para que
 * los endpoints de catálogo devuelvan algo real desde el primer `GET`.
 *
 * Dos usuarios a propósito: el OWNER debe poder ver el roster de staff, el
 * FRONT_DESK no — es la prueba real de que `OrgRolesGuard` rechaza por rol.
 * Contraseñas de desarrollo, nunca usar fuera de local.
 */
const SEED_USERS = [
  { email: 'julius@daughtersofsun.test', fullName: 'Julius', password: 'OwnerDev123!', role: MemberRole.OWNER },
  {
    email: 'recepcion@daughtersofsun.test',
    fullName: 'Yaritza (recepción)',
    password: 'FrontDeskDev123!',
    role: MemberRole.FRONT_DESK,
  },
  {
    email: 'camareria@daughtersofsun.test',
    fullName: 'Marisol (camarería)',
    password: 'HousekeepingDev123!',
    role: MemberRole.HOUSEKEEPING,
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Falta DATABASE_URL.');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const org = await prisma.organization.upsert({
    where: { slug: 'daughters-of-sun' },
    update: {},
    create: { name: 'Daughters of Sun', slug: 'daughters-of-sun' },
  });

  for (const seedUser of SEED_USERS) {
    const passwordHash = await argon2.hash(seedUser.password, { type: argon2.argon2id });

    const user = await prisma.user.upsert({
      where: { email: seedUser.email },
      update: { passwordHash, fullName: seedUser.fullName },
      create: { email: seedUser.email, fullName: seedUser.fullName, passwordHash },
    });

    await prisma.membership.upsert({
      where: { orgId_userId: { orgId: org.id, userId: user.id } },
      update: { role: seedUser.role },
      create: { orgId: org.id, userId: user.id, role: seedUser.role },
    });

    console.log(`${seedUser.role} listo: ${seedUser.email} / ${seedUser.password}`);
  }

  const property = await prisma.property.upsert({
    where: { orgId_slug: { orgId: org.id, slug: 'hotel-principal' } },
    update: {},
    create: {
      orgId: org.id,
      name: 'Daughters of Sun — Hotel principal',
      slug: 'hotel-principal',
      timezone: 'America/Panama',
      locality: 'David',
      region: 'Chiriquí',
      country: 'PA',
      currency: 'USD',
      checkIn: '15:00',
      checkOut: '11:00',
    },
  });

  const standardDouble = await prisma.unitType.upsert({
    where: { propertyId_slug: { propertyId: property.id, slug: 'standard-doble' } },
    update: {},
    create: {
      orgId: org.id,
      propertyId: property.id,
      name: 'Standard Doble',
      slug: 'standard-doble',
      maxGuests: 2,
      bedrooms: 1,
      beds: 1,
      baths: 1,
      basePriceMinor: 8000,
      minNights: 1,
    },
  });

  const suiteTerraza = await prisma.unitType.upsert({
    where: { propertyId_slug: { propertyId: property.id, slug: 'suite-terraza' } },
    update: {},
    create: {
      orgId: org.id,
      propertyId: property.id,
      name: 'Suite con terraza',
      slug: 'suite-terraza',
      maxGuests: 3,
      bedrooms: 1,
      beds: 1,
      baths: 1.5,
      basePriceMinor: 15000,
      minNights: 1,
    },
  });

  /* Estados de limpieza distintos a propósito: un tablero donde todo está
     limpio no muestra nada. La 102 arranca sucia y con una nota de
     mantenimiento; el resto limpio, y el check-out de hoy ensuciará la suya
     solo. */
  const unitSeeds = [
    { label: '101', unitTypeId: standardDouble.id, housekeepingStatus: HousekeepingStatus.CLEAN },
    {
      label: '102',
      unitTypeId: standardDouble.id,
      housekeepingStatus: HousekeepingStatus.DIRTY,
      housekeepingNote: 'El aire acondicionado no enfría — avisar a mantenimiento.',
    },
    { label: '201', unitTypeId: suiteTerraza.id, housekeepingStatus: HousekeepingStatus.INSPECTED },
  ];
  const units = new Map<string, string>();
  for (const unit of unitSeeds) {
    const created = await prisma.unit.upsert({
      where: { propertyId_label: { propertyId: property.id, label: unit.label } },
      update: {
        housekeepingStatus: unit.housekeepingStatus,
        housekeepingNote: unit.housekeepingNote ?? null,
      },
      create: {
        orgId: org.id,
        propertyId: property.id,
        unitTypeId: unit.unitTypeId,
        label: unit.label,
        housekeepingStatus: unit.housekeepingStatus,
        housekeepingNote: unit.housekeepingNote ?? null,
      },
    });
    units.set(unit.label, created.id);
  }

  const plans = await seedRatePlans(prisma, {
    orgId: org.id,
    standardDoubleId: standardDouble.id,
    suiteTerrazaId: suiteTerraza.id,
  });

  const bookings = await seedTodayBookings(prisma, {
    orgId: org.id,
    propertyId: property.id,
    currency: property.currency,
    standardDoubleId: standardDouble.id,
    suiteTerrazaId: suiteTerraza.id,
    basePriceMinor: standardDouble.basePriceMinor,
    units,
  });

  console.log(`\nOrganización: ${org.name} (${org.id})`);
  console.log(`Property: ${property.name} (${property.id})`);
  console.log(`Unit types: ${standardDouble.name}, ${suiteTerraza.name}`);
  console.log(`Units: ${unitSeeds.map((u) => u.label).join(', ')}`);
  console.log(`Planes tarifarios: ${plans}`);
  console.log(`Reservas alrededor de hoy: ${bookings}`);
  await prisma.$disconnect();
}

/**
 * Tarifas de ejemplo para poder ver el motor funcionando.
 *
 * Son inventadas y están para desarrollo — las reales las define Julius y
 * siguen pendientes en su lista de tareas. Lo que sí es real es la FORMA: una
 * temporada con recargo de fin de semana y estadía mínima, que es exactamente
 * lo que la cotización promete poder configurar.
 */
async function seedRatePlans(
  prisma: PrismaClient,
  ctx: { orgId: string; standardDoubleId: string; suiteTerrazaId: string },
): Promise<number> {
  const now = new Date();
  const year = now.getFullYear();

  /* Una temporada que cubre el presente. Sin esto el mapa de tarifas se ve
     plano —la temporada seca arranca en diciembre— y no se puede mostrar el
     recargo de fin de semana funcionando. Mismo criterio que las reservas
     relativas a hoy. */
  const lowSeasonStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const lowSeasonEnd = new Date(Date.UTC(year, 11, 14));

  const plans = [
    {
      name: 'Temporada baja (lluvias)',
      unitTypeId: ctx.standardDoubleId,
      startDate: lowSeasonStart,
      endDate: lowSeasonEnd,
      priceMinor: 8000,
      weekendPriceMinor: 9800,
      minNights: 1,
    },
    {
      name: 'Temporada baja (lluvias)',
      unitTypeId: ctx.suiteTerrazaId,
      startDate: lowSeasonStart,
      endDate: lowSeasonEnd,
      priceMinor: 15000,
      weekendPriceMinor: 18500,
      minNights: 1,
    },
    {
      name: 'Temporada alta (seco)',
      unitTypeId: ctx.standardDoubleId,
      startDate: new Date(Date.UTC(year, 11, 15)), // 15 dic
      endDate: new Date(Date.UTC(year + 1, 3, 15)), // 15 abr
      priceMinor: 11000,
      weekendPriceMinor: 14000,
      minNights: 2,
    },
    {
      name: 'Temporada alta (seco)',
      unitTypeId: ctx.suiteTerrazaId,
      startDate: new Date(Date.UTC(year, 11, 15)),
      endDate: new Date(Date.UTC(year + 1, 3, 15)),
      priceMinor: 19000,
      weekendPriceMinor: 24000,
      minNights: 2,
    },
    /* Rango corto DENTRO de la temporada alta: prueba la regla de "gana el plan
       más específico" sin tener que partir la temporada en tres. */
    {
      name: 'Fin de año',
      unitTypeId: ctx.standardDoubleId,
      startDate: new Date(Date.UTC(year, 11, 28)),
      endDate: new Date(Date.UTC(year + 1, 0, 2)),
      priceMinor: 18000,
      weekendPriceMinor: 20000,
      minNights: 3,
    },
  ];

  let created = 0;
  for (const item of plans) {
    const exists = await prisma.ratePlan.findFirst({
      where: { unitTypeId: item.unitTypeId, name: item.name, startDate: item.startDate },
    });
    if (exists) {
      await prisma.ratePlan.update({ where: { id: exists.id }, data: item });
    } else {
      await prisma.ratePlan.create({ data: { ...item, orgId: ctx.orgId } });
    }
    created += 1;
  }
  return created;
}

/**
 * Fecha de calendario a N días de hoy.
 *
 * "Hoy" se toma del calendario LOCAL, no del UTC, y recién después se fija a
 * medianoche UTC para guardarla como `date` pura. La diferencia no es
 * cosmética: en Panamá (UTC-5), a las 9 de la noche el día UTC ya cambió, así
 * que un seed basado en UTC crea la llegada "de hoy" para mañana y el panel
 * —que usa la fecha local— muestra cero llegadas.
 */
function dayFromToday(offset: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offset));
}

/**
 * Reservas relativas a HOY, no con fechas fijas.
 *
 * Sin esto el dashboard muestra cero llegadas y cero salidas, así que no hay
 * nada que probar ni nada que mostrarle al cliente. Y con fechas fijas la demo
 * se vería rota tres semanas después de escribirla — el mismo criterio que ya
 * usa el generador de datos del frontend.
 *
 * Se salta cualquier reserva que choque contra la restricción de exclusión: el
 * seed es idempotente para todo lo demás, y volver a correrlo no debe fallar
 * por reservas que ya existen.
 */
async function seedTodayBookings(
  prisma: PrismaClient,
  ctx: {
    orgId: string;
    propertyId: string;
    currency: string;
    standardDoubleId: string;
    suiteTerrazaId: string;
    basePriceMinor: number;
    units: Map<string, string>;
  },
): Promise<number> {
  const plan = [
    // Llega hoy: es sobre la que se prueba el check-in.
    { room: '101', name: 'Marisol Vega', from: 0, to: 3, status: BookingStatus.CONFIRMED },
    // Sale hoy: entró hace dos noches, es la del check-out.
    { room: '102', name: 'Diego Castillo', from: -2, to: 0, status: BookingStatus.CHECKED_IN },
    // En curso: ni llega ni sale hoy, ocupa la fila del calendario.
    { room: '201', name: 'Hannah Weber', from: -1, to: 4, status: BookingStatus.CHECKED_IN },
  ];

  let created = 0;
  for (const item of plan) {
    const unitId = ctx.units.get(item.room);
    if (!unitId) continue;

    const checkIn = dayFromToday(item.from);
    const checkOut = dayFromToday(item.to);
    const nights = item.to - item.from;
    const total = nights * ctx.basePriceMinor;

    const email = `${item.name.toLowerCase().replace(/[^a-z]/g, '')}@example.com`;
    const guest = await prisma.guest.upsert({
      where: { orgId_email: { orgId: ctx.orgId, email } },
      update: {},
      create: { orgId: ctx.orgId, email, fullName: item.name, phone: '+507 6000-0000' },
    });

    /* Upsert por referencia: volver a correr el seed reajusta las fechas a
       "hoy" en vez de dejar las de la corrida anterior, que ya quedaron viejas.
       Es lo que hace que el dashboard siga teniendo llegadas del día una semana
       después. */
    const data = {
      orgId: ctx.orgId,
      propertyId: ctx.propertyId,
      unitTypeId: item.room === '201' ? ctx.suiteTerrazaId : ctx.standardDoubleId,
      unitId,
      guestId: guest.id,
      checkIn,
      checkOut,
      guests: 1,
      status: item.status,
      source: BookingSource.STAFF,
      subtotalMinor: total,
      taxMinor: 0,
      feesMinor: 0,
      totalMinor: total,
      currency: ctx.currency,
    };

    try {
      await prisma.booking.upsert({
        where: { reference: `SEED${item.room}` },
        update: { checkIn, checkOut, status: item.status },
        create: { ...data, reference: `SEED${item.room}` },
      });
      created += 1;
    } catch {
      // Choca contra la restricción de exclusión: ya hay otra reserva en esas
      // noches para esa unidad. El resto del seed sigue.
    }
  }
  return created;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
