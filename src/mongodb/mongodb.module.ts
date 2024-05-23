import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import mongodbConfig from '../config/mongodb.config';
import { ScoreSchema } from './schemas/scores.schema';
import { hexcodeMappingSchema } from './schemas/hexcodeMapping.schema';
import { assessmentInputSchema } from './schemas/assessmentInput.schema';
import { denoiserOutputLogsSchema } from './schemas/denoiserOutputLogs.schema'
import { ScoresController } from './scores.controller';
import { ScoresService } from './scores.service';
import { CacheService } from './cache/cache.service';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(process.env.MONGO_URL),
    MongooseModule.forFeature([
      { name: 'Score', schema: ScoreSchema },
      { name: 'hexcodeMapping', schema: hexcodeMappingSchema },
      { name: 'assessmentInput', schema: assessmentInputSchema },
      { name: 'denoiserOutputLogs', schema: denoiserOutputLogsSchema }
    ]),
    CacheModule.register()
  ],
  controllers: [ScoresController],
  providers: [ScoresService, CacheService],
})
export class MongodbModule { }
