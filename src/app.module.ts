import { DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongodbModule } from './mongodb/mongodb.module.js';
import { MysqlModule } from './mysql/mysql.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HttpModule } from '@nestjs/axios';

export class AppModule {
  static forRoot(databaseType: string): DynamicModule {
    let databaseModule;
    switch (databaseType) {
      case 'mongodb':
        databaseModule = MongodbModule;
        break;
      case 'mysql':
        databaseModule = MysqlModule;
        break;
      default:
        throw new Error(`Invalid database type: ${databaseType}`);
    }

    return {
      module: AppModule,
      imports: [
        HttpModule.register({
          timeout: 5000,
        }),
        ConfigModule.forRoot({
          isGlobal: true,
        }),
        databaseModule, // Dynamically load the selected database module
      ],
      controllers: [AppController],
      providers: [AppService],
    };
  }
}
