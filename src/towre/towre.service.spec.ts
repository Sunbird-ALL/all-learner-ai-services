import { Test, TestingModule } from '@nestjs/testing';
import { TowreService } from './towre.service';

describe('TowreService', () => {
  let service: TowreService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TowreService],
    }).compile();

    service = module.get<TowreService>(TowreService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
