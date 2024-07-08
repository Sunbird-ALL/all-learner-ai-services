import { Test, TestingModule } from '@nestjs/testing';
import { ScoresService } from './scores.service';
import { getModelToken } from '@nestjs/mongoose';
import { CacheService } from './cache/cache.service';
import { HttpService } from '@nestjs/axios';
import { Model } from 'mongoose';
import * as splitGraphemes from 'split-graphemes';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
const axios = require('axios');
jest.mock('axios');


describe('ScoresService', () => {
  let service: ScoresService;
  let getTextSimilarityMock;
  let scoreModel;
  let cacheManager;
  let cacheService;
  let mockDenoiserOutputLogsModel;

  const mockScoreModel = {
    find: jest.fn(),
    updateOne: jest.fn(),
    create: jest.fn(),
    exec: jest.fn(),
    save: jest.fn(),
    aggregate: jest.fn(),
    mockImplementation: jest.fn()
  };
  let mockHexcodeMappingModel = {
    find: jest.fn()
  };
  const mockAssessmentInputModel = {
    updateMany: jest.fn(),
    aggregate: jest.fn()
  };
  
  beforeEach(async () => {
    const mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
    };
    const mockSave = jest.fn().mockResolvedValue({
      user_id: 'user1',
      session_id: 'session1',
      denoised_output: 'denoised data',
      timestamp: new Date('2024-07-03T05:43:57.387Z'),
      _id: 'mockId',
    });

    mockDenoiserOutputLogsModel = jest.fn().mockImplementation(() => ({
      save: mockSave,
    }));
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
    getTextSimilarityMock = jest.spyOn(service, 'getTextSimilarity');
    scoreModel = module.get(getModelToken('Score'));
    cacheService = module.get<CacheService>(CacheService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Mock data 
  const mockRecordData = [
    {
      character: 'a',
      latestScores: [0.6, 0.5, 0.8, 0.7, 0.4],
      countBelowThreshold: 3,
      countAboveThreshold: 2,
      score: 0.6,
    },
  ];

  const sessionId = 'session1';
  const subSessionId = 'Subsession1'
  const language = 'en';
  const userId = 'user1';

  // Errro 
  const error = new Error('Something went wrong');

  // findAll
  describe('findAll', () => {

    it('should retrieve all records successfully', async () => {
      const mockRecordData = [
        { user_id: '123', score: 10 },
        { user_id: '456', score: 20 },
      ];

      scoreModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockRecordData),
      });

      const result = await service.findAll();
      expect(scoreModel.find).toHaveBeenCalled();
      expect(result).toEqual(mockRecordData);
    });

    it('should handle errors during data retrieval', async () => {
      const error = new Error('Something went wrong');

      scoreModel.find.mockReturnValue({
        exec: jest.fn().mockRejectedValue(error),
      });

      try {
        await service.findAll();
      } catch (e) {
        expect(scoreModel.find).toHaveBeenCalled();
        expect(e).toBe(error);
      }
    });
  })

  // findbyUser
  describe('findbyUser', () => {
    const mockUserRecordData = [
      {
        user_id: 'user1',
        sessions: [
          { session_id: 'session1', content: 'content1' },
          { session_id: 'session2', content: 'content2' },
        ],
      },
    ];
    it('should find records by user id', async () => {
      mockScoreModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUserRecordData),
      });

      const result = await service.findbyUser('user1');

      expect(mockScoreModel.find).toHaveBeenCalledWith({ user_id: 'user1' });
      expect(result).toEqual(mockUserRecordData);
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Something went wrong');
      mockScoreModel.find.mockReturnValue({
        exec: jest.fn().mockRejectedValue(error),
      });

      await expect(service.findbyUser('user1')).rejects.toThrow('Something went wrong');
    });
  })

  // findOne
  describe('findOne', () => {
    it('should return a string with the score ID', () => {
      const id = 1;
      const result = service.findOne(id);
      expect(result).toBe(`This action returns a #${id} score`);
    });
  })

  // findbySession
  describe('findbySession', () => {
    const mockUserRecordData = [
      {
        user_id: 'user1',
        sessions: [
          { session_id: 'session1', content: 'content1' },
          { session_id: 'session2', content: 'content2' },
        ],
      },
    ];

    it('should find records by session id', async () => {
      mockScoreModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUserRecordData),
      });

      const result = await service.findbySession('session1');
      expect(mockScoreModel.find).toHaveBeenCalledWith({
        sessions: {
          $elemMatch: {
            session_id: 'session1',
          },
        },
      });
      expect(result).toEqual(mockUserRecordData);
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Something went wrong');
      mockScoreModel.find.mockReturnValue({
        exec: jest.fn().mockRejectedValue(error),
      });
      await expect(service.findbySession('session1')).rejects.toThrow('Something went wrong');
    });
  })

  // getRetryStatus
  describe('getRetryStatus', () => {
    it('should return 1 when records are found and updated', async () => {
      const userId = 'test-user-id';
      const contentId = 'test-content-id';
      const mockSessions = [{ _id: 'session-id', contentId: contentId, isRetry: false }];
      const mockRecordData = [{ user_id: userId, sessions: mockSessions }];

      (mockScoreModel.find as jest.Mock).mockReturnValue({
        exec: jest.fn().mockResolvedValueOnce(mockRecordData),
      });
      (mockScoreModel.updateOne as jest.Mock).mockResolvedValueOnce({ nModified: 1 });

      const result = await service.getRetryStatus(userId, contentId);

      expect(mockScoreModel.find).toHaveBeenCalledWith({ user_id: userId });
      expect(mockScoreModel.updateOne).toHaveBeenCalledWith(
        { 'sessions._id': 'session-id' },
        { $set: { 'sessions.$': { _id: 'session-id', contentId: contentId, isRetry: true } } },
      );
      expect(result).toBe(1);
    });

    it('should return 1 when no records are found', async () => {
      const userId = 'test-user-id';
      const contentId = 'test-content-id';

      (mockScoreModel.find as jest.Mock).mockReturnValue({
        exec: jest.fn().mockResolvedValueOnce([]),
      });

      const result = await service.getRetryStatus(userId, contentId);
      expect(mockScoreModel.find).toHaveBeenCalledWith({ user_id: userId });
      expect(result).toBe(1);
    });

    it('should throw an error if an error occurs while fetching records', async () => {
      const userId = 'test-user-id';
      const contentId = 'test-content-id';

      (mockScoreModel.find as jest.Mock).mockReturnValue({
        exec: jest.fn().mockRejectedValueOnce(new Error('Test error')),
      });

      await expect(service.getRetryStatus(userId, contentId)).rejects.toThrow('Test error');
      expect(mockScoreModel.find).toHaveBeenCalledWith({ user_id: userId });
    });
  })

  // getSubsessionOriginalTextSyllables
  describe('getSubsessionOriginalTextSyllables', () => {
    const subSessionId = 'subSession1';
    it('should successfully retrieve syllables', async () => {
      const mockRecordData = [
        { original_text: 'hello' },
        { original_text: 'world' },
      ];
      const mockSyllables = ['h', 'e', 'l', 'o', 'w', 'r', 'd'];

      mockScoreModel.aggregate.mockResolvedValue(mockRecordData);
      jest.spyOn(splitGraphemes, 'splitGraphemes').mockImplementation(text => text.split(''));

      const result = await service.getSubsessionOriginalTextSyllables(subSessionId);

      expect(mockScoreModel.aggregate).toHaveBeenCalledWith([
        { $unwind: '$sessions' },
        { $match: { 'sessions.sub_session_id': subSessionId } },
        { $project: { _id: 0, original_text: '$sessions.original_text' } },
      ]);
      expect(result).toEqual(mockSyllables);
    });

    it('should return an empty array if no records are found', async () => {
      mockScoreModel.aggregate.mockResolvedValue([]);

      const result = await service.getSubsessionOriginalTextSyllables(subSessionId);
      expect(mockScoreModel.aggregate).toHaveBeenCalledWith([
        { $unwind: '$sessions' },
        { $match: { 'sessions.sub_session_id': subSessionId } },
        { $project: { _id: 0, original_text: '$sessions.original_text' } },
      ]);
      expect(result).toEqual([]);
    });

    it('should handle special characters in the original text', async () => {
      const mockRecordData = [
        { original_text: 'hello!@#' },
        { original_text: 'world$%^' },
      ];
      const mockSyllables = ['h', 'e', 'l', 'o', 'w', 'r', 'd'];

      mockScoreModel.aggregate.mockResolvedValue(mockRecordData);
      jest.spyOn(splitGraphemes, 'splitGraphemes').mockImplementation(text => text.split(''));

      const result = await service.getSubsessionOriginalTextSyllables(subSessionId);

      expect(mockScoreModel.aggregate).toHaveBeenCalledWith([
        { $unwind: '$sessions' },
        { $match: { 'sessions.sub_session_id': subSessionId } },
        { $project: { _id: 0, original_text: '$sessions.original_text' } },
      ]);
      expect(result).toEqual(mockSyllables);
    });

    it('should return unique syllables', async () => {
      const mockRecordData = [
        { original_text: 'hello' },
        { original_text: 'hello' },
      ];
      const mockSyllables = ['h', 'e', 'l', 'o'];

      mockScoreModel.aggregate.mockResolvedValue(mockRecordData);
      jest.spyOn(splitGraphemes, 'splitGraphemes').mockImplementation(text => text.split(''));

      const result = await service.getSubsessionOriginalTextSyllables(subSessionId);
      expect(mockScoreModel.aggregate).toHaveBeenCalledWith([
        { $unwind: '$sessions' },
        { $match: { 'sessions.sub_session_id': subSessionId } },
        { $project: { _id: 0, original_text: '$sessions.original_text' } },
      ]);
      expect(result).toEqual(mockSyllables);
    });
  })

  // getMilestoneBasedContentComplexity
  describe('getMilestoneBasedContentComplexity', () => {
    it('should return correct content level and complexity level for m0', () => {
      const result = service.getMilestoneBasedContentComplexity('m0');
      expect(result).toEqual({ contentLevel: 'L1', complexityLevel: [] });
    });

    it('should return correct content level and complexity level for m1', () => {
      const result = service.getMilestoneBasedContentComplexity('m1');
      expect(result).toEqual({ contentLevel: 'L1', complexityLevel: [] });
    });

    it('should return correct content level and complexity level for m2', () => {
      const result = service.getMilestoneBasedContentComplexity('m2');
      expect(result).toEqual({ contentLevel: 'L2', complexityLevel: ['C1'] });
    });

    it('should return correct content level and complexity level for m3', () => {
      const result = service.getMilestoneBasedContentComplexity('m3');
      expect(result).toEqual({ contentLevel: 'L2', complexityLevel: ['C1', 'C2'] });
    });

    it('should return correct content level and complexity level for m4', () => {
      const result = service.getMilestoneBasedContentComplexity('m4');
      expect(result).toEqual({ contentLevel: 'L3', complexityLevel: ['C1', 'C2', 'C3'] });
    });

    it('should return correct content level and complexity level for m5', () => {
      const result = service.getMilestoneBasedContentComplexity('m5');
      expect(result).toEqual({ contentLevel: 'L3', complexityLevel: ['C2', 'C3'] });
    });

    it('should return correct content level and complexity level for m6', () => {
      const result = service.getMilestoneBasedContentComplexity('m6');
      expect(result).toEqual({ contentLevel: 'L4', complexityLevel: ['C2', 'C3'] });
    });

    it('should return correct content level and complexity level for m7', () => {
      const result = service.getMilestoneBasedContentComplexity('m7');
      expect(result).toEqual({ contentLevel: 'L4', complexityLevel: ['C2', 'C3', 'C4'] });
    });

    it('should return correct content level and complexity level for m8', () => {
      const result = service.getMilestoneBasedContentComplexity('m8');
      expect(result).toEqual({ contentLevel: 'L5', complexityLevel: ['C3', 'C4'] });
    });

    it('should return correct content level and complexity level for m9', () => {
      const result = service.getMilestoneBasedContentComplexity('m9');
      expect(result).toEqual({ contentLevel: 'L6', complexityLevel: ['C3', 'C4'] });
    });
  });

  // processText
  describe('processText', () => {
    // Test Case 1: Process text with lowercase conversion, splitting, cleaning, and joining.
    it('should convert text to lowercase, remove special characters, and trim spaces', async () => {
      const text = 'Hello, World! This is a test. Welcome!';
      const expected = 'hello world this is a test welcome';

      const result = await service.processText(text);

      expect(result).toBe(expected);
    });


    // Test Case 3: Handle empty input.
    it('should handle empty input', async () => {
      const text = '';
      const expected = '';
      const result = await service.processText(text);
      expect(result).toBe(expected);
    });

    // Test Case 4: Handle text without punctuation.
    it('should handle text without punctuation', async () => {
      const text = 'Hello World This is a test Welcome';
      const expected = 'hello world this is a test welcome';

      const result = await service.processText(text);

      expect(result).toBe(expected);
    });

    // Test Case 5: Handle text with only special characters.
    it('should handle text with only special characters', async () => {
      const text = '!@#$%^&*()_+';
      const expected = '_';

      const result = await service.processText(text);

      expect(result).toBe(expected);
    });

    // Test Case 6: Handle text with mixed punctuation and spaces.
    it('should handle text with mixed punctuation and spaces', async () => {
      const text = '  Hello,  World! This is a test.   Welcome!   ';
      const expected = 'hello world this is a test welcome';

      const result = await service.processText(text);

      expect(result).toBe(expected);
    });
  })

  // getTokenHexcode
  describe('getTokenHexcode', () => {
    it('should return the hexcode when the token is found in the array', async () => {
      const hexcodeTokenArr = [
        { token: 'token1', hexcode: 'hexcode1' },
        { token: 'token2', hexcode: 'hexcode2' },
      ];
      const token = 'token2';
      const result = await service.getTokenHexcode(hexcodeTokenArr, token);
      expect(result).toBe('hexcode2');
    });


    it('should return an empty string when the token is not found in the array', async () => {
      const hexcodeTokenArr = [
        { token: 'token1', hexcode: 'hexcode1' },
        { token: 'token2', hexcode: 'hexcode2' },
      ];
      const token = 'token3';
      const result = await service.getTokenHexcode(hexcodeTokenArr, token);
      expect(result).toBe('');
    });

    it('should return an empty string when the array is empty', async () => {
      const hexcodeTokenArr = [];
      const token = 'token1';
      const result = await service.getTokenHexcode(hexcodeTokenArr, token);
      expect(result).toBe('');
    });

  })

  // getCalculatedFluency
  describe('getCalculatedFluency', () => {
    it('should calculate fluency score with typical values', async () => {
      const textEvalMetrics = {
        wer: 0.1,
        cer: 0.05,
        insertion: ['ins1'],
        deletion: ['del1'],
        substitution: ['sub1']
      };
      const repetitionCount = 2;
      const original_text = "This is a test sentence.";
      const response_text = "This is a test.";
      const pause_count = 1;

      const result = await service.getCalculatedFluency(textEvalMetrics, repetitionCount, original_text, response_text, pause_count);
      expect(result).toBeCloseTo(1.715);
    });

    it('should calculate fluency score with zero values', async () => {
      const textEvalMetrics = {
        wer: 0,
        cer: 0,
        insertion: [],
        deletion: [],
        substitution: []
      };
      const repetitionCount = 0;
      const original_text = "This is a test.";
      const response_text = "This is a test.";
      const pause_count = 0;

      const result = await service.getCalculatedFluency(textEvalMetrics, repetitionCount, original_text, response_text, pause_count);
      expect(result).toBe(0);
    });

    it('should calculate fluency score with different text lengths', async () => {
      const textEvalMetrics = {
        wer: 0.2,
        cer: 0.1,
        insertion: ['ins1'],
        deletion: ['del1', 'del2'],
        substitution: ['sub1']
      };
      const repetitionCount = 1;
      const original_text = "This is a longer test sentence.";
      const response_text = "This is shorter.";
      const pause_count = 2;

      const result = await service.getCalculatedFluency(textEvalMetrics, repetitionCount, original_text, response_text, pause_count);
      expect(result).toBeCloseTo(2.68);
    });

    it('should calculate fluency score with different word counts', async () => {
      const textEvalMetrics = {
        wer: 0.15,
        cer: 0.07,
        insertion: ['ins1', 'ins2'],
        deletion: ['del1'],
        substitution: ['sub1', 'sub2']
      };
      const repetitionCount = 3;
      const original_text = "This is a test.";
      const response_text = "This test.";
      const pause_count = 1;

      const result = await service.getCalculatedFluency(textEvalMetrics, repetitionCount, original_text, response_text, pause_count);
      expect(result).toBeCloseTo(1.7715);
    });

    it('should calculate fluency score with high repetition and pause counts', async () => {
      const textEvalMetrics = {
        wer: 0.3,
        cer: 0.1,
        insertion: ['ins1', 'ins2', 'ins3'],
        deletion: ['del1', 'del2'],
        substitution: ['sub1', 'sub2', 'sub3']
      };
      const repetitionCount = 5;
      const original_text = "This is a test.";
      const response_text = "This is a test.";
      const pause_count = 4;

      const result = await service.getCalculatedFluency(textEvalMetrics, repetitionCount, original_text, response_text, pause_count);
      expect(result).toBeCloseTo(1.985);
    });
  })

  // getConstructedText
  describe('getCalculatedFluency', () => {
    const text = "கா ந்த";
    const emptyText = "";
    const vowelSignArr = ["ா"];
    const language = "ta";

    it('should return syllables for typical input with vowel signs', async () => {
      const result = await service.getSyllablesFromString(text, vowelSignArr, language);
      expect(result).toEqual(["க", "கா", "ந", "்", "த"]);
    });

    it('should return an empty array for empty input text', async () => {
      const result = await service.getSyllablesFromString(emptyText, vowelSignArr, language);
      expect(result).toEqual([]);
    });

    it('should handle different languages', async () => {
      const text = "test text";
      const vowelSignArr = ["a", "e", "i", "o", "u"];
      const language = "en";

      const result = await service.getSyllablesFromString(text, vowelSignArr, language);
      expect(result).toEqual([]);
    });

  })

  // createMilestoneRecord
  describe('createMilestoneRecord', () => {
    const createMilestoneRecordDto = {
      user_id: '123',
      session_id: '456',
      sub_session_id: '789',
      milestone_level: 'level1',
      sub_milestone_level: 'subLevel1',
    };

    const expectedInsertData = {
      session_id: createMilestoneRecordDto.session_id,
      sub_session_id: createMilestoneRecordDto.sub_session_id,
      milestone_level: createMilestoneRecordDto.milestone_level,
      sub_milestone_level: createMilestoneRecordDto.sub_milestone_level,
      createdAt: expect.any(String),
    };

    it('should successfully update the milestone record', async () => {
      scoreModel.updateOne.mockResolvedValue({ nModified: 1 });
      const result = await service.createMilestoneRecord(createMilestoneRecordDto);
      expect(scoreModel.updateOne).toHaveBeenCalledWith(
        { user_id: createMilestoneRecordDto.user_id },
        { $push: { milestone_progress: expectedInsertData } }
      );
      expect(result).toEqual({ nModified: 1 });
    });

    it('should handle errors', async () => {
      const error = new Error('Something went wrong');
      scoreModel.updateOne.mockRejectedValue(error);

      const result = await service.createMilestoneRecord(createMilestoneRecordDto);
      expect(scoreModel.updateOne).toHaveBeenCalledWith(
        { user_id: createMilestoneRecordDto.user_id },
        { $push: { milestone_progress: expect.any(Object) } }
      );
      expect(result).toBe(error);
    });
  })

  // getTargetsBysubSession
  describe('getTargetsBysubSession', () => {
    it('should retrieve target records by sub session successfully', async () => {
      scoreModel.aggregate.mockResolvedValue(mockRecordData);

      const result = await service.getTargetsBysubSession(subSessionId, language);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $unwind: '$sessions' },
        { $match: { 'sessions.sub_session_id': subSessionId, 'sessions.language': language } },
        {
          $facet: {
            confidenceScores: [
              { $unwind: '$sessions.confidence_scores' },
              {
                $project: {
                  _id: 0,
                  date: '$sessions.createdAt',
                  session_id: '$sessions.session_id',
                  character: '$sessions.confidence_scores.token',
                  score: '$sessions.confidence_scores.confidence_score',
                },
              },
              { $sort: { date: -1 } },
            ],
            missingTokenScores: [
              { $unwind: '$sessions.missing_token_scores' },
              {
                $project: {
                  _id: 0,
                  session_id: '$sessions.session_id',
                  date: '$sessions.createdAt',
                  character: '$sessions.missing_token_scores.token',
                  score: '$sessions.missing_token_scores.confidence_score',
                },
              },
              { $sort: { date: -1 } },
            ],
          },
        },
        {
          $project: {
            combinedResults: { $concatArrays: ['$confidenceScores', '$missingTokenScores'] },
          },
        },
        { $unwind: '$combinedResults' },
        { $replaceRoot: { newRoot: '$combinedResults' } },
        {
          $project: {
            sessionId: '$session_id',
            date: '$date',
            token: '$character',
            score: '$score',
            isRetryExists: { $ifNull: ['$sessions.isRetry', false] },
          },
        },
        {
          $match: {
            $or: [{ isRetryExists: false }, { 'sessions.isRetry': false }],
          },
        },
        { $sort: { date: -1 } },
        {
          $group: {
            _id: { token: '$token' },
            scores: { $push: '$score' },
          },
        },
        {
          $project: {
            _id: 0,
            character: '$_id.token',
            latestScores: { $slice: ['$scores', -5] },
          },
        },
        {
          $addFields: {
            countBelowThreshold: {
              $size: {
                $filter: {
                  input: '$latestScores',
                  as: 'score',
                  cond: { $lt: ['$$score', 0.7] },
                },
              },
            },
            countAboveThreshold: {
              $size: {
                $filter: {
                  input: '$latestScores',
                  as: 'score',
                  cond: { $gte: ['$$score', 0.7] },
                },
              },
            },
          },
        },
        {
          $match: {
            $expr: { $gt: ['$countBelowThreshold', '$countAboveThreshold'] },
          },
        },
      ]);
      expect(result).toEqual(mockRecordData);
    });

    it('should handle errors during data retrieval', async () => {
      scoreModel.aggregate.mockRejectedValue(error);
      try {
        await service.getTargetsBysubSession(subSessionId, language);
      } catch (e) {
        expect(scoreModel.aggregate).toHaveBeenCalled();
        expect(e).toBe(error);
      }
    });
  });

  // getTargetsByUser
  describe('getTargetsByUser', () => {
    const mockRecordData = [
      {
        character: 'a',
        score: 0.6,
      },
    ];
    const userId = 'user1';

    it('should retrieve target records by user successfully', async () => {
      scoreModel.aggregate.mockResolvedValue(mockRecordData);
      const result = await service.getTargetsByUser(userId, language);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $match: { user_id: userId } },
        { $unwind: '$sessions' },
        { $match: { 'sessions.language': language } },
        {
          $facet: {
            confidenceScores: [
              { $unwind: '$sessions.confidence_scores' },
              {
                $project: {
                  _id: 0,
                  date: '$sessions.createdAt',
                  character: '$sessions.confidence_scores.token',
                  score: '$sessions.confidence_scores.confidence_score',
                },
              },
              { $sort: { date: -1 } },
            ],
            missingTokenScores: [
              { $unwind: '$sessions.missing_token_scores' },
              {
                $project: {
                  _id: 0,
                  date: '$sessions.createdAt',
                  character: '$sessions.missing_token_scores.token',
                  score: '$sessions.missing_token_scores.confidence_score',
                },
              },
              { $sort: { date: -1 } },
            ],
          },
        },
        {
          $project: {
            combinedResults: { $concatArrays: ['$confidenceScores', '$missingTokenScores'] },
          },
        },
        { $unwind: '$combinedResults' },
        { $replaceRoot: { newRoot: '$combinedResults' } },
        {
          $project: {
            date: '$date',
            token: '$character',
            score: '$score',
            isRetryExists: { $ifNull: ['$sessions.isRetry', false] },
          },
        },
        {
          $match: {
            $or: [{ isRetryExists: false }, { 'sessions.isRetry': false }],
          },
        },
        { $sort: { date: -1 } },
        {
          $group: {
            _id: { token: '$token' },
            scores: { $push: '$score' },
          },
        },
        {
          $project: {
            _id: 0,
            character: '$_id.token',
            latestScores: { $slice: ['$scores', -5] },
          },
        },
        {
          $addFields: {
            countBelowThreshold: {
              $size: {
                $filter: {
                  input: '$latestScores',
                  as: 'score',
                  cond: { $lt: ['$$score', 0.7] },
                },
              },
            },
            countAboveThreshold: {
              $size: {
                $filter: {
                  input: '$latestScores',
                  as: 'score',
                  cond: { $gte: ['$$score', 0.7] },
                },
              },
            },
            avgScore: { $avg: '$latestScores' },
          },
        },
        {
          $match: {
            $expr: { $gt: ['$countBelowThreshold', '$countAboveThreshold'] },
          },
        },
        {
          $project: {
            character: 1,
            score: '$avgScore',
          },
        },
        {
          $addFields: {
            score: {
              $divide: [{ $trunc: { $multiply: ['$score', 100] } }, 100],
            },
          },
        },
      ]);
      expect(result).toEqual(mockRecordData);
    });

    it('should handle errors during data retrieval', async () => {
      const error = new Error('Something went wrong');
      scoreModel.aggregate.mockRejectedValue(error);
      try {
        await service.getTargetsByUser(userId, language);
      } catch (e) {
        expect(scoreModel.aggregate).toHaveBeenCalled();
        expect(e).toBe(error);
      }
    });
  })

  // getTargetsBysubSessionUserProfile
  describe('getTargetsBysubSessionUserProfile', () => {
    const mockRecordData = [
      {
        character: 'a',
        countBelowThreshold: 1,
        countAboveThreshold: 4,
        avgScore: 0.75,
        latestScores: [
          { score: 0.7, original_text: 'test', response_text: 'test' },
          { score: 0.8, original_text: 'test', response_text: 'test' },
          { score: 0.9, original_text: 'test', response_text: 'test' },
          { score: 0.6, original_text: 'test', response_text: 'test' },
          { score: 0.5, original_text: 'test', response_text: 'test' }
        ],
      },
    ];

    it('should retrieve target records by sub session and user profile successfully', async () => {
      scoreModel.aggregate.mockResolvedValue(mockRecordData);
      const result = await service.getTargetsBysubSessionUserProfile(subSessionId, language);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $unwind: '$sessions' },
        { $match: { 'sessions.sub_session_id': subSessionId, 'sessions.language': language } },
        {
          $facet: {
            confidenceScores: [
              { $unwind: '$sessions.confidence_scores' },
              {
                $project: {
                  _id: 0,
                  date: '$sessions.createdAt',
                  original_text: '$sessions.original_text',
                  response_text: '$sessions.response_text',
                  character: '$sessions.confidence_scores.token',
                  score: '$sessions.confidence_scores.confidence_score',
                },
              },
              { $sort: { date: -1 } },
            ],
            missingTokenScores: [
              { $unwind: '$sessions.missing_token_scores' },
              {
                $project: {
                  _id: 0,
                  date: '$sessions.createdAt',
                  original_text: '$sessions.original_text',
                  response_text: '$sessions.response_text',
                  character: '$sessions.missing_token_scores.token',
                  score: '$sessions.missing_token_scores.confidence_score',
                },
              },
              { $sort: { date: -1 } },
            ],
          },
        },
        {
          $project: {
            combinedResults: { $concatArrays: ['$confidenceScores', '$missingTokenScores'] },
          },
        },
        { $unwind: '$combinedResults' },
        { $replaceRoot: { newRoot: '$combinedResults' } },
        {
          $project: {
            original_text: '$original_text',
            response_text: '$response_text',
            date: '$date',
            token: '$character',
            score: '$score',
            isRetryExists: { $ifNull: ['$sessions.isRetry', false] },
          },
        },
        {
          $match: {
            $or: [{ isRetryExists: false }, { 'sessions.isRetry': false }],
          },
        },
        { $sort: { date: -1 } },
        {
          $group: {
            _id: { token: '$token' },
            scores: {
              $push: { score: '$score', original_text: '$original_text', response_text: '$response_text' },
            },
          },
        },
        {
          $project: {
            _id: 0,
            character: '$_id.token',
            latestScores: { $slice: ['$scores', -5] },
          },
        },
        {
          $addFields: {
            countBelowThreshold: {
              $size: {
                $filter: {
                  input: '$latestScores',
                  as: 'score',
                  cond: { $lt: ['$$score.score', 0.7] },
                },
              },
            },
            countAboveThreshold: {
              $size: {
                $filter: {
                  input: '$latestScores',
                  as: 'score',
                  cond: { $gte: ['$$score.score', 0.7] },
                },
              },
            },
            avgScore: { $avg: '$latestScores.score' },
          },
        },
        {
          $project: {
            character: 1,
            countBelowThreshold: 1,
            countAboveThreshold: 1,
            avgScore: 1,
            latestScores: 1,
          },
        },
        {
          $match: {
            $expr: { $lt: ['$countBelowThreshold', '$countAboveThreshold'] },
          },
        },
      ]);
      expect(result).toEqual(mockRecordData);
    });

    it('should handle errors during data retrieval', async () => {
      const error = new Error('Something went wrong');
      scoreModel.aggregate.mockRejectedValue(error);
      try {
        await service.getTargetsBysubSessionUserProfile(subSessionId, language);
      } catch (e) {
        expect(scoreModel.aggregate).toHaveBeenCalled();
        expect(e).toBe(error);
      }
    })

  })

  // getTargetsBySession
  describe('getTargetsBySession', () => {

    it('should retrieve target records by session successfully', async () => {
      const mockRecordData = [
        {
          character: 'a',
          latestScores: [0.6, 0.5, 0.8, 0.7, 0.4],
          countBelowThreshold: 3,
          countAboveThreshold: 2,
        },
      ];
      scoreModel.aggregate.mockResolvedValue(mockRecordData);

      const result = await service.getTargetsBySession(sessionId, language);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $unwind: '$sessions' },
        { $match: { 'sessions.session_id': sessionId, 'sessions.language': language } },
        {
          $facet: {
            confidenceScores: [
              { $unwind: '$sessions.confidence_scores' },
              {
                $project: {
                  _id: 0,
                  date: '$sessions.createdAt',
                  session_id: '$sessions.session_id',
                  character: '$sessions.confidence_scores.token',
                  score: '$sessions.confidence_scores.confidence_score',
                },
              },
              { $sort: { date: -1 } },
            ],
            missingTokenScores: [
              { $unwind: '$sessions.missing_token_scores' },
              {
                $project: {
                  _id: 0,
                  session_id: '$sessions.session_id',
                  date: '$sessions.createdAt',
                  character: '$sessions.missing_token_scores.token',
                  score: '$sessions.missing_token_scores.confidence_score',
                },
              },
              { $sort: { date: -1 } },
            ],
          },
        },
        {
          $project: {
            combinedResults: { $concatArrays: ['$confidenceScores', '$missingTokenScores'] },
          },
        },
        { $unwind: '$combinedResults' },
        { $replaceRoot: { newRoot: '$combinedResults' } },
        {
          $project: {
            sessionId: '$session_id',
            date: '$date',
            token: '$character',
            score: '$score',
            isRetryExists: { $ifNull: ['$sessions.isRetry', false] },
          },
        },
        {
          $match: {
            $or: [{ isRetryExists: false }, { 'sessions.isRetry': false }],
          },
        },
        { $sort: { date: -1 } },
        {
          $group: {
            _id: { token: '$token' },
            scores: { $push: '$score' },
          },
        },
        {
          $project: {
            _id: 0,
            character: '$_id.token',
            latestScores: { $slice: ['$scores', -5] },
          },
        },
        {
          $addFields: {
            countBelowThreshold: {
              $size: {
                $filter: {
                  input: '$latestScores',
                  as: 'score',
                  cond: { $lt: ['$$score', 0.7] },
                },
              },
            },
            countAboveThreshold: {
              $size: {
                $filter: {
                  input: '$latestScores',
                  as: 'score',
                  cond: { $gte: ['$$score', 0.7] },
                },
              },
            },
          },
        },
        {
          $match: {
            $expr: { $gt: ['$countBelowThreshold', '$countAboveThreshold'] },
          },
        },
      ]);
      expect(result).toEqual(mockRecordData);
    });

    it('should handle errors during data retrieval', async () => {
      scoreModel.aggregate.mockRejectedValue(error);
      try {
        await service.getTargetsBySession(sessionId, language);
      } catch (e) {
        expect(scoreModel.aggregate).toHaveBeenCalled();
        expect(e).toBe(error);
      }
    });
  })

  // getFamiliarityBySession
  describe('getFamiliarityBySession', () => {
    it('should retrieve familiarity records by session successfully', async () => {
      const mockRecordData = [
        {
          character: 'a',
          latestScores: [0.6, 0.5, 0.8, 0.7, 0.4],
          countBelowThreshold: 3,
          countAboveThreshold: 2,
        },
      ];

      scoreModel.aggregate.mockResolvedValue(mockRecordData);
      const result = await service.getFamiliarityBySession(sessionId, language);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $unwind: '$sessions' },
        { $match: { 'sessions.session_id': sessionId, 'sessions.language': language } },
        {
          $facet: {
            confidenceScores: [
              { $unwind: '$sessions.confidence_scores' },
              {
                $project: {
                  _id: 0,
                  date: '$sessions.createdAt',
                  character: '$sessions.confidence_scores.token',
                  score: '$sessions.confidence_scores.confidence_score',
                },
              },
              { $sort: { date: -1 } },
            ],
            missingTokenScores: [
              { $unwind: '$sessions.missing_token_scores' },
              {
                $project: {
                  _id: 0,
                  date: '$sessions.createdAt',
                  character: '$sessions.missing_token_scores.token',
                  score: '$sessions.missing_token_scores.confidence_score',
                },
              },
              { $sort: { date: -1 } },
            ],
          },
        },
        {
          $project: {
            combinedResults: { $concatArrays: ['$confidenceScores', '$missingTokenScores'] },
          },
        },
        { $unwind: '$combinedResults' },
        { $replaceRoot: { newRoot: '$combinedResults' } },
        {
          $project: {
            date: '$date',
            token: '$character',
            score: '$score',
            isRetryExists: { $ifNull: ['$sessions.isRetry', false] },
          },
        },
        {
          $match: {
            $or: [{ isRetryExists: false }, { 'sessions.isRetry': false }],
          },
        },
        { $sort: { date: -1 } },
        {
          $group: {
            _id: { token: '$token' },
            scores: { $push: '$score' },
          },
        },
        {
          $project: {
            _id: 0,
            character: '$_id.token',
            latestScores: { $slice: ['$scores', -5] },
          },
        },
        {
          $addFields: {
            countBelowThreshold: {
              $size: {
                $filter: {
                  input: '$latestScores',
                  as: 'score',
                  cond: { $lt: ['$$score', 0.7] },
                },
              },
            },
            countAboveThreshold: {
              $size: {
                $filter: {
                  input: '$latestScores',
                  as: 'score',
                  cond: { $gte: ['$$score', 0.7] },
                },
              },
            },
          },
        },
        {
          $match: {
            $expr: { $gte: ['$countAboveThreshold', '$countBelowThreshold'] },
          },
        },
      ]);
      expect(result).toEqual(mockRecordData);
    });

    it('should handle errors during data retrieval', async () => {
      scoreModel.aggregate.mockRejectedValue(error);
      try {
        await service.getFamiliarityBySession(sessionId, language);
      } catch (e) {
        expect(scoreModel.aggregate).toHaveBeenCalled();
        expect(e).toBe(error);
      }
    });
  })

  // getFamiliarityBysubSession
  describe('getFamiliarityBysubSession', () => {
    it('should retrieve familiarity records by sub session successfully', async () => {
      scoreModel.aggregate.mockResolvedValue(mockRecordData);
      const result = await service.getFamiliarityBysubSession(subSessionId, language);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $unwind: '$sessions' },
        { $match: { 'sessions.sub_session_id': subSessionId, 'sessions.language': language } },
        {
          $facet: {
            confidenceScores: [
              { $unwind: '$sessions.confidence_scores' },
              {
                $project: {
                  _id: 0,
                  date: '$sessions.createdAt',
                  character: '$sessions.confidence_scores.token',
                  score: '$sessions.confidence_scores.confidence_score',
                },
              },
              { $sort: { date: -1 } },
            ],
            missingTokenScores: [
              { $unwind: '$sessions.missing_token_scores' },
              {
                $project: {
                  _id: 0,
                  date: '$sessions.createdAt',
                  character: '$sessions.missing_token_scores.token',
                  score: '$sessions.missing_token_scores.confidence_score',
                },
              },
              { $sort: { date: -1 } },
            ],
          },
        },
        {
          $project: {
            combinedResults: { $concatArrays: ['$confidenceScores', '$missingTokenScores'] },
          },
        },
        { $unwind: '$combinedResults' },
        { $replaceRoot: { newRoot: '$combinedResults' } },
        {
          $project: {
            date: '$date',
            token: '$character',
            score: '$score',
            isRetryExists: { $ifNull: ['$sessions.isRetry', false] },
          },
        },
        {
          $match: {
            $or: [{ isRetryExists: false }, { 'sessions.isRetry': false }],
          },
        },
        { $sort: { date: -1 } },
        {
          $group: {
            _id: { token: '$token' },
            scores: { $push: '$score' },
          },
        },
        {
          $project: {
            _id: 0,
            character: '$_id.token',
            latestScores: { $slice: ['$scores', -5] },
          },
        },
        {
          $addFields: {
            countBelowThreshold: {
              $size: {
                $filter: {
                  input: '$latestScores',
                  as: 'score',
                  cond: { $lt: ['$$score', 0.7] },
                },
              },
            },
            countAboveThreshold: {
              $size: {
                $filter: {
                  input: '$latestScores',
                  as: 'score',
                  cond: { $gte: ['$$score', 0.7] },
                },
              },
            },
          },
        },
        {
          $match: {
            $expr: { $gte: ['$countAboveThreshold', '$countBelowThreshold'] },
          },
        },
      ]);
      expect(result).toEqual(mockRecordData);
    });

    it('should handle errors during data retrieval', async () => {
      scoreModel.aggregate.mockRejectedValue(error);
      try {
        await service.getFamiliarityBysubSession(subSessionId, language);
      } catch (e) {
        expect(scoreModel.aggregate).toHaveBeenCalled();
        expect(e).toBe(error);
      }
    });
  })

  // getFamiliarityByUser
  describe('getFamiliarityByUser', () => {
    const userId = 'user1';
    it('should retrieve familiarity records by user successfully', async () => {
      scoreModel.aggregate.mockResolvedValue(mockRecordData);
      const result = await service.getFamiliarityByUser(userId, language);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $match: { user_id: userId } },
        { $unwind: '$sessions' },
        { $match: { 'sessions.language': language } },
        {
          $facet: {
            confidenceScores: [
              { $unwind: '$sessions.confidence_scores' },
              {
                $project: {
                  _id: 0,
                  date: '$sessions.createdAt',
                  character: '$sessions.confidence_scores.token',
                  score: '$sessions.confidence_scores.confidence_score',
                },
              },
              { $sort: { date: -1 } },
            ],
            missingTokenScores: [
              { $unwind: '$sessions.missing_token_scores' },
              {
                $project: {
                  _id: 0,
                  date: '$sessions.createdAt',
                  character: '$sessions.missing_token_scores.token',
                  score: '$sessions.missing_token_scores.confidence_score',
                },
              },
              { $sort: { date: -1 } },
            ],
          },
        },
        {
          $project: {
            combinedResults: { $concatArrays: ['$confidenceScores', '$missingTokenScores'] },
          },
        },
        { $unwind: '$combinedResults' },
        { $replaceRoot: { newRoot: '$combinedResults' } },
        {
          $project: {
            date: '$date',
            token: '$character',
            score: '$score',
            isRetryExists: { $ifNull: ['$sessions.isRetry', false] },
          },
        },
        {
          $match: {
            $or: [{ isRetryExists: false }, { 'sessions.isRetry': false }],
          },
        },
        { $sort: { date: -1 } },
        {
          $group: {
            _id: { token: '$token' },
            scores: { $push: '$score' },
          },
        },
        {
          $project: {
            _id: 0,
            character: '$_id.token',
            latestScores: { $slice: ['$scores', -5] },
          },
        },
        {
          $addFields: {
            countBelowThreshold: {
              $size: {
                $filter: {
                  input: '$latestScores',
                  as: 'score',
                  cond: { $lt: ['$$score', 0.7] },
                },
              },
            },
            countAboveThreshold: {
              $size: {
                $filter: {
                  input: '$latestScores',
                  as: 'score',
                  cond: { $gte: ['$$score', 0.7] },
                },
              },
            },
            score: { $avg: '$latestScores' },
          },
        },
        {
          $match: {
            $expr: { $gte: ['$countAboveThreshold', '$countBelowThreshold'] },
          },
        },
      ]);
      expect(result).toEqual(mockRecordData);
    });

    it('should handle errors during data retrieval', async () => {
      scoreModel.aggregate.mockRejectedValue(error);
      try {
        await service.getFamiliarityByUser(userId, language);
      } catch (e) {
        expect(scoreModel.aggregate).toHaveBeenCalled();
        expect(e).toBe(error);
      }
    });

  })

  // getFamiliarityBysubSessionUserProfile
  describe('getFamiliarityBysubSessionUserProfile', () => {
    it('should retrieve familiarity records by sub session user profile successfully', async () => {
      const mockRecordData = [
        {
          character: 'a',
          latestScores: [
            { score: 0.6, original_text: 'text1', response_text: 'text1' },
            { score: 0.5, original_text: 'text2', response_text: 'text2' },
            { score: 0.8, original_text: 'text3', response_text: 'text3' },
            { score: 0.7, original_text: 'text4', response_text: 'text4' },
            { score: 0.4, original_text: 'text5', response_text: 'text5' },
          ],
          countBelowThreshold: 3,
          countAboveThreshold: 2,
          avg: 0.6,
        },
      ];
      scoreModel.aggregate.mockResolvedValue(mockRecordData);

      const result = await service.getFamiliarityBysubSessionUserProfile(subSessionId, language);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $unwind: '$sessions' },
        { $match: { 'sessions.sub_session_id': subSessionId, 'sessions.language': language } },
        {
          $facet: {
            confidenceScores: [
              { $unwind: '$sessions.confidence_scores' },
              {
                $project: {
                  _id: 0,
                  date: '$sessions.createdAt',
                  character: '$sessions.confidence_scores.token',
                  score: '$sessions.confidence_scores.confidence_score',
                  original_text: '$sessions.original_text',
                  response_text: '$sessions.response_text',
                },
              },
              { $sort: { date: -1 } },
            ],
            missingTokenScores: [
              { $unwind: '$sessions.missing_token_scores' },
              {
                $project: {
                  _id: 0,
                  date: '$sessions.createdAt',
                  character: '$sessions.missing_token_scores.token',
                  score: '$sessions.missing_token_scores.confidence_score',
                  original_text: '$sessions.original_text',
                  response_text: '$sessions.response_text',
                },
              },
              { $sort: { date: -1 } },
            ],
          },
        },
        {
          $project: {
            combinedResults: { $concatArrays: ['$confidenceScores', '$missingTokenScores'] },
          },
        },
        { $unwind: '$combinedResults' },
        { $replaceRoot: { newRoot: '$combinedResults' } },
        {
          $project: {
            date: '$date',
            token: '$character',
            score: '$score',
            original_text: '$original_text',
            response_text: '$response_text',
            isRetryExists: { $ifNull: ['$sessions.isRetry', false] },
          },
        },
        {
          $match: {
            $or: [{ isRetryExists: false }, { 'sessions.isRetry': false }],
          },
        },
        { $sort: { date: -1 } },
        {
          $group: {
            _id: { token: '$token' },
            scores: {
              $push: {
                score: '$score',
                original_text: '$original_text',
                response_text: '$response_text',
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            character: '$_id.token',
            latestScores: { $slice: ['$scores', -5] },
          },
        },
        {
          $addFields: {
            countBelowThreshold: {
              $size: {
                $filter: {
                  input: '$latestScores',
                  as: 'score',
                  cond: { $lt: ['$$score.score', 0.7] },
                },
              },
            },
            countAboveThreshold: {
              $size: {
                $filter: {
                  input: '$latestScores',
                  as: 'score',
                  cond: { $gte: ['$$score.score', 0.7] },
                },
              },
            },
            avg: { $avg: '$latestScores.score' },
          },
        },
        {
          $match: {
            $expr: { $gte: ['$countAboveThreshold', '$countBelowThreshold'] },
          },
        },
      ]);
      expect(result).toEqual(mockRecordData);
    });

    it('should handle errors during data retrieval', async () => {
      scoreModel.aggregate.mockRejectedValue(error);
      try {
        await service.getFamiliarityBysubSessionUserProfile(subSessionId, language);
      } catch (e) {
        expect(scoreModel.aggregate).toHaveBeenCalled();
        expect(e).toBe(error);
      }
    });
  })

  // getFluencyBysubSession
  describe('getFluencyBysubSession', () => {
    it('should retrieve fluency score by sub session successfully', async () => {
      const mockRecordData = [
        {
          fluencyScore: 0.85,
        },
      ];

      scoreModel.aggregate.mockResolvedValue(mockRecordData);
      const result = await service.getFluencyBysubSession(subSessionId, language);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $unwind: '$sessions' },
        { $match: { 'sessions.sub_session_id': subSessionId, 'sessions.language': language } },
        {
          $group: {
            _id: { subSessionId: '$sessions.sub_session_id' },
            fluencyScore: { $avg: '$sessions.fluencyScore' },
          },
        },
        {
          $project: {
            _id: 0,
            fluencyScore: '$fluencyScore',
            isRetryExists: { $ifNull: ['$sessions.isRetry', false] },
          },
        },
        {
          $match: {
            $or: [{ isRetryExists: false }, { 'sessions.isRetry': false }],
          },
        },
      ]);
      expect(result).toEqual(0.85);
    });

    it('should return 0 if no records are found', async () => {
      scoreModel.aggregate.mockResolvedValue([]);

      const result = await service.getFluencyBysubSession(subSessionId, language);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $unwind: '$sessions' },
        { $match: { 'sessions.sub_session_id': subSessionId, 'sessions.language': language } },
        {
          $group: {
            _id: { subSessionId: '$sessions.sub_session_id' },
            fluencyScore: { $avg: '$sessions.fluencyScore' },
          },
        },
        {
          $project: {
            _id: 0,
            fluencyScore: '$fluencyScore',
            isRetryExists: { $ifNull: ['$sessions.isRetry', false] },
          },
        },
        {
          $match: {
            $or: [{ isRetryExists: false }, { 'sessions.isRetry': false }],
          },
        },
      ]);
      expect(result).toEqual(0);
    });

    it('should handle errors during data retrieval', async () => {
      scoreModel.aggregate.mockRejectedValue(error);
      try {
        await service.getFluencyBysubSession(subSessionId, language);
      } catch (e) {
        expect(scoreModel.aggregate).toHaveBeenCalled();
        expect(e).toBe(error);
      }
    });
  })

  // getMeanLearnerBySession
  describe("getMeanLearnerBySession", () => {
    it('should retrieve mean learner by session successfully', async () => {
      const mockRecordData = [
        {
          token: 'a',
          mean: 0.85,
        },
      ];

      scoreModel.aggregate.mockResolvedValue(mockRecordData);
      const result = await service.getMeanLearnerBySession(sessionId);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $match: { 'sessions.session_id': sessionId } },
        { $unwind: '$sessions' },
        { $unwind: '$sessions.confidence_scores' },
        { $match: { 'sessions.session_id': sessionId } },
        {
          $project: {
            _id: 0,
            user_id: 1,
            session_id: '$sessions.session_id',
            token: '$sessions.confidence_scores.token',
            score: '$sessions.confidence_scores.confidence_score',
            hexcode: '$sessions.confidence_scores.hexcode',
          },
        },
        {
          $group: {
            _id: {
              user_id: '$user_id',
              token: '$token',
            },
            mean: { $avg: '$score' },
          },
        },
        {
          $project: {
            _id: 0,
            token: '$_id.token',
            mean: 1,
          },
        },
      ]);
      expect(result).toEqual(mockRecordData);
    });

    it('should handle errors during data retrieval', async () => {
      scoreModel.aggregate.mockRejectedValue(error);

      try {
        await service.getMeanLearnerBySession(sessionId);
      } catch (e) {
        expect(scoreModel.aggregate).toHaveBeenCalledWith([
          { $match: { 'sessions.session_id': sessionId } },
          { $unwind: '$sessions' },
          { $unwind: '$sessions.confidence_scores' },
          { $match: { 'sessions.session_id': sessionId } },
          {
            $project: {
              _id: 0,
              user_id: 1,
              session_id: '$sessions.session_id',
              token: '$sessions.confidence_scores.token',
              score: '$sessions.confidence_scores.confidence_score',
              hexcode: '$sessions.confidence_scores.hexcode',
            },
          },
          {
            $group: {
              _id: {
                user_id: '$user_id',
                token: '$token',
              },
              mean: { $avg: '$score' },
            },
          },
          {
            $project: {
              _id: 0,
              token: '$_id.token',
              mean: 1,
            },
          },
        ]);
        expect(e).toBe(error);
      }
    });
  })

  // getlatestmilestone
  describe('getlatestmilestone', () => {
    it('should retrieve the latest milestone successfully', async () => {
      const mockRecordData = [
        {
          user_id: 'user1',
          session_id: 'session1',
          sub_session_id: 'subSession1',
          milestone_level: 1,
          sub_milestone_level: 2,
          createdAt: '2023-01-01T00:00:00Z',
          language: 'en',
        },
      ];
      scoreModel.aggregate.mockResolvedValue(mockRecordData);

      const result = await service.getlatestmilestone(userId, language);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $match: { user_id: userId } },
        { $unwind: '$milestone_progress' },
        {
          $project: {
            _id: 0,
            user_id: 1,
            session_id: '$milestone_progress.session_id',
            sub_session_id: '$milestone_progress.sub_session_id',
            milestone_level: '$milestone_progress.milestone_level',
            sub_milestone_level: '$milestone_progress.sub_milestone_level',
            createdAt: '$milestone_progress.createdAt',
            sessions: 1,
          },
        },
        {
          $addFields: {
            language: {
              $let: {
                vars: {
                  matchedSession: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: '$sessions',
                          as: 'session',
                          cond: {
                            $eq: ['$$session.sub_session_id', '$sub_session_id'],
                          },
                        },
                      },
                      0,
                    ],
                  },
                },
                in: '$$matchedSession.language',
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            user_id: 1,
            session_id: 1,
            sub_session_id: 1,
            milestone_level: 1,
            sub_milestone_level: 1,
            createdAt: 1,
            language: 1,
          },
        },
        { $match: { language: language } },
        { $sort: { createdAt: -1 } },
        { $limit: 1 },
      ]);
      expect(result).toEqual(mockRecordData);
    });

    it('should return an empty array if no records are found', async () => {
      scoreModel.aggregate.mockResolvedValue([]);

      const userId = 'user1';
      const language = 'en';

      const result = await service.getlatestmilestone(userId, language);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $match: { user_id: userId } },
        { $unwind: '$milestone_progress' },
        {
          $project: {
            _id: 0,
            user_id: 1,
            session_id: '$milestone_progress.session_id',
            sub_session_id: '$milestone_progress.sub_session_id',
            milestone_level: '$milestone_progress.milestone_level',
            sub_milestone_level: '$milestone_progress.sub_milestone_level',
            createdAt: '$milestone_progress.createdAt',
            sessions: 1,
          },
        },
        {
          $addFields: {
            language: {
              $let: {
                vars: {
                  matchedSession: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: '$sessions',
                          as: 'session',
                          cond: {
                            $eq: ['$$session.sub_session_id', '$sub_session_id'],
                          },
                        },
                      },
                      0,
                    ],
                  },
                },
                in: '$$matchedSession.language',
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            user_id: 1,
            session_id: 1,
            sub_session_id: 1,
            milestone_level: 1,
            sub_milestone_level: 1,
            createdAt: 1,
            language: 1,
          },
        },
        { $match: { language: language } },
        { $sort: { createdAt: -1 } },
        { $limit: 1 },
      ]);
      expect(result).toEqual([]);
    });

    it('should handle errors during data retrieval', async () => {
      const error = new Error('Something went wrong');
      scoreModel.aggregate.mockRejectedValue(error);

      const userId = 'user1';
      const language = 'en';

      try {
        await service.getlatestmilestone(userId, language);
      } catch (e) {
        expect(scoreModel.aggregate).toHaveBeenCalledWith([
          { $match: { user_id: userId } },
          { $unwind: '$milestone_progress' },
          {
            $project: {
              _id: 0,
              user_id: 1,
              session_id: '$milestone_progress.session_id',
              sub_session_id: '$milestone_progress.sub_session_id',
              milestone_level: '$milestone_progress.milestone_level',
              sub_milestone_level: '$milestone_progress.sub_milestone_level',
              createdAt: '$milestone_progress.createdAt',
              sessions: 1,
            },
          },
          {
            $addFields: {
              language: {
                $let: {
                  vars: {
                    matchedSession: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$sessions',
                            as: 'session',
                            cond: {
                              $eq: ['$$session.sub_session_id', '$sub_session_id'],
                            },
                          },
                        },
                        0,
                      ],
                    },
                  },
                  in: '$$matchedSession.language',
                },
              },
            },
          },
          {
            $project: {
              _id: 0,
              user_id: 1,
              session_id: 1,
              sub_session_id: 1,
              milestone_level: 1,
              sub_milestone_level: 1,
              createdAt: 1,
              language: 1,
            },
          },
          { $match: { language: language } },
          { $sort: { createdAt: -1 } },
          { $limit: 1 },
        ]);
        expect(e).toBe(error);
      }
    });
  })

  // getMeanLearnerByUser
  describe('getMeanLearnerByUser', () => {
    it('should retrieve mean learner by user successfully', async () => {
      const mockRecordData = [
        {
          token: 'a',
          mean: 0.85,
        },
      ];
      scoreModel.aggregate.mockResolvedValue(mockRecordData);
      const result = await service.getMeanLearnerByUser(userId);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $match: { user_id: userId } },
        { $unwind: '$sessions' },
        { $unwind: '$sessions.confidence_scores' },
        {
          $project: {
            _id: 0,
            user_id: 1,
            session_id: '$sessions.session_id',
            token: '$sessions.confidence_scores.token',
            score: '$sessions.confidence_scores.confidence_score',
            hexcode: '$sessions.confidence_scores.hexcode',
          },
        },
        {
          $group: {
            _id: {
              user_id: '$user_id',
              token: '$token',
            },
            mean: { $avg: '$score' },
          },
        },
        {
          $project: {
            _id: 0,
            token: '$_id.token',
            mean: 1,
          },
        },
      ]);
      expect(result).toEqual(mockRecordData);
    });

    it('should return an empty array if no records are found', async () => {
      scoreModel.aggregate.mockResolvedValue([]);

      const result = await service.getMeanLearnerByUser(userId);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $match: { user_id: userId } },
        { $unwind: '$sessions' },
        { $unwind: '$sessions.confidence_scores' },
        {
          $project: {
            _id: 0,
            user_id: 1,
            session_id: '$sessions.session_id',
            token: '$sessions.confidence_scores.token',
            score: '$sessions.confidence_scores.confidence_score',
            hexcode: '$sessions.confidence_scores.hexcode',
          },
        },
        {
          $group: {
            _id: {
              user_id: '$user_id',
              token: '$token',
            },
            mean: { $avg: '$score' },
          },
        },
        {
          $project: {
            _id: 0,
            token: '$_id.token',
            mean: 1,
          },
        },
      ]);
      expect(result).toEqual([]);
    });

    it('should handle errors during data retrieval', async () => {
      scoreModel.aggregate.mockRejectedValue(error);

      try {
        await service.getMeanLearnerByUser(userId);
      } catch (e) {
        expect(scoreModel.aggregate).toHaveBeenCalledWith([
          { $match: { user_id: userId } },
          { $unwind: '$sessions' },
          { $unwind: '$sessions.confidence_scores' },
          {
            $project: {
              _id: 0,
              user_id: 1,
              session_id: '$sessions.session_id',
              token: '$sessions.confidence_scores.token',
              score: '$sessions.confidence_scores.confidence_score',
              hexcode: '$sessions.confidence_scores.hexcode',
            },
          },
          {
            $group: {
              _id: {
                user_id: '$user_id',
                token: '$token',
              },
              mean: { $avg: '$score' },
            },
          },
          {
            $project: {
              _id: 0,
              token: '$_id.token',
              mean: 1,
            },
          },
        ]);
        expect(e).toBe(error);
      }
    });
  })

  // getConfidentVectorByUser
  describe('getConfidentVectorByUser', () => {
    it('should retrieve confident vector by user successfully', async () => {
      const mockRecordData = [
        {
          token: 'a',
          median: 0.85,
        },
        {
          token: 'b',
          median: 0.75,
        },
      ];

      scoreModel.aggregate.mockResolvedValue(mockRecordData);
      const result = await service.getConfidentVectorByUser(userId);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $match: { user_id: userId } },
        { $unwind: '$sessions' },
        { $unwind: '$sessions.confidence_scores' },
        {
          $project: {
            _id: 0,
            user_id: 1,
            token: '$sessions.confidence_scores.token',
            score: '$sessions.confidence_scores.confidence_score',
          },
        },
        {
          $group: {
            _id: {
              user_id: '$user_id',
              token: '$token',
            },
            scores: { $push: '$score' },
          },
        },
        {
          $project: {
            _id: 0,
            user_id: '$_id.user_id',
            token: '$_id.token',
            count: { $size: '$scores' },
            score: {
              $sortArray: {
                input: '$scores',
                sortBy: 1,
              },
            },
          },
        },
        {
          $project: {
            token: 1,
            median: {
              $cond: {
                if: { $eq: ['$count', 0] },
                then: null,
                else: {
                  $cond: {
                    if: { $eq: [{ $mod: ['$count', 2] }, 1] },
                    then: {
                      $arrayElemAt: [
                        '$score',
                        { $floor: { $divide: ['$count', 2] } },
                      ],
                    },
                    else: {
                      $avg: [
                        {
                          $arrayElemAt: [
                            '$score',
                            {
                              $subtract: [
                                { $round: { $divide: ['$count', 2] } },
                                1,
                              ],
                            },
                          ],
                        },
                        { $arrayElemAt: ['$score', { $divide: ['$count', 2] }] },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      ]);
      expect(result).toEqual(mockRecordData);
    });

    it('should return an empty array if no records are found', async () => {
      scoreModel.aggregate.mockResolvedValue([]);

      const result = await service.getConfidentVectorByUser(userId);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $match: { user_id: userId } },
        { $unwind: '$sessions' },
        { $unwind: '$sessions.confidence_scores' },
        {
          $project: {
            _id: 0,
            user_id: 1,
            token: '$sessions.confidence_scores.token',
            score: '$sessions.confidence_scores.confidence_score',
          },
        },
        {
          $group: {
            _id: {
              user_id: '$user_id',
              token: '$token',
            },
            scores: { $push: '$score' },
          },
        },
        {
          $project: {
            _id: 0,
            user_id: '$_id.user_id',
            token: '$_id.token',
            count: { $size: '$scores' },
            score: {
              $sortArray: {
                input: '$scores',
                sortBy: 1,
              },
            },
          },
        },
        {
          $project: {
            token: 1,
            median: {
              $cond: {
                if: { $eq: ['$count', 0] },
                then: null,
                else: {
                  $cond: {
                    if: { $eq: [{ $mod: ['$count', 2] }, 1] },
                    then: {
                      $arrayElemAt: [
                        '$score',
                        { $floor: { $divide: ['$count', 2] } },
                      ],
                    },
                    else: {
                      $avg: [
                        {
                          $arrayElemAt: [
                            '$score',
                            {
                              $subtract: [
                                { $round: { $divide: ['$count', 2] } },
                                1,
                              ],
                            },
                          ],
                        },
                        { $arrayElemAt: ['$score', { $divide: ['$count', 2] }] },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      ]);
      expect(result).toEqual([]);
    });

    it('should handle errors during data retrieval', async () => {
      scoreModel.aggregate.mockRejectedValue(error);
      try {
        await service.getConfidentVectorByUser(userId);
      } catch (e) {
        expect(scoreModel.aggregate).toHaveBeenCalledWith([
          { $match: { user_id: userId } },
          { $unwind: '$sessions' },
          { $unwind: '$sessions.confidence_scores' },
          {
            $project: {
              _id: 0,
              user_id: 1,
              token: '$sessions.confidence_scores.token',
              score: '$sessions.confidence_scores.confidence_score',
            },
          },
          {
            $group: {
              _id: {
                user_id: '$user_id',
                token: '$token',
              },
              scores: { $push: '$score' },
            },
          },
          {
            $project: {
              _id: 0,
              user_id: '$_id.user_id',
              token: '$_id.token',
              count: { $size: '$scores' },
              score: {
                $sortArray: {
                  input: '$scores',
                  sortBy: 1,
                },
              },
            },
          },
          {
            $project: {
              token: 1,
              median: {
                $cond: {
                  if: { $eq: ['$count', 0] },
                  then: null,
                  else: {
                    $cond: {
                      if: { $eq: [{ $mod: ['$count', 2] }, 1] },
                      then: {
                        $arrayElemAt: [
                          '$score',
                          { $floor: { $divide: ['$count', 2] } },
                        ],
                      },
                      else: {
                        $avg: [
                          {
                            $arrayElemAt: [
                              '$score',
                              {
                                $subtract: [
                                  { $round: { $divide: ['$count', 2] } },
                                  1,
                                ],
                              },
                            ],
                          },
                          { $arrayElemAt: ['$score', { $divide: ['$count', 2] }] },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        ]);
        expect(e).toBe(error);
      }
    });
  })

  // getConfidentVectorBySession
  describe('getConfidentVectorBySession', () => {
    it('should retrieve confident vector by session successfully', async () => {
      const mockRecordData = [
        {
          token: 'a',
          median: 0.85,
        },
        {
          token: 'b',
          median: 0.75,
        },
      ];

      scoreModel.aggregate.mockResolvedValue(mockRecordData);

      const result = await service.getConfidentVectorBySession(sessionId);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $match: { 'sessions.session_id': sessionId } },
        { $unwind: '$sessions' },
        { $unwind: '$sessions.confidence_scores' },
        { $match: { 'sessions.session_id': sessionId } },
        {
          $project: {
            _id: 0,
            user_id: 1,
            token: '$sessions.confidence_scores.token',
            score: '$sessions.confidence_scores.confidence_score',
          },
        },
        {
          $group: {
            _id: {
              user_id: '$user_id',
              token: '$token',
            },
            scores: { $push: '$score' },
          },
        },
        {
          $project: {
            _id: 0,
            user_id: '$_id.user_id',
            token: '$_id.token',
            count: { $size: '$scores' },
            score: {
              $sortArray: {
                input: '$scores',
                sortBy: 1,
              },
            },
          },
        },
        {
          $project: {
            token: 1,
            median: {
              $cond: {
                if: { $eq: ['$count', 0] },
                then: null,
                else: {
                  $cond: {
                    if: { $eq: [{ $mod: ['$count', 2] }, 1] },
                    then: {
                      $arrayElemAt: [
                        '$score',
                        { $floor: { $divide: ['$count', 2] } },
                      ],
                    },
                    else: {
                      $avg: [
                        {
                          $arrayElemAt: [
                            '$score',
                            {
                              $subtract: [
                                { $round: { $divide: ['$count', 2] } },
                                1,
                              ],
                            },
                          ],
                        },
                        { $arrayElemAt: ['$score', { $divide: ['$count', 2] }] },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      ]);
      expect(result).toEqual(mockRecordData);
    });

    it('should return an empty array if no records are found', async () => {
      scoreModel.aggregate.mockResolvedValue([]);

      const result = await service.getConfidentVectorBySession(sessionId);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $match: { 'sessions.session_id': sessionId } },
        { $unwind: '$sessions' },
        { $unwind: '$sessions.confidence_scores' },
        { $match: { 'sessions.session_id': sessionId } },
        {
          $project: {
            _id: 0,
            user_id: 1,
            token: '$sessions.confidence_scores.token',
            score: '$sessions.confidence_scores.confidence_score',
          },
        },
        {
          $group: {
            _id: {
              user_id: '$user_id',
              token: '$token',
            },
            scores: { $push: '$score' },
          },
        },
        {
          $project: {
            _id: 0,
            user_id: '$_id.user_id',
            token: '$_id.token',
            count: { $size: '$scores' },
            score: {
              $sortArray: {
                input: '$scores',
                sortBy: 1,
              },
            },
          },
        },
        {
          $project: {
            token: 1,
            median: {
              $cond: {
                if: { $eq: ['$count', 0] },
                then: null,
                else: {
                  $cond: {
                    if: { $eq: [{ $mod: ['$count', 2] }, 1] },
                    then: {
                      $arrayElemAt: [
                        '$score',
                        { $floor: { $divide: ['$count', 2] } },
                      ],
                    },
                    else: {
                      $avg: [
                        {
                          $arrayElemAt: [
                            '$score',
                            {
                              $subtract: [
                                { $round: { $divide: ['$count', 2] } },
                                1,
                              ],
                            },
                          ],
                        },
                        { $arrayElemAt: ['$score', { $divide: ['$count', 2] }] },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      ]);
      expect(result).toEqual([]);
    });

    it('should handle errors during data retrieval', async () => {
      scoreModel.aggregate.mockRejectedValue(error);
      try {
        await service.getConfidentVectorBySession(sessionId);
      } catch (e) {
        expect(scoreModel.aggregate).toHaveBeenCalledWith([
          { $match: { 'sessions.session_id': sessionId } },
          { $unwind: '$sessions' },
          { $unwind: '$sessions.confidence_scores' },
          { $match: { 'sessions.session_id': sessionId } },
          {
            $project: {
              _id: 0,
              user_id: 1,
              token: '$sessions.confidence_scores.token',
              score: '$sessions.confidence_scores.confidence_score',
            },
          },
          {
            $group: {
              _id: {
                user_id: '$user_id',
                token: '$token',
              },
              scores: { $push: '$score' },
            },
          },
          {
            $project: {
              _id: 0,
              user_id: '$_id.user_id',
              token: '$_id.token',
              count: { $size: '$scores' },
              score: {
                $sortArray: {
                  input: '$scores',
                  sortBy: 1,
                },
              },
            },
          },
          {
            $project: {
              token: 1,
              median: {
                $cond: {
                  if: { $eq: ['$count', 0] },
                  then: null,
                  else: {
                    $cond: {
                      if: { $eq: [{ $mod: ['$count', 2] }, 1] },
                      then: {
                        $arrayElemAt: [
                          '$score',
                          { $floor: { $divide: ['$count', 2] } },
                        ],
                      },
                      else: {
                        $avg: [
                          {
                            $arrayElemAt: [
                              '$score',
                              {
                                $subtract: [
                                  { $round: { $divide: ['$count', 2] } },
                                  1,
                                ],
                              },
                            ],
                          },
                          { $arrayElemAt: ['$score', { $divide: ['$count', 2] }] },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        ]);
        expect(e).toBe(error);
      }
    });
  })

  // getMissingChars
  describe('getMissingChars', () => {
    it('should retrieve missing characters successfully', async () => {
      const mockRecordData = [
        { token: 'a' },
        { token: 'b' },
        { token: 'c' },
      ];
      mockHexcodeMappingModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockRecordData),
      });

      const result = await service.getMissingChars(language);
      expect(mockHexcodeMappingModel.find).toHaveBeenCalledWith(
        { language: language },
        { token: 1, _id: 0 }
      );
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should return an empty array if no records are found', async () => {
      mockHexcodeMappingModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });
      const result = await service.getMissingChars(language);
      expect(mockHexcodeMappingModel.find).toHaveBeenCalledWith(
        { language: language },
        { token: 1, _id: 0 }
      );
      expect(result).toEqual([]);
    });

    it('should handle errors during data retrieval', async () => {
      mockHexcodeMappingModel.find.mockReturnValue({
        exec: jest.fn().mockRejectedValue(error),
      });

      try {
        await service.getMissingChars(language);
      } catch (e) {
        expect(mockHexcodeMappingModel.find).toHaveBeenCalledWith(
          { language: language },
          { token: 1, _id: 0 }
        );
        expect(e).toBe(error);
      }
    });
  })

  // assessmentInputCreate
  describe('assessmentInputCreate', () => {
    it('should update or insert assessment input data successfully', async () => {
      const mockAssessmentInputData = {
        user_id: 'user1',
        session_id: 'session1',
        token: 'token1',
        feedback: 'Great job!',
      };
      const mockResponse = { n: 1, nModified: 1, upserted: [] };
      mockAssessmentInputModel.updateMany.mockResolvedValue(mockResponse);

      const result = await service.assessmentInputCreate(mockAssessmentInputData);
      expect(mockAssessmentInputModel.updateMany).toHaveBeenCalledWith(
        {
          user_id: mockAssessmentInputData.user_id,
          session_id: mockAssessmentInputData.session_id,
          token: mockAssessmentInputData.token,
        },
        { $set: { feedback: mockAssessmentInputData.feedback } },
        { new: true, upsert: true }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle errors during data update/insert', async () => {
      const mockAssessmentInputData = {
        user_id: 'user1',
        session_id: 'session1',
        token: 'token1',
        feedback: 'Great job!',
      };

      const error = new Error('Something went wrong');
      mockAssessmentInputModel.updateMany.mockRejectedValue(error);

      try {
        await service.assessmentInputCreate(mockAssessmentInputData);
      } catch (e) {
        expect(mockAssessmentInputModel.updateMany).toHaveBeenCalledWith(
          {
            user_id: mockAssessmentInputData.user_id,
            session_id: mockAssessmentInputData.session_id,
            token: mockAssessmentInputData.token,
          },
          { $set: { feedback: mockAssessmentInputData.feedback } },
          { new: true, upsert: true }
        );
        expect(e).toBe(error);
      }
    });
  })

  // getAssessmentRecords
  describe('getAssessmentRecords', () => {
    it('should retrieve assessment records successfully', async () => {
      const mockAssessmentRecords = [
        {
          session_id: 'session1',
          token: 'token1',
          feedback: 0,
        },
      ];

      mockAssessmentInputModel.aggregate.mockResolvedValue(mockAssessmentRecords);

      const result = await service.getAssessmentRecords(sessionId);
      expect(mockAssessmentInputModel.aggregate).toHaveBeenCalledWith([
        { $match: { session_id: sessionId } },
        {
          $group: {
            _id: {
              session_id: sessionId,
              token: '$token',
            },
            feedback: { $max: '$feedback' },
          },
        },
        { $match: { feedback: 0 } },
        {
          $project: {
            _id: 0,
            session_id: '$_id.session_id',
            token: '$_id.token',
            feedback: 1,
          },
        },
      ]);
      expect(result).toEqual(mockAssessmentRecords);
    });

    it('should return an empty array if no records are found', async () => {
      mockAssessmentInputModel.aggregate.mockResolvedValue([]);

      const result = await service.getAssessmentRecords(sessionId);
      expect(mockAssessmentInputModel.aggregate).toHaveBeenCalledWith([
        { $match: { session_id: sessionId } },
        {
          $group: {
            _id: {
              session_id: sessionId,
              token: '$token',
            },
            feedback: { $max: '$feedback' },
          },
        },
        { $match: { feedback: 0 } },
        {
          $project: {
            _id: 0,
            session_id: '$_id.session_id',
            token: '$_id.token',
            feedback: 1,
          },
        },
      ]);
      expect(result).toEqual([]);
    });

    it('should handle errors during data retrieval', async () => {
      mockAssessmentInputModel.aggregate.mockRejectedValue(error);
      try {
        await service.getAssessmentRecords(sessionId);
      } catch (e) {
        expect(mockAssessmentInputModel.aggregate).toHaveBeenCalledWith([
          { $match: { session_id: sessionId } },
          {
            $group: {
              _id: {
                session_id: sessionId,
                token: '$token',
              },
              feedback: { $max: '$feedback' },
            },
          },
          { $match: { feedback: 0 } },
          {
            $project: {
              _id: 0,
              session_id: '$_id.session_id',
              token: '$_id.token',
              feedback: 1,
            },
          },
        ]);
        expect(e).toBe(error);
      }
    });
  })

  // getAssessmentRecordsUserid
  describe('getAssessmentRecordsUserid', () => {
    it('should retrieve assessment records by user ID successfully', async () => {
      const mockAssessmentRecords = [
        {
          user_id: 'user1',
          token: 'token1',
          feedback: 0,
        },
      ];

      mockAssessmentInputModel.aggregate.mockResolvedValue(mockAssessmentRecords);

      const result = await service.getAssessmentRecordsUserid(userId);
      expect(mockAssessmentInputModel.aggregate).toHaveBeenCalledWith([
        { $match: { user_id: userId } },
        {
          $group: {
            _id: {
              user_id: userId,
              token: '$token',
            },
            feedback: { $max: '$feedback' },
          },
        },
        { $match: { feedback: 0 } },
        {
          $project: {
            _id: 0,
            user_id: '$_id.user_id',
            token: '$_id.token',
            feedback: 1,
          },
        },
      ]);
      expect(result).toEqual(mockAssessmentRecords);
    });

    it('should return an empty array if no records are found', async () => {
      mockAssessmentInputModel.aggregate.mockResolvedValue([]);

      const result = await service.getAssessmentRecordsUserid(userId);
      expect(mockAssessmentInputModel.aggregate).toHaveBeenCalledWith([
        { $match: { user_id: userId } },
        {
          $group: {
            _id: {
              user_id: userId,
              token: '$token',
            },
            feedback: { $max: '$feedback' },
          },
        },
        { $match: { feedback: 0 } },
        {
          $project: {
            _id: 0,
            user_id: '$_id.user_id',
            token: '$_id.token',
            feedback: 1,
          },
        },
      ]);
      expect(result).toEqual([]);
    });

    it('should handle errors during data retrieval', async () => {
      const error = new Error('Something went wrong');
      mockAssessmentInputModel.aggregate.mockRejectedValue(error);

      try {
        await service.getAssessmentRecordsUserid(userId);
      } catch (e) {
        expect(mockAssessmentInputModel.aggregate).toHaveBeenCalledWith([
          { $match: { user_id: userId } },
          {
            $group: {
              _id: {
                user_id: userId,
                token: '$token',
              },
              feedback: { $max: '$feedback' },
            },
          },
          { $match: { feedback: 0 } },
          {
            $project: {
              _id: 0,
              user_id: '$_id.user_id',
              token: '$_id.token',
              feedback: 1,
            },
          },
        ]);
        expect(e).toBe(error);
      }
    });
  })

  // getAllSessions
  describe('getAllSessions', () => {
    it('should retrieve all sessions successfully', async () => {
      const mockRecordData = [
        { session_id: 'session1', totalrecords: 5 },
        { session_id: 'session2', totalrecords: 10 },
      ];

      scoreModel.aggregate.mockResolvedValue(mockRecordData);

      const limit = 2;
      const calculateMilestone = false;

      const result = await service.getAllSessions(userId, limit, calculateMilestone);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $match: { user_id: userId } },
        { $unwind: '$sessions' },
        {
          $project: {
            _id: 0,
            user_id: 1,
            date: '$sessions.createdAt',
            session_id: '$sessions.session_id',
          },
        },
        {
          $group: {
            _id: '$session_id',
            user_id: { $first: '$user_id' },
            date: { $first: '$date' },
            totalrecords: { $count: {} },
          },
        },
        { $sort: { _id: -1 } },
        {
          $project: {
            _id: 0,
            session_id: '$_id',
            totalrecords: '$totalrecords',
          },
        },
        { $limit: limit },
      ]);
      expect(result).toEqual(['session1', 'session2']);
    });

    it('should return an empty array if no records are found', async () => {
      scoreModel.aggregate.mockResolvedValue([]);

      const limit = 2;
      const calculateMilestone = false;

      const result = await service.getAllSessions(userId, limit, calculateMilestone);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $match: { user_id: userId } },
        { $unwind: '$sessions' },
        {
          $project: {
            _id: 0,
            user_id: 1,
            date: '$sessions.createdAt',
            session_id: '$sessions.session_id',
          },
        },
        {
          $group: {
            _id: '$session_id',
            user_id: { $first: '$user_id' },
            date: { $first: '$date' },
            totalrecords: { $count: {} },
          },
        },
        { $sort: { _id: -1 } },
        {
          $project: {
            _id: 0,
            session_id: '$_id',
            totalrecords: '$totalrecords',
          },
        },
        { $limit: limit },
      ]);
      expect(result).toEqual([]);
    });

    it('should handle errors during data retrieval', async () => {
      const error = new Error('Something went wrong');
      scoreModel.aggregate.mockRejectedValue(error);

      const limit = 2;
      const calculateMilestone = false;

      try {
        await service.getAllSessions(userId, limit, calculateMilestone);
      } catch (e) {
        expect(scoreModel.aggregate).toHaveBeenCalledWith([
          { $match: { user_id: userId } },
          { $unwind: '$sessions' },
          {
            $project: {
              _id: 0,
              user_id: 1,
              date: '$sessions.createdAt',
              session_id: '$sessions.session_id',
            },
          },
          {
            $group: {
              _id: '$session_id',
              user_id: { $first: '$user_id' },
              date: { $first: '$date' },
              totalrecords: { $count: {} },
            },
          },
          { $sort: { _id: -1 } },
          {
            $project: {
              _id: 0,
              session_id: '$_id',
              totalrecords: '$totalrecords',
            },
          },
          { $limit: limit },
        ]);
        expect(e).toBe(error);
      }
    });

    it('should filter sessions correctly based on calculateMilestone', async () => {
      const mockRecordData = [
        { session_id: 'session1', totalrecords: 2 },
        { session_id: 'session2', totalrecords: 3 },
      ];

      scoreModel.aggregate.mockResolvedValue(mockRecordData);
      const limit = 2;
      const calculateMilestone = true;

      const result = await service.getAllSessions(userId, limit, calculateMilestone);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $match: { user_id: userId } },
        { $unwind: '$sessions' },
        {
          $project: {
            _id: 0,
            user_id: 1,
            date: '$sessions.createdAt',
            session_id: '$sessions.session_id',
          },
        },
        {
          $group: {
            _id: '$session_id',
            user_id: { $first: '$user_id' },
            date: { $first: '$date' },
            totalrecords: { $count: {} },
          },
        },
        { $sort: { _id: -1 } },
        {
          $project: {
            _id: 0,
            session_id: '$_id',
            totalrecords: '$totalrecords',
          },
        },
        { $limit: limit },
      ]);
      expect(result).toEqual(['session2']);
    });
  })

  //  getSubessionIds
  describe('getSubessionIds', () => {
    it('should retrieve sub-session IDs successfully', async () => {
      const mockRecordData = [
        { sub_session_id: 'subSession1', createdAt: new Date('2024-07-01T11:07:24.711Z') },
        { sub_session_id: 'subSession2', createdAt: new Date('2024-07-01T12:07:24.711Z') },
      ];
      scoreModel.aggregate.mockResolvedValue(mockRecordData);

      const result = await service.getSubessionIds(userId);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $match: { user_id: userId } },
        { $unwind: '$sessions' },
        {
          $project: {
            _id: 0,
            sub_session_ids: '$sessions.sub_session_id',
            createdAt: '$sessions.createdAt',
          },
        },
        {
          $group: {
            _id: {
              sub_session_id: '$sub_session_ids',
            },
            createdAt: { $max: '$createdAt' },
          },
        },
        {
          $project: {
            _id: 0,
            sub_session_id: '$_id.sub_session_id',
            createdAt: '$createdAt',
          },
        },
      ]);
      expect(result).toEqual(mockRecordData);
    });

    it('should return an empty array if no records are found', async () => {
      scoreModel.aggregate.mockResolvedValue([]);

      const result = await service.getSubessionIds(userId);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $match: { user_id: userId } },
        { $unwind: '$sessions' },
        {
          $project: {
            _id: 0,
            sub_session_ids: '$sessions.sub_session_id',
            createdAt: '$sessions.createdAt',
          },
        },
        {
          $group: {
            _id: {
              sub_session_id: '$sub_session_ids',
            },
            createdAt: { $max: '$createdAt' },
          },
        },
        {
          $project: {
            _id: 0,
            sub_session_id: '$_id.sub_session_id',
            createdAt: '$createdAt',
          },
        },
      ]);
      expect(result).toEqual([]);
    });

    it('should handle errors during data retrieval', async () => {
      scoreModel.aggregate.mockRejectedValue(error);
      try {
        await service.getSubessionIds(userId);
      } catch (e) {
        expect(scoreModel.aggregate).toHaveBeenCalledWith([
          { $match: { user_id: userId } },
          { $unwind: '$sessions' },
          {
            $project: {
              _id: 0,
              sub_session_ids: '$sessions.sub_session_id',
              createdAt: '$sessions.createdAt',
            },
          },
          {
            $group: {
              _id: {
                sub_session_id: '$sub_session_ids',
              },
              createdAt: { $max: '$createdAt' },
            },
          },
          {
            $project: {
              _id: 0,
              sub_session_id: '$_id.sub_session_id',
              createdAt: '$createdAt',
            },
          },
        ]);
        expect(e).toBe(error);
      }
    });
  })

  // getTextSimilarity
  describe('getTextSimilarity', () => {
    it('should retrieve sub-session IDs successfully', async () => {
      const mockRecordData = [
        { sub_session_id: 'subSession1', createdAt: new Date('2024-07-01T11:07:24.711Z') },
        { sub_session_id: 'subSession2', createdAt: new Date('2024-07-01T12:07:24.711Z') },
      ];
      scoreModel.aggregate.mockResolvedValue(mockRecordData);

      const result = await service.getSubessionIds(userId);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $match: { user_id: userId } },
        { $unwind: '$sessions' },
        {
          $project: {
            _id: 0,
            sub_session_ids: '$sessions.sub_session_id',
            createdAt: '$sessions.createdAt',
          },
        },
        {
          $group: {
            _id: {
              sub_session_id: '$sub_session_ids',
            },
            createdAt: { $max: '$createdAt' },
          },
        },
        {
          $project: {
            _id: 0,
            sub_session_id: '$_id.sub_session_id',
            createdAt: '$createdAt',
          },
        },
      ]);
      expect(result).toEqual(mockRecordData);
    });

    it('should return an empty array if no records are found', async () => {
      scoreModel.aggregate.mockResolvedValue([]);
      const result = await service.getSubessionIds(userId);
      expect(scoreModel.aggregate).toHaveBeenCalledWith([
        { $match: { user_id: userId } },
        { $unwind: '$sessions' },
        {
          $project: {
            _id: 0,
            sub_session_ids: '$sessions.sub_session_id',
            createdAt: '$sessions.createdAt',
          },
        },
        {
          $group: {
            _id: {
              sub_session_id: '$sub_session_ids',
            },
            createdAt: { $max: '$createdAt' },
          },
        },
        {
          $project: {
            _id: 0,
            sub_session_id: '$_id.sub_session_id',
            createdAt: '$createdAt',
          },
        },
      ]);
      expect(result).toEqual([]);
    });

    it('should handle errors during data retrieval', async () => {
      const error = new Error('Something went wrong');
      scoreModel.aggregate.mockRejectedValue(error);
      try {
        await service.getSubessionIds(userId);
      } catch (e) {
        expect(scoreModel.aggregate).toHaveBeenCalledWith([
          { $match: { user_id: userId } },
          { $unwind: '$sessions' },
          {
            $project: {
              _id: 0,
              sub_session_ids: '$sessions.sub_session_id',
              createdAt: '$sessions.createdAt',
            },
          },
          {
            $group: {
              _id: {
                sub_session_id: '$sub_session_ids',
              },
              createdAt: { $max: '$createdAt' },
            },
          },
          {
            $project: {
              _id: 0,
              sub_session_id: '$_id.sub_session_id',
              createdAt: '$createdAt',
            },
          },
        ]);
        expect(e).toBe(error);
      }
    });
  })

  // getSyllablesFromString
  describe('getSyllablesFromString', () => {
    const language = 'ta';

    it('should return syllables for typical input in Tamil language', async () => {
      const text = 'அம்மா';
      const vowelSignArr = ['ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை', 'ொ', 'ோ', 'ௌ'];

      const result = await service.getSyllablesFromString(text, vowelSignArr, language);
      expect(result).toEqual(["அ", "ம", "்", "ம", "மா"]);
    });

    it('should return an empty array for empty text', async () => {
      const text = '';
      const vowelSignArr = ['ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை', 'ொ', 'ோ', 'ௌ'];

      const result = await service.getSyllablesFromString(text, vowelSignArr, language);
      expect(result).toEqual([]);
    });

    it('should handle text with spaces correctly', async () => {
      const text = 'அம்மா அம்மா';
      const vowelSignArr = ['ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை', 'ொ', 'ோ', 'ௌ'];

      const result = await service.getSyllablesFromString(text, vowelSignArr, language);
      expect(result).toEqual(["அ", "ம", "்", "ம", "மா", "அ", "ம", "்", "ம", "மா"]);
    });

    it('should handle consecutive vowel signs correctly', async () => {
      const text = 'அம்மாய்';
      const vowelSignArr = ['ா', 'ி'];

      const result = await service.getSyllablesFromString(text, vowelSignArr, language);
      expect(result).toEqual(['அ', "ம", "்", "ம", "மா", "ய", "்"]);
    });

    it('should handle text without vowel signs correctly', async () => {
      const text = 'தமிழ்';
      const vowelSignArr = ['ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை', 'ொ', 'ோ', 'ௌ'];

      const result = await service.getSyllablesFromString(text, vowelSignArr, language);
      expect(result).toEqual(['த', 'ம', "மி", "ழ", "்"]);
    });
  })

  // identifyTokens
  describe('identifyTokens', () => {
    it('should identify tokens correctly', async () => {
      const bestTokens = [
        {
          tokens: [{ 'அ': 0.8 }, { 'க்': 0.9 }, { 'க': 0.95 }, { 'ி': 0.6 }, { 'க்': 0.85 }]
        }
      ];
      const correctTokens = ['அ', 'க்', 'க'];
      const missingTokens = ['ம', 'ந'];
      const tokenHexcodeDataArr = [{ token: 'அ', hexcode: 'hex1' }, { token: 'க்', hexcode: 'hex2' }, { token: 'க', hexcode: 'hex3' }, { token: 'ம', hexcode: 'hex4' }, { token: 'ந', hexcode: 'hex5' }];
      const vowelSignArr = ['ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை', 'ொ', 'ோ', 'ௌ'];

      // Mock getTokenHexcode
      jest.spyOn(service, 'getTokenHexcode').mockImplementation(async (arr, token) => {
        const found = arr.find(item => item.token === token);
        return found ? found.hexcode : '';
      });

      const result = await service.identifyTokens(bestTokens, correctTokens, missingTokens, tokenHexcodeDataArr, vowelSignArr);

      expect(service.getTokenHexcode).toHaveBeenCalledTimes(4);
      expect(result.confidence_scoresArr).toEqual([
        { token: 'அ', hexcode: 'hex1', confidence_score: 0.8, identification_status: -1 },
        { token: 'க', hexcode: 'hex3', confidence_score: 0.95, identification_status: 1 },
      ]);
      expect(result.missing_token_scoresArr).toEqual([
        { token: 'ம', hexcode: 'hex4', confidence_score: 0.1, identification_status: 0 },
        { token: 'ந', hexcode: 'hex5', confidence_score: 0.1, identification_status: 0 },
      ]);
      expect(result.anomaly_scoreArr).toEqual([]);
    });

    it('should handle missing hexcode correctly', async () => {
      const bestTokens = [
        {
          tokens: [{ 'அ': 0.8 }, { 'க்': 0.9 }, { 'க': 0.95 }, { 'ி': 0.6 }, { 'க்': 0.85 }]
        }
      ];
      const correctTokens = ['அ', 'க்', 'க'];
      const missingTokens = ['ம', 'ந'];
      const tokenHexcodeDataArr = [{ token: 'அ', hexcode: 'hex1' }, { token: 'க்', hexcode: 'hex2' }, { token: 'க', hexcode: 'hex3' }];
      const vowelSignArr = ['ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை', 'ொ', 'ோ', 'ௌ'];

      // Mock getTokenHexcode
      jest.spyOn(service, 'getTokenHexcode').mockImplementation(async (arr, token) => {
        const found = arr.find(item => item.token === token);
        return found ? found.hexcode : '';
      });

      const result = await service.identifyTokens(bestTokens, correctTokens, missingTokens, tokenHexcodeDataArr, vowelSignArr);

      expect(service.getTokenHexcode).toHaveBeenCalledTimes(4);
      expect(result.confidence_scoresArr).toEqual([
        { token: 'அ', hexcode: 'hex1', confidence_score: 0.8, identification_status: -1 },
        { token: 'க', hexcode: 'hex3', confidence_score: 0.95, identification_status: 1 },
      ]);
      expect(result.missing_token_scoresArr).toEqual([]);
      expect(result.anomaly_scoreArr).toEqual([
        { token: 'ம', hexcode: '', confidence_score: 0.1, identification_status: 0 },
        { token: 'ந', hexcode: '', confidence_score: 0.1, identification_status: 0 },
      ]);
    });

    it('should handle empty bestTokens', async () => {
      const bestTokens = [];
      const correctTokens = ['அ', 'க்', 'க'];
      const missingTokens = ['ம', 'ந'];
      const tokenHexcodeDataArr = [{ token: 'அ', hexcode: 'hex1' }, { token: 'க்', hexcode: 'hex2' }, { token: 'க', hexcode: 'hex3' }, { token: 'ம', hexcode: 'hex4' }, { token: 'ந', hexcode: 'hex5' }];
      const vowelSignArr = ['ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை', 'ொ', 'ோ', 'ௌ'];

      // Mock getTokenHexcode
      jest.spyOn(service, 'getTokenHexcode').mockImplementation(async (arr, token) => {
        const found = arr.find(item => item.token === token);
        return found ? found.hexcode : '';
      });

      const result = await service.identifyTokens(bestTokens, correctTokens, missingTokens, tokenHexcodeDataArr, vowelSignArr);

      expect(service.getTokenHexcode).toHaveBeenCalledTimes(2);
      expect(result.confidence_scoresArr).toEqual([]);
      expect(result.missing_token_scoresArr).toEqual([
        { token: 'ம', hexcode: 'hex4', confidence_score: 0.1, identification_status: 0 },
        { token: 'ந', hexcode: 'hex5', confidence_score: 0.1, identification_status: 0 },
      ]);
      expect(result.anomaly_scoreArr).toEqual([]);
    });

    it('should handle empty correctTokens and missingTokens', async () => {
      const bestTokens = [
        {
          tokens: [{ 'அ': 0.8 }, { 'க்': 0.9 }, { 'க': 0.95 }, { 'ி': 0.6 }, { 'க்': 0.85 }]
        }
      ];
      const correctTokens = [];
      const missingTokens = [];
      const tokenHexcodeDataArr = [{ token: 'அ', hexcode: 'hex1' }, { token: 'க்', hexcode: 'hex2' }, { token: 'க', hexcode: 'hex3' }];
      const vowelSignArr = ['ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை', 'ொ', 'ோ', 'ௌ'];

      // Mock getTokenHexcode
      jest.spyOn(service, 'getTokenHexcode').mockImplementation(async (arr, token) => {
        const found = arr.find(item => item.token === token);
        return found ? found.hexcode : '';
      });

      const result = await service.identifyTokens(bestTokens, correctTokens, missingTokens, tokenHexcodeDataArr, vowelSignArr);

      expect(service.getTokenHexcode).not.toHaveBeenCalled();
      expect(result.confidence_scoresArr).toEqual([]);
      expect(result.missing_token_scoresArr).toEqual([]);
      expect(result.anomaly_scoreArr).toEqual([]);
    });

    it('should handle missing tokens in vowelSignArr', async () => {
      const bestTokens = [
        {
          tokens: [{ 'அ': 0.8 }, { 'க்': 0.9 }, { 'க': 0.95 }, { 'ி': 0.6 }, { 'க்': 0.85 }]
        }
      ];
      const correctTokens = ['அ', 'க்', 'க'];
      const missingTokens = ['ா'];
      const tokenHexcodeDataArr = [{ token: 'அ', hexcode: 'hex1' }, { token: 'க்', hexcode: 'hex2' }, { token: 'க', hexcode: 'hex3' }];
      const vowelSignArr = ['ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை', 'ொ', 'ோ', 'ௌ'];

      // Mock getTokenHexcode
      jest.spyOn(service, 'getTokenHexcode').mockImplementation(async (arr, token) => {
        const found = arr.find(item => item.token === token);
        return found ? found.hexcode : '';
      });

      const result = await service.identifyTokens(bestTokens, correctTokens, missingTokens, tokenHexcodeDataArr, vowelSignArr);

      expect(service.getTokenHexcode).toHaveBeenCalledTimes(3);
      expect(result.confidence_scoresArr).toEqual([
        { token: 'அ', hexcode: 'hex1', confidence_score: 0.8, identification_status: -1 },
        { token: 'க', hexcode: 'hex3', confidence_score: 0.95, identification_status: 1 },
      ]);
      expect(result.missing_token_scoresArr).toEqual([]);
      expect(result.anomaly_scoreArr).toEqual([
        { confidence_score: 0.1, hexcode: "", identification_status: 0, token: "ா", },
      ]);
    });

    //     {
    //       tokens: [{ 'அ': 0.8 }, { 'க்': 0.9 }, { 'க': 0.95 }, { 'ி': 0.6 }, { 'க்': 0.85 }]
    //     }
    //   ];
    //   const correctTokens = [];
    //   const missingTokens = [];
    //   const tokenHexcodeDataArr = [{ token: 'அ', hexcode: 'hex1' }, { token: 'க்', hexcode: 'hex2' }, { token: 'க', hexcode: 'hex3' }];
    //   const vowelSignArr = ['ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை', 'ொ', 'ோ', 'ௌ'];

    //   // Mock getTokenHexcode
    //   jest.spyOn(service, 'getTokenHexcode').mockImplementation(async (arr, token) => {
    //     const found = arr.find(item => item.token === token);
    //     return found ? found.hexcode : '';
    //   });

    //   const result = await service.identifyTokens(bestTokens, correctTokens, missingTokens, tokenHexcodeDataArr, vowelSignArr);

    //   expect(service.getTokenHexcode).not.toHaveBeenCalled();
    //   expect(result.confidence_scoresArr).toEqual([]);
    //   expect(result.missing_token_scoresArr).toEqual([]);
    //   expect(result.anomaly_scoreArr).toEqual([]);
    // });

    // it('should handle missing tokens in vowelSignArr', async () => {
    //   const bestTokens = [
    //     {
    //       tokens: [{ 'அ': 0.8 }, { 'க்': 0.9 }, { 'க': 0.95 }, { 'ி': 0.6 }, { 'க்': 0.85 }]
    //     }
    //   ];
    //   const correctTokens = ['அ', 'க்', 'க'];
    //   const missingTokens = ['ா'];
    //   const tokenHexcodeDataArr = [{ token: 'அ', hexcode: 'hex1' }, { token: 'க்', hexcode: 'hex2' }, { token: 'க', hexcode: 'hex3' }];
    //   const vowelSignArr = ['ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை', 'ொ', 'ோ', 'ௌ'];

    //   // Mock getTokenHexcode
    //   jest.spyOn(service, 'getTokenHexcode').mockImplementation(async (arr, token) => {
    //     const found = arr.find(item => item.token === token);
    //     return found ? found.hexcode : '';
    //   });

    //   const result = await service.identifyTokens(bestTokens, correctTokens, missingTokens, tokenHexcodeDataArr, vowelSignArr);

    //   expect(service.getTokenHexcode).toHaveBeenCalledTimes(3);
    //   expect(result.confidence_scoresArr).toEqual([
    //     { token: 'அ', hexcode: 'hex1', confidence_score: 0.8, identification_status: -1 },
    //     { token: 'க', hexcode: 'hex3', confidence_score: 0.95, identification_status: 1 },
    //   ]);
    //   expect(result.missing_token_scoresArr).toEqual([]);
    //   expect(result.anomaly_scoreArr).toEqual([]);
    // });
  })

  // audioFileToAsrOutput
  describe('audioFileToAsrOutput', () => {
    it('should set correct serviceId based on language', async () => {
      const testCases = [
        { language: 'kn', expectedServiceId: 'ai4bharat/conformer-multilingual-dravidian--gpu-t4' },
        { language: 'ta', expectedServiceId: 'ai4bharat/conformer-multilingual-dravidian--gpu-t4' },
        { language: 'en', expectedServiceId: 'ai4bharat/whisper--gpu-t4' },
        { language: 'hi', expectedServiceId: 'ai4bharat/conformer-hi--gpu-t4' },
        { language: 'te', expectedServiceId: 'ai4bharat/conformer-multilingual-dravidian--gpu-t4' },
        { language: 'other', expectedServiceId: 'ai4bharat/conformer-other-gpu--t4' }
      ];

      for (const testCase of testCases) {
        const asrCallMock = jest.fn().mockResolvedValue('mockedAsrOutput');
        const data = 'base64AudioData';
        const contentType = 'word';

        // Mock the axios request
        axios.request.mockResolvedValue({ data: { denoised_audio_base64: 'denoisedBase64Audio', pause_count: 5 } });

        const result = await service.audioFileToAsrOutput.call(
          { asrCall: asrCallMock },
          data,
          testCase.language,
          contentType
        );

        if (process.env.skipNonDenoiserAsrCall !== 'true') {
          //expect(asrCallMock).toHaveBeenCalled();
        } else {
          expect(asrCallMock).not.toHaveBeenCalled();
        }

        // Directly check the internal variable
        expect(result.asrOutBeforeDenoised).toEqual({ "denoised_audio_base64": "denoisedBase64Audio", pause_count: 5 });
      }
    });

    it('should not call asrCall if skipNonDenoiserAsrCall is "true"', async () => {
      process.env.skipNonDenoiserAsrCall = 'true';
      const asrCallMock = jest.fn();
      const data = 'base64AudioData';
      const language = 'en';
      const contentType = 'word';

      // Mock the axios request
      axios.request.mockResolvedValue({ data: { denoised_audio_base64: 'denoisedBase64Audio', pause_count: 5 } });

      const result = await service.audioFileToAsrOutput.call(
        { asrCall: asrCallMock },
        data,
        language,
        contentType
      );

      expect(asrCallMock).not.toHaveBeenCalled();
      expect(result.asrOutBeforeDenoised).toBeUndefined();
    });
  })

  // getConstructedText
  describe('getConstructedText', () => {
    it('should return constructed text and repetition count for typical input', async () => {
      const original_text = 'This is a test sentence';
      const response_text = 'This is a simple test';
      const similarityScores = {
        'ThisThis': 1.0,
        'Thisis': 0.5,
        'isa': 0.4,
        'isThis': 0.5,
        'atest': 0.6,
        'asimple': 0.4,
        'testtest': 1.0,
        'testsimple': 0.4,
      };

      getTextSimilarityMock.mockImplementation(async (originalEle, sourceEle) => {
        const key = originalEle + sourceEle;
        return similarityScores[key] || 0.0;
      });

      const result = await service.getConstructedText(original_text, response_text);
      expect(result).toEqual({
        constructText: 'This test',
        reptitionCount: 0,
      });

      expect(getTextSimilarityMock).toHaveBeenCalledTimes(25);
    });

    it('should return empty constructed text and zero repetition count for no matches', async () => {
      const original_text = 'abcd';
      const response_text = 'efgh';
      getTextSimilarityMock.mockResolvedValue(0.0);

      const result = await service.getConstructedText(original_text, response_text);
      expect(result).toEqual({
        constructText: '',
        reptitionCount: 0,
      });

      expect(getTextSimilarityMock).toHaveBeenCalledTimes(1);
    });

    it('should handle case with all elements repeated', async () => {
      const original_text = 'hello world hello';
      const response_text = 'hello hello world';
      const similarityScores = {
        'hellohello': 1.0,
        'helloworld': 0.5,
        'worldhello': 0.4,
        'worldworld': 1.0,
      };

      getTextSimilarityMock.mockImplementation(async (originalEle, sourceEle) => {
        const key = originalEle + sourceEle;
        return similarityScores[key] || 0.0;
      });

      const result = await service.getConstructedText(original_text, response_text);
      expect(result).toEqual({
        constructText: 'hello world',
        reptitionCount: 2,
      });
      expect(getTextSimilarityMock).toHaveBeenCalledTimes(9);
    });

    it('should handle case with mixed similarities', async () => {
      const original_text = 'quick brown fox';
      const response_text = 'quick fox jumps';
      const similarityScores = {
        'quickquick': 1.0,
        'quickfox': 0.4,
        'brownfox': 0.5,
        'foxfox': 1.0,
        'foxjumps': 0.4,
      };

      getTextSimilarityMock.mockImplementation(async (originalEle, sourceEle) => {
        const key = originalEle + sourceEle;
        return similarityScores[key] || 0.0;
      });

      const result = await service.getConstructedText(original_text, response_text);
      expect(result).toEqual({
        constructText: 'quick fox',
        reptitionCount: 0,
      });
      expect(getTextSimilarityMock).toHaveBeenCalledTimes(9);
    });
  })

  // addDenoisedOutputLog
  describe('addDenoisedOutputLog', () => {
    it('should add denoised output log successfully', async () => {
      const mockDenoisedOutputLog = {
        user_id: 'user1',
        session_id: 'session1',
        denoised_output: 'denoised data',
        timestamp: new Date('2024-07-03T05:43:57.387Z'),
      };

      const result = await service.addDenoisedOutputLog(mockDenoisedOutputLog);

      // Check that the constructor was called correctly
      expect(mockDenoiserOutputLogsModel).toHaveBeenCalledWith(mockDenoisedOutputLog);

      // Verify the result
      expect(result).toEqual({
        user_id: 'user1',
        session_id: 'session1',
        denoised_output: 'denoised data',
        timestamp: new Date('2024-07-03T05:43:57.387Z'),
        _id: 'mockId',
      });
    });
  })

  // create
  describe('create', () => {
    it('should create a new score and update record if no existing record found', async () => {
      const createScoreDto = {
        user_id: 'user1',
        sessions_id: 'session-id',
      };

      const mockCreatedScore = {
        save: jest.fn().mockResolvedValue(createScoreDto),
      };

      mockScoreModel.find.mockResolvedValue([]);
      mockScoreModel.updateOne.mockResolvedValue({ nModified: 1 });
      mockScoreModel.mockImplementation(() => mockCreatedScore);

      const result = await service.create(createScoreDto);
      expect(mockScoreModel.find).toHaveBeenCalledWith({ user_id: createScoreDto.user_id });
      expect(mockScoreModel.find).toHaveBeenCalledTimes(10);
      expect(mockCreatedScore.save).toHaveBeenCalledTimes(0);
    });
    
  });

  
})
