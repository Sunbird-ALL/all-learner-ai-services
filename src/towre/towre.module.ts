import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Towre, TowreSchema } from '../schemas/towre.schema';
import { TowreService } from './towre.service';
import { TowreController } from './towre.controller';
import { JwtService } from '@nestjs/jwt';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Towre.name, schema: TowreSchema }]),
  ],
  controllers: [TowreController],
  providers: [TowreService, JwtService],
})
export class TowreModule {}
