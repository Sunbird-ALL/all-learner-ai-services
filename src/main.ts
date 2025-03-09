import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { fastifyMultipart } from '@fastify/multipart';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppClusterService } from './app-cluster.service.js';
import compression from '@fastify/compress';
import { VersioningType } from '@nestjs/common';


async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(process.env.DATABASE),
    new FastifyAdapter({ logger: true, bodyLimit: 30 * 1024 * 1024 }),
  );

  await app.register(compression, {
    global: true,
    zlibOptions: {
      level: 6,
    },
    threshold: 512,
    encodings: ['gzip', 'deflate', 'br']
  }
  );
  await app.register(fastifyMultipart, {
    attachFieldsToBody: 'keyValues',
    limits: {
      fileSize: 102400000,
    },
  });

  //🔹Enable URI-based versioning
  app.enableVersioning({
    type: VersioningType.URI,
  });

  //🔹Swagger configuration for v1
  const configV1 = new DocumentBuilder()
    .setTitle('ALL Learner AI - v1')
    .setDescription(
      'ALL Learner AI API Spec Documentation (v1) \n\n The recommended flow to test: \n 1. Start using updateLearnerProfile API. \n user_id & session_id are free text fields that you can fill as you want. Please refer to them in subsequent API calls where you need to extract the LearnerProfile for a specific user_id or session_id. \n e.g., Some sample user ids and session ids are provided for testing. Ideally, session_id should be unique for each session, but it is not mandatory. Given a user_id and session_id, the profile vector will be unique. \n 2. For all Get APIs like -> GetTargets/Session/{sessionId}, GetTargets/User/{userId}, use the sample session ids provided or the ones used in updateLearnerProfile API call.',
    )
    .setVersion('v1')
    .addTag('scores')
    .addServer(process.env.SERVER_URL, 'Learner AI Dev Server APIs')
    .build();

  const documentV1 = SwaggerModule.createDocument(app, configV1);
  SwaggerModule.setup('api/v1', app, documentV1);

  //🔹Swagger configuration for v2
  const configV2 = new DocumentBuilder()
    .setTitle('ALL Learner AI - v2')
    .setDescription(
      'ALL Learner AI API Spec Documentation (v2) \n\n This version includes improvements over v1, such as enhanced user session management and new endpoints. \n\n The testing flow remains similar to v1, but v2 introduces additional features and optimizations.',
    )
    .setVersion('v2')
    .addTag('scores')
    .addServer(process.env.SERVER_URL, 'Learner AI Dev Server APIs')
    .build();

  const documentV2 = SwaggerModule.createDocument(app, configV2);
  SwaggerModule.setup('api/v2', app, documentV2);

  app.enableCors({
    origin: ['*'],
    methods: ['GET', 'POST', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: false,
  });

  await app.listen(process.env.PORT, '0.0.0.0');
}
AppClusterService.clusterize(bootstrap);