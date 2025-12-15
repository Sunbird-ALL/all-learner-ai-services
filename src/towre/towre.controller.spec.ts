import { Test, TestingModule } from '@nestjs/testing';
import { TowreController } from './towre.controller';

describe('TowreController', () => {
  let controller: TowreController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TowreController],
    }).compile();

    controller = module.get<TowreController>(TowreController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
