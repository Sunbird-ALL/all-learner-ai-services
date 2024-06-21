import { Test, TestingModule } from '@nestjs/testing';
import { ScoresController } from './scores.controller';
import { ScoresService } from './scores.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Score } from './entities/score.entity';

describe('ScoresController', () => {
  let controller: ScoresController;
  let service: ScoresService;

  const mockScoreRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScoresController],
      providers: [
        ScoresService,
        {
          provide: getRepositoryToken(Score),
          useValue: mockScoreRepository,
        },
      ],
    }).compile();

    controller = module.get<ScoresController>(ScoresController);
    service = module.get<ScoresService>(ScoresService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(service).toBeDefined();
  });
});
