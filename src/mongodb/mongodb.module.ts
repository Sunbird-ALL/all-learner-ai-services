import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { ScoreSchema } from './schemas/scores.schema.js';
import { hexcodeMappingSchema } from './schemas/hexcodeMapping.schema.js';
import { assessmentInputSchema } from './schemas/assessmentInput.schema.js';
import { denoiserOutputLogsSchema } from './schemas/denoiserOutputLogs.schema.js'
import { ScoresController } from './scores.controller.js';
import { ScoresService } from './scores.service.js';
import { CacheService } from './cache/cache.service.js';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/auth.guard.js';


@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    MongooseModule.forRootAsync({
      useFactory: async () => ({
        uri: process.env.MONGO_URL || "mongodb://127.0.0.1:27017/lais_db",
        useNewUrlParser: true,
        useUnifiedTopology: true,
        connectionFactory: (connection) => {
          connection.set('poolSize', process.env.POOL_SIZE);
          return connection;
        },
      }),
    }),

    MongooseModule.forFeature([
      { name: 'Score', schema: ScoreSchema },
      { name: 'hexcodeMapping', schema: hexcodeMappingSchema },
      { name: 'assessmentInput', schema: assessmentInputSchema },
      { name: 'denoiserOutputLogs', schema: denoiserOutputLogsSchema }
    ]),
    CacheModule.register()
  ],
  controllers: [ScoresController],
  providers: [ScoresService, CacheService, JwtService, JwtAuthGuard],

})
export class MongodbModule { }
