import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { API_PREFIX, DEFAULT_PORT } from './app.constants.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.setGlobalPrefix(API_PREFIX);

  // Server-side request validation (NFR-04): reject unknown properties, strip
  // non-whitelisted fields, and coerce primitives from the wire.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = Number.parseInt(process.env.PORT ?? `${DEFAULT_PORT}`, 10);
  await app.listen(port);
  Logger.log(`BMI Stooring API listening on http://localhost:${port}/${API_PREFIX}`, 'Bootstrap');
}

void bootstrap();
