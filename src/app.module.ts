import { DynamicModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongodbModule } from './mongodb/mongodb.module';
import { MysqlModule } from './mysql/mysql.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

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
        ConfigModule.forRoot({
          isGlobal: true,
        }),
        databaseModule, // Dynamically load the selected database module
      ],
      controllers: [
        AppController,
      ],
      providers: [
        AppService
      ]
    };
  }
}
