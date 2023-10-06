import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm/dist/interfaces/typeorm-options.interface'; // Import the TypeOrmModuleOptions interface
import mysqlConfig from '../config/mysql.config';
import { Score } from './entities/score.entity';
import { ScoresController } from './scores.controller';
import { ScoresService } from './scores.service';


@Module({
    imports: [
        ConfigModule.forRoot(),
        TypeOrmModule.forRoot(mysqlConfig as TypeOrmModuleOptions),
        TypeOrmModule.forFeature([Score])
    ],
    controllers: [ScoresController],
    providers: [
        ScoresService
    ]
})
export class MysqlModule { }
