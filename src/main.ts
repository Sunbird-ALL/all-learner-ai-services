import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { fastifyMultipart } from '@fastify/multipart';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(process.env.DATABASE),
    new FastifyAdapter({ logger: true }),
  );

  await app.register(fastifyMultipart, { attachFieldsToBody: 'keyValues' });

  const config = new DocumentBuilder().setTitle('ALL Learner AI')
    .setDescription("ALL Learner AI API Spec Documentation")
    .setVersion('v1')
    .addTag('scores')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  app.enableCors({
    origin: ["*"],
    methods: ['GET', 'POST', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: false,
  });

  await app.listen(process.env.PORT, '0.0.0.0');
}
bootstrap();