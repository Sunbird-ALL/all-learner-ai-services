import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class AppService implements OnModuleInit {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  onModuleInit() {
    const poolSize = this.connection.get('poolSize');
    console.log(`Mongoose connection pool size is: ${poolSize}`);
  }
}
