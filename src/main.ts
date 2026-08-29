import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins });

  /* La documentación no se monta en producción: describe cada endpoint, cada
     campo y cada regla de validación de la API. Es una herramienta de
     desarrollo, no algo que el hotel necesite publicar. */
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Daughters of Sun — API')
      .setDescription(
        'PMS multi-inquilino. Casi todo cuelga de `/orgs/:orgId`: hay que ' +
          'estar autenticado Y tener una Membership en esa organización.\n\n' +
          'Para probar: ejecutá `POST /auth/login`, copiá el `accessToken` de ' +
          'la respuesta y pegalo en el botón **Authorize** de arriba.',
      )
      .setVersion('0.1')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      // Mantiene el token pegado entre recargas de la página.
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
