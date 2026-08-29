import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MemberRole } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

/**
 * Aislamiento entre inquilinos, entre alojamientos y entre roles.
 *
 * Existe porque ya apareció **un bug real de esta clase**: `OrgRolesGuard`
 * dejaba pasar a cualquier usuario autenticado, de cualquier organización, en
 * toda ruta que no declarara `@Roles`. Se encontró de casualidad mientras se
 * construía otra cosa. Sin estas pruebas, el siguiente también sería de
 * casualidad — y el siguiente puede ser el que muestre las reservas de un hotel
 * a otro.
 *
 * El riesgo cercano no es organización contra organización, que hoy hay una
 * sola: es **alojamiento contra alojamiento dentro del mismo hotel**, que es
 * exactamente lo que pasa cuando entren las casas de Julius.
 *
 * Corre contra la base de desarrollo de verdad. Crea su propia organización y
 * la borra al terminar; no toca los datos sembrados.
 */

const SUFFIX = Date.now().toString().slice(-8);
const PASSWORD = 'contrasena-de-prueba-larga';

describe('Aislamiento (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let http: App;

  /** Organización ajena, creada para estas pruebas. */
  const other = {
    orgId: '',
    propertyId: '',
    unitTypeId: '',
    token: '',
  };

  /** La organización sembrada, la de Julius. */
  const seeded = {
    orgId: '',
    propertyId: '',
    ownerToken: '',
    frontDeskToken: '',
    housekeepingToken: '',
    bookingId: '',
    /** Un segundo alojamiento de la MISMA organización. */
    otherPropertyId: '',
  };

  async function login(email: string, password: string): Promise<string> {
    const res = await request(http)
      .post('/auth/login')
      .send({ email, password });
    // 200, no 201: el login no crea un recurso, devuelve un par de tokens.
    expect(res.status).toBe(200);
    return (res.body as { accessToken: string }).accessToken;
  }

  beforeAll(async () => {
    /* Sin correo en las pruebas: `ethereal` sale a internet a crear una cuenta
       al arrancar, y eso vuelve la suite lenta y frágil por una razón que no
       tiene nada que ver con lo que se está probando. */
    process.env.MAIL_TRANSPORT = 'log';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    /* El mismo pipe que monta `main.ts`. Sin esto las pruebas verían una
       validación distinta a la de producción, que es la peor clase de prueba
       verde. */
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    http = app.getHttpServer();
    prisma = app.get(PrismaService);

    // --- La organización sembrada ------------------------------------------
    const org = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'daughters-of-sun' },
    });
    seeded.orgId = org.id;
    const property = await prisma.property.findFirstOrThrow({
      where: { orgId: org.id, slug: 'hotel-principal' },
    });
    seeded.propertyId = property.id;

    seeded.ownerToken = await login(
      'julius@daughtersofsun.test',
      'OwnerDev123!',
    );
    seeded.frontDeskToken = await login(
      'recepcion@daughtersofsun.test',
      'FrontDeskDev123!',
    );
    seeded.housekeepingToken = await login(
      'camareria@daughtersofsun.test',
      'HousekeepingDev123!',
    );

    const booking = await prisma.booking.findFirstOrThrow({
      where: { propertyId: property.id },
    });
    seeded.bookingId = booking.id;

    // Segundo alojamiento de la MISMA organización: el caso de las casas.
    const second = await prisma.property.create({
      data: {
        orgId: org.id,
        name: `Casa de prueba ${SUFFIX}`,
        slug: `casa-prueba-${SUFFIX}`,
        currency: 'USD',
      },
    });
    seeded.otherPropertyId = second.id;

    // --- Una organización completamente ajena ------------------------------
    const otherOrg = await prisma.organization.create({
      data: { name: `Hotel Ajeno ${SUFFIX}`, slug: `hotel-ajeno-${SUFFIX}` },
    });
    other.orgId = otherOrg.id;

    const otherProperty = await prisma.property.create({
      data: {
        orgId: otherOrg.id,
        name: 'Alojamiento ajeno',
        slug: 'ajeno',
        currency: 'USD',
      },
    });
    other.propertyId = otherProperty.id;

    const otherType = await prisma.unitType.create({
      data: {
        orgId: otherOrg.id,
        propertyId: otherProperty.id,
        name: 'Habitación ajena',
        slug: 'ajena',
        maxGuests: 2,
        basePriceMinor: 9000,
      },
    });
    other.unitTypeId = otherType.id;

    const outsider = await prisma.user.create({
      data: {
        email: `ajeno.${SUFFIX}@example.test`,
        fullName: 'Dueño Ajeno',
        passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
      },
    });
    await prisma.membership.create({
      data: {
        orgId: otherOrg.id,
        userId: outsider.id,
        role: MemberRole.OWNER,
      },
    });
    other.token = await login(outsider.email, PASSWORD);
  }, 60_000);

  afterAll(async () => {
    /* Se borra sólo lo que esta suite creó. Borrar la organización arrastra sus
       alojamientos y membresías; el usuario ajeno se borra aparte porque el
       usuario no cuelga de la organización. */
    await prisma.property
      .delete({ where: { id: seeded.otherPropertyId } })
      .catch(() => undefined);
    await prisma.organization
      .delete({ where: { id: other.orgId } })
      .catch(() => undefined);
    await prisma.user
      .deleteMany({ where: { email: { endsWith: `${SUFFIX}@example.test` } } })
      .catch(() => undefined);
    await app.close();
  }, 30_000);

  // ---------------------------------------------------------------------------

  describe('entre organizaciones', () => {
    /* Acá el rechazo es 403 y no 404, a diferencia del cruce entre
       alojamientos de más abajo. La razón es dónde se corta: el guard revisa la
       membresía antes de que ningún servicio mire nada, así que en ese punto no
       sabe —ni tiene por qué averiguar— si la organización existe.
       Lo que un 403 revela es que ese UUID podría corresponder a una
       organización real, y un UUID no se adivina probando. */
    it('no deja leer los alojamientos de otra organización', async () => {
      await request(http)
        .get(`/orgs/${seeded.orgId}/properties`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(403);
    });

    it('no deja leer las reservas de otra organización', async () => {
      await request(http)
        .get(`/orgs/${seeded.orgId}/properties/${seeded.propertyId}/bookings`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(403);
    });

    it('no deja leer una reserva concreta de otra organización', async () => {
      await request(http)
        .get(
          `/orgs/${seeded.orgId}/properties/${seeded.propertyId}/bookings/${seeded.bookingId}`,
        )
        .set('Authorization', `Bearer ${other.token}`)
        .expect(403);
    });

    it('no deja leer el equipo de otra organización', async () => {
      await request(http)
        .get(`/orgs/${seeded.orgId}/members`)
        .set('Authorization', `Bearer ${other.token}`)
        .expect(403);
    });

    it('no deja leer los reportes de otra organización', async () => {
      await request(http)
        .get(
          `/orgs/${seeded.orgId}/properties/${seeded.propertyId}/reports/performance?from=2026-01-01&to=2026-01-31`,
        )
        .set('Authorization', `Bearer ${other.token}`)
        .expect(403);
    });

    it('tampoco al revés: Julius no ve la organización ajena', async () => {
      await request(http)
        .get(`/orgs/${other.orgId}/properties`)
        .set('Authorization', `Bearer ${seeded.ownerToken}`)
        .expect(403);
    });
  });

  describe('entre alojamientos de la MISMA organización', () => {
    /* El caso que va a existir en cuanto entren las casas de Julius: mismo
       hotel, mismo usuario, distinta propiedad. Una reserva de la propiedad A
       no puede alcanzarse por la URL de la propiedad B. */
    it('una reserva no se alcanza por la URL de otro alojamiento', async () => {
      await request(http)
        .get(
          `/orgs/${seeded.orgId}/properties/${seeded.otherPropertyId}/bookings/${seeded.bookingId}`,
        )
        .set('Authorization', `Bearer ${seeded.ownerToken}`)
        .expect(404);
    });

    it('el otro alojamiento arranca sin reservas propias', async () => {
      const res = await request(http)
        .get(
          `/orgs/${seeded.orgId}/properties/${seeded.otherPropertyId}/bookings`,
        )
        .set('Authorization', `Bearer ${seeded.ownerToken}`)
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it('un tipo de unidad de otra organización no sirve para reservar acá', async () => {
      await request(http)
        .post(`/orgs/${seeded.orgId}/properties/${seeded.propertyId}/bookings`)
        .set('Authorization', `Bearer ${seeded.frontDeskToken}`)
        .send({
          unitTypeId: other.unitTypeId,
          checkIn: '2028-03-01',
          checkOut: '2028-03-03',
          guests: 1,
          guestFullName: 'Prueba Cruzada',
          guestEmail: `cruzada.${SUFFIX}@example.test`,
        })
        .expect(404);
    });
  });

  describe('entre roles', () => {
    it('recepción no ve los reportes', async () => {
      await request(http)
        .get(
          `/orgs/${seeded.orgId}/properties/${seeded.propertyId}/reports/performance?from=2026-01-01&to=2026-01-31`,
        )
        .set('Authorization', `Bearer ${seeded.frontDeskToken}`)
        .expect(403);
    });

    it('recepción no administra el equipo', async () => {
      await request(http)
        .get(`/orgs/${seeded.orgId}/members`)
        .set('Authorization', `Bearer ${seeded.frontDeskToken}`)
        .expect(403);
    });

    it('recepción no cambia tarifas', async () => {
      const unitTypes = await prisma.unitType.findMany({
        where: { propertyId: seeded.propertyId },
        take: 1,
      });
      await request(http)
        .post(
          `/orgs/${seeded.orgId}/properties/${seeded.propertyId}/unit-types/${unitTypes[0].id}/rate-plans`,
        )
        .set('Authorization', `Bearer ${seeded.frontDeskToken}`)
        .send({
          name: 'No debería entrar',
          startDate: '2028-01-01',
          endDate: '2028-01-05',
          priceMinor: 1,
        })
        .expect(403);
    });

    it('camarería no mueve reservas', async () => {
      await request(http)
        .post(
          `/orgs/${seeded.orgId}/properties/${seeded.propertyId}/bookings/${seeded.bookingId}/check-in`,
        )
        .set('Authorization', `Bearer ${seeded.housekeepingToken}`)
        .expect(403);
    });

    it('camarería SÍ ve su tablero — es su trabajo', async () => {
      await request(http)
        .get(
          `/orgs/${seeded.orgId}/properties/${seeded.propertyId}/housekeeping?date=2026-09-01`,
        )
        .set('Authorization', `Bearer ${seeded.housekeepingToken}`)
        .expect(200);
    });
  });

  describe('sin credenciales', () => {
    it.each([
      ['properties', `/properties`],
      ['bookings', `/properties/:p/bookings`],
      ['housekeeping', `/properties/:p/housekeeping`],
      ['reports', `/properties/:p/reports/performance?from=2026-01-01&to=2026-01-31`],
    ])('%s exige autenticación', async (_name, suffix) => {
      const path = `/orgs/${seeded.orgId}${suffix.replace(':p', seeded.propertyId)}`;
      await request(http).get(path).expect(401);
    });

    it('un token inventado no sirve', async () => {
      await request(http)
        .get(`/orgs/${seeded.orgId}/properties`)
        .set('Authorization', 'Bearer no-es-un-token')
        .expect(401);
    });
  });

  describe('la API pública no filtra', () => {
    it('devuelve tipos de unidad pero nunca unidades físicas', async () => {
      const res = await request(http)
        .get('/public/orgs/daughters-of-sun/properties/hotel-principal')
        .expect(200);
      const body = res.body as Record<string, unknown>;
      expect(body.unitTypes).toBeDefined();
      expect(body.units).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain('housekeeping');
    });

    it('no expone cuántas habitaciones quedan libres', async () => {
      const res = await request(http)
        .get(
          '/public/orgs/daughters-of-sun/properties/hotel-principal/availability?checkIn=2028-06-01&checkOut=2028-06-03&guests=1',
        )
        .expect(200);
      const rows = (res.body as { unitTypes: Record<string, unknown>[] })
        .unitTypes;
      for (const row of rows) {
        expect(row.available).toBeDefined();
        expect(row.unitsAvailable).toBeUndefined();
      }
    });

    it('un slug de organización que no existe da 404, no una lista vacía', async () => {
      await request(http)
        .get('/public/orgs/no-existe/properties/hotel-principal')
        .expect(404);
    });
  });
});
