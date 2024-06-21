import { Test, TestingModule } from '@nestjs/testing';
import { ScoresService } from './scores.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Score } from './entities/score.entity';

describe('ScoresService', () => {
  let service: ScoresService;

  const mockScoreRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoresService,
        {
          provide: getRepositoryToken(Score),
          useValue: mockScoreRepository,
        },
      ],
    }).compile();

    service = module.get<ScoresService>(ScoresService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
