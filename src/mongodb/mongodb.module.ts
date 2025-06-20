import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { ScoreSchema } from './schemas/scores.schema';
import { hexcodeMappingSchema } from './schemas/hexcodeMapping.schema';
import { assessmentInputSchema } from './schemas/assessmentInput.schema';
import { denoiserOutputLogsSchema } from './schemas/denoiserOutputLogs.schema';
import { ScoresController } from './scores.controller';
import { ScoresService } from './scores.service';
import { CacheService } from './cache/cache.service';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { JwtService } from '@nestjs/jwt';
import { llmOutputLogsSchema } from './schemas/llmOutputLogs';
import { getSetResultSchema } from './schemas/getSetResult';
import { RedisModule } from 'src/redis/redis.module';
import { TowreSchema } from 'src/schemas/towre.schema';
import { VocabularySchema } from './schemas/vocabularySchema';

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
        uri: process.env.MONGO_URL,
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
      { name: 'denoiserOutputLogs', schema: denoiserOutputLogsSchema },
      { name: 'llmOutputLogs', schema: llmOutputLogsSchema },
      { name: 'getSetResult', schema: getSetResultSchema },
      { name: 'towre', schema: TowreSchema},
      { name: 'vocabulary', schema: VocabularySchema}
    ]),
    CacheModule.register(),
    RedisModule
  ],
  controllers: [ScoresController],
  providers: [ScoresService, CacheService, JwtService],
})
export class MongodbModule {}
