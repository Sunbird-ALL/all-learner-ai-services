import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import mongodbConfig from '../config/mongodb.config';
import { ScoreSchema } from './schemas/scores.schema';
import { hexcodeMappingSchema } from './schemas/hexcodeMapping.schema';
import { ScoresController } from './scores.controller';
import { ScoresService } from './scores.service';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),
        MongooseModule.forRoot(process.env.MONGO_URL),
        MongooseModule.forFeature([
            { name: 'Score', schema: ScoreSchema },
            { name: 'hexcodeMapping', schema: hexcodeMappingSchema }
        ])
    ],
    controllers: [ScoresController],
    providers: [
        ScoresService
    ]
})
export class MongodbModule { }
