import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.FRONTEND_ORIGIN ?? true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('DIPLOM LMS')
    .setDescription('API образовательной платформы — курсы, задания, чат, уведомления')
    .setVersion('1.2')
    .addBearerAuth()
    .addTag('Auth', 'Регистрация, вход, профиль')
    .addTag('Courses', 'Учебные курсы и роли')
    .addTag('Groups', 'Группы студентов внутри курса')
    .addTag('Channels', 'Текстовые каналы и каналы-задания')
    .addTag('Messages', 'Сообщения в каналах и реакции')
    .addTag('Assignments', 'Задания, дедлайны, сдача работ, оценивание')
    .addTag('Notifications', 'Уведомления')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(Number(process.env.PORT ?? 3000));
}

void bootstrap();

