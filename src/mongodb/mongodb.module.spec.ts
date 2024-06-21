import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { MongodbModule } from './mongodb.module';
import * as mongoose from 'mongoose';

describe('MongodbModule', () => {
  let module: TestingModule;
  let connection: mongoose.Connection;

  beforeAll(async () => {
    // Set mock MONGO_URL
    process.env.MONGO_URL = 'mongodb://localhost:27017/testdb';

    module = await Test.createTestingModule({
      imports: [
        MongodbModule,
        ConfigModule.forRoot({
          isGlobal: true,
        }),
      ],
    }).compile();

    connection = module.get(getConnectionToken());
  });

  // Close the connection after tests
  afterAll(async () => {
    await connection.close(); 
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should connect to MongoDB with the correct URI', () => {
    expect(connection.readyState).toBe(1); // 1 indicates connected
    expect(connection.host).toBe('localhost');
    expect(connection.port).toBe(27017);
    expect(connection.name).toBe('testdb');
  });
});
