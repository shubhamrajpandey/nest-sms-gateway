import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  // Automatically validates all incoming request bodies using class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strips away any unknown fields not defined in DTOs
      forbidNonWhitelisted: true, // Throws an error if extra unexpected fields are sent
      transform: true, // Automatically converts data to proper DTO types
    }),
  );

  // OpenAPI Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('Nest SMS Gateway API')
    .setDescription(
      'Enterprise-grade bulk SMS platform featuring prioritized provider failover, GSM-7/Unicode segmentation, atomic wallet concurrency control, and 24-hour route health analytics.',
    )
    .setVersion('1.0')
    .addTag('Auth', 'User registration, login, and JWT token management')
    .addTag('SMS', 'SMS dispatching, failover cascade, and delivery logs')
    .addTag('Wallet', 'Wallet balance, atomic top-up, and transaction audit ledger')
    .addTag('Routes & Providers', 'Upstream route listing and 24-hour health observability')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Input your JWT access token obtained from /auth/login',
      },
      'bearer',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'Nest SMS Gateway API Docs',
  });

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
