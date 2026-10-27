import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
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

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

