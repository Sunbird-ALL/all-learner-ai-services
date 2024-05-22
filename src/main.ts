import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { fastifyMultipart } from '@fastify/multipart';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppClusterService } from './app-cluster.service';
import compression from '@fastify/compress';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(process.env.DATABASE),
    new FastifyAdapter({ logger: true, bodyLimit: 30 * 1024 * 1024 }),
  );

  await app.register(compression)

  await app.register(fastifyMultipart, {
    attachFieldsToBody: 'keyValues',
    limits: {
      fileSize: 102400000,
    },
  });
  
  const config = new DocumentBuilder()
    .setTitle('ALL Learner AI')
    .setDescription(
      'ALL Learner AI API Spec Documentation \n\n The recommended the below flow to test:- \n 1. start using updateLearnerProfile API \n user_id & session_id are free text, that you can fill as you want and please refer them in the subsequent APIs where you use them to extract the LearnerProfile for that particular user id or session id levels. \n e.g., I have given few sample user ids and their respective session ids to play with. ideally session id needs to be unique for every time, but is not mandated now. given a user_id and session_id the profile vector will be unique. \n 2. For all Get APIs like -> GetTargets/Session/{sessionId}, GetTargets/User/{userId} use the sample session ids provided or you can use the ones that you used in updateLearnerProfile API call \n Provided below are some user Id and respective session Id to use in Get APIs or further update of learnerprofile',
    )
    .setVersion('v1')
    .addTag('scores')
    .addServer(process.env.SERVER_URL, 'Learner AI Dev Server APIs')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  app.enableCors({
    origin: ['*'],
    methods: ['GET', 'POST', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: false,
  });

  await app.listen(process.env.PORT, '0.0.0.0');
}
AppClusterService.clusterize(bootstrap);