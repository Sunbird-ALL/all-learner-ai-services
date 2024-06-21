import { Test, TestingModule } from '@nestjs/testing';
import { ScoresService } from './scores.service';
import { getModelToken } from '@nestjs/mongoose';
import { CacheService } from './cache/cache.service';
import { HttpService } from '@nestjs/axios';

describe('ScoresService', () => {
  let service: ScoresService;

  const mockScoreModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    // Add other repository methods as needed
  };

  const mockHexcodeMappingModel = {};
  const mockAssessmentInputModel = {};
  const mockDenoiserOutputLogsModel = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoresService,
        { provide: getModelToken('Score'), useValue: mockScoreModel },
        { provide: getModelToken('hexcodeMapping'), useValue: mockHexcodeMappingModel },
        { provide: getModelToken('assessmentInput'), useValue: mockAssessmentInputModel },
        { provide: getModelToken('denoiserOutputLogs'), useValue: mockDenoiserOutputLogsModel },
        { provide: CacheService, useValue: {} },
        { provide: HttpService, useValue: {} },
      ],
    }).compile();

    service = module.get<ScoresService>(ScoresService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
