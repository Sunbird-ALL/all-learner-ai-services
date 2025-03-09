import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm/dist/interfaces/typeorm-options.interface.js'; // Import the TypeOrmModuleOptions interface
import mysqlConfig from '../config/mysql.config.js';
import { Score } from './entities/score.entity.js';
import { ScoresController } from './scores.controller.js';
import { ScoresService } from './scores.service.js';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot(mysqlConfig as TypeOrmModuleOptions),
    TypeOrmModule.forFeature([Score]),
  ],
  controllers: [ScoresController],
  providers: [ScoresService],
})
export class MysqlModule {}
