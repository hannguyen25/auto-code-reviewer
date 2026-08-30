import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Kích hoạt rawBody để lấy Buffer tính toán HMAC
  });

  app.use(json({ limit: '10mb' }));
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 AI Code Reviewer server running on port: ${port}`);
}
bootstrap();