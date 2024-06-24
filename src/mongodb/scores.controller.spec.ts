import { Test, TestingModule } from '@nestjs/testing';
import { ScoresController } from './scores.controller';
import { ScoresService } from './scores.service';
import { getModelToken } from '@nestjs/mongoose';
import { CacheService } from './cache/cache.service';
import { HttpService } from '@nestjs/axios';
import { HttpStatus, INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { FastifyReply, FastifyRequest } from 'fastify';



describe('ScoresController', () => {
  let controller: ScoresController;
  let service: ScoresService;
  let app: INestApplication;

  const mockScoreModel = {
    find: jest.fn().mockResolvedValue([{ score: 100 }]),
    findOne: jest.fn().mockResolvedValue({ score: 100 }),
    save: jest.fn(),
  };

  const mockHexcodeMappingModel = {};
  const mockAssessmentInputModel = {};
  const mockDenoiserOutputLogsModel = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScoresController],
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

    app = module.createNestApplication();
    await app.init();

    controller = module.get<ScoresController>(ScoresController);
    service = module.get<ScoresService>(ScoresService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(service).toBeDefined();
  });

  // Mock response object
  const mockResponse = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
  } as unknown as FastifyReply;

  // Api Name : getUsersMilestones
  describe('getUsersMilestones', () => {
    it('should successfully get users milestones', async () => {
      const requestBody = {
        userIds: ['8591582684', '7568010954'],
        language: 'ta',
      };

      const expectedResponse = [
        {
          user_id: '8591582684',
          data: {
            milestone_level: 'm0',
          },
        },
        {
          user_id: '7568010954',
          data: {
            milestone_level: 'm0',
          },
        },
      ];

      jest.spyOn(service, 'getlatestmilestone').mockImplementation(() => {
        return Promise.resolve([{ milestone_level: 'm0' }]);
      });

      const response = await request(app.getHttpServer())
        .post('/scores/getUsersMilestones')
        .send(requestBody)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual(expectedResponse);
    });

    it('should handle validation errors', async () => {
      const invalidRequestBody = {
        userIds: [],
        language: '',
      };

      const response = await request(app.getHttpServer())
        .post('/scores/getUsersMilestones')
        .send(invalidRequestBody)
        .expect(HttpStatus.BAD_REQUEST);

      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Invalid request data');
    });
  });

  // Api Name : getUsersFamilirity

  it('should successfully get users familiarity', async () => {
    const requestBody = {
      userIds: ['8591582684', '7568010954'],
      language: 'ta',
    };

    const expectedResponse = [
      {
        user_id: '8591582684',
        familiarityCount: 1,
        familiarityData: [
          {
            character: 'aɪ',
            latestScores: [0.99, 0.99],
            countBelowThreshold: 0,
            countAboveThreshold: 2,
            score: 0.99,
          },
        ],
      },
      {
        user_id: '7568010954',
        familiarityCount: 0,
        familiarityData: [],
      },
    ];

    // Mock the service method to return expected data
    jest.spyOn(service, 'getFamiliarityByUser').mockImplementation((userId) => {
      if (userId === '8591582684') {
        return Promise.resolve([
          {
            character: 'aɪ',
            latestScores: [0.99, 0.99],
            countBelowThreshold: 0,
            countAboveThreshold: 2,
            score: 0.99,
          },
        ]);
      } else if (userId === '7568010954') {
        return Promise.resolve([]);
      } else {
        return Promise.resolve([]);
      }
    });

    // Send request and assert response
    const response = await request(app.getHttpServer())
      .post('/scores/getUsersFamiliarity')
      .send(requestBody)
      .expect(HttpStatus.OK);

    expect(response.body).toEqual(expectedResponse);
  });

  it('should handle validation errors', async () => {
    const invalidRequestBody = {
    };

    const response = await request(app.getHttpServer())
      .post('/scores/getUsersFamiliarity')
      .send(invalidRequestBody)
      .expect(HttpStatus.INTERNAL_SERVER_ERROR);

    expect(response.body.status).toBe('error');
    expect(response.body.message).toBe('Server error - TypeError: userIds is not iterable');
  });


  // Api name : getUserProfile

  it('should return user profile data', async () => {

    const mockData = {
      userId: '12567654356',
      language: 'en',
    };

    const mockSubsessionData = [
      {
        sub_session_id: 'UJoRJ7sbVnvT0QGVeTsJwAp4wa5FSmNA',
        createdAt: '2024-06-22T06:52:44.389Z'
      },
    ];

    const mockFamiliarityData = [
      {
        "character": "ட",
        "latestScores": [
          {
            "score": 0.993,
            "original_text": "இப்பாடலின்",
            "response_text": "ஈ பாடலேந்"
          },
          {
            "score": 0.993,
            "original_text": "இப்பாடலின்",
            "response_text": "ஈ பாடலேந்"
          }
        ],
        "countBelowThreshold": 0,
        "countAboveThreshold": 5,
        "avg": 0.993
      },
    ];

    const mockTargetData = [
      {
        "character": "ப",
        "latestScores": [
          {
            "score": 0.9,
            "original_text": "இப்பாடலின்",
            "response_text": "ஈ பாடலேந்"
          },
          {
            "score": 0.9,
            "original_text": "இப்பாடலின்",
            "response_text": "ஈ பாடலேந்"
          }
        ],
        "countBelowThreshold": 0,
        "countAboveThreshold": 5,
        "avgScore": 0.9
      }
    ];

    jest.spyOn(service, 'getSubessionIds').mockResolvedValue(mockSubsessionData);
    jest.spyOn(service, 'getFamiliarityBysubSessionUserProfile').mockResolvedValue(mockFamiliarityData);
    jest.spyOn(service, 'getTargetsBysubSessionUserProfile').mockResolvedValue(mockTargetData);

    await controller.GetUserProfile(mockResponse, mockData);

    expect(service.getSubessionIds).toHaveBeenCalledWith(mockData.userId);
    expect(service.getFamiliarityBysubSessionUserProfile).toHaveBeenCalledWith('UJoRJ7sbVnvT0QGVeTsJwAp4wa5FSmNA', mockData.language);
    expect(service.getTargetsBysubSessionUserProfile).toHaveBeenCalledWith('UJoRJ7sbVnvT0QGVeTsJwAp4wa5FSmNA', mockData.language);

    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.send).toHaveBeenCalledWith({
      Target: [
        { subSessionId: 'UJoRJ7sbVnvT0QGVeTsJwAp4wa5FSmNA', createdAt: mockSubsessionData[0].createdAt, score: mockTargetData },
      ],
      Famalarity: [
        { subSessionId: 'UJoRJ7sbVnvT0QGVeTsJwAp4wa5FSmNA', createdAt: mockSubsessionData[0].createdAt, score: mockFamiliarityData },
      ]
    });
  });

  it('should handle errors', async () => {
    const mockData = {
      userId: 'testUserId',
      language: 'en',
    };
    jest.spyOn(service, 'getSubessionIds').mockRejectedValue(new Error('Test error'));

    await controller.GetUserProfile(mockResponse, mockData);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.send).toHaveBeenCalledWith({
      status: 'error',
      message: 'Server error - Error: Test error',
    });
  });


  // Api Name : getUsersTargets

  const mockData = {
    userIds: ['12345678', '87654321'],
    language: 'en',
  };

  it('should return the user target data', async () => {

    const mockUserRecord = [
      {
        "character": "ளி",
        "score": 0.1
      },
      {
        "character": "வெ",
        "score": 0.1
      },
    ]
    jest.spyOn(service, 'getTargetsByUser').mockResolvedValue(mockUserRecord);

    await controller.GetUsersTargets(mockResponse, mockData);

    expect(service.getTargetsByUser).toHaveBeenCalledWith('12345678', mockData.language);
    expect(service.getTargetsByUser).toHaveBeenCalledWith('87654321', mockData.language);

    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.send).toHaveBeenCalledWith([
      {
        user_id: '12345678',
        targetData: mockUserRecord,
        targetCount: mockUserRecord.length,
      },
      {
        user_id: '87654321',
        targetData: mockUserRecord,
        targetCount: mockUserRecord.length,
      },
    ]);
  })

  it('should handle errors', async () => {
    jest.spyOn(service, 'getTargetsByUser').mockRejectedValue(new Error('Test error'));

    await controller.GetUsersTargets(mockResponse, mockData);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.send).toHaveBeenCalledWith({
      status: 'error',
      message: 'Server error - Error: Test error',
    })
  })

  // Api Name : GetSessionIdsByUser

  it('should return session ids for a user with default limit', async () => {
    const mockSessionData = [
      { sessionId: 'session1', createdAt: new Date() },
      { sessionId: 'session2', createdAt: new Date() },
    ];
    jest.spyOn(service, 'getAllSessions').mockResolvedValue(mockSessionData);

    const userId = 'testUserId';
    const limit = 5;

    const result = await controller.GetSessionIdsByUser(userId, { limit });

    expect(service.getAllSessions).toHaveBeenCalledWith(userId, limit);
    expect(result).toEqual(mockSessionData);
  });

  // Api Name : assessmentInputCreate

  const mockAssessmentInput = {
    user_id: '123456',
    session_id: "UJoRJ7sbVnvT0QGVeT",
    token: 'a',
    feedback: 1
  };

  it('should add assessment input and return success response', async () => {
    jest.spyOn(service, 'assessmentInputCreate').mockResolvedValue(mockAssessmentInput);

    await controller.AddAssessmentInput(mockResponse, mockAssessmentInput);

    expect(service.assessmentInputCreate).toHaveBeenCalledWith(mockAssessmentInput);
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CREATED);
    expect(mockResponse.send).toHaveBeenCalledWith({
      status: 'success',
      msg: 'Successfully stored data to Assessment Input',
    });
  });

  it('should handle errors', async () => {

    jest.spyOn(service, 'assessmentInputCreate').mockRejectedValue(new Error('Test error'));
    try {
      await controller.AddAssessmentInput(mockResponse, mockAssessmentInput);
    } catch (error) {
      expect(error.message).toBe('Test error');
    }

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.send).toHaveBeenCalledWith({
      status: 'error',
      message: 'Server error - Error: Test error',
    });
  });


  // Api Name : GetMissingChars
  const mockStoryData = {
    storyLanguage: 'ta',
    storyString: 'க்ஷ்ா',
  };
  const mockMissingChars = ['க', '்', 'ஷ', 'ா'];

  it('should return missing characters for a given story', async () => {
    
    jest.spyOn(service, 'getMissingChars').mockResolvedValue(mockMissingChars);

    await controller.GetMissingChars(mockResponse, mockStoryData);

    const expectedUniqueCharArr = ['s', 'o', 'm', 'e', ' ', 's', 'a', 'm', 'p', 'l', 'e', ' ', 's', 't', 'o', 'r', 'y', ' ', 's', 't', 'r', 'i', 'n', 'g', ' ', 'i', 'n', ' ', 'T', 'a', 'm', 'i', 'l'];
    const expectedMatched = [];
    const expectedNotIncluded = mockMissingChars;
    const expectedMatchtedTotal = expectedMatched.length;
    const expectedNotIncludedTotal = expectedNotIncluded.length;

    expect(service.getMissingChars).toHaveBeenCalledWith(mockStoryData.storyLanguage);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CREATED);
    expect(mockResponse.send).toHaveBeenCalledWith({
      status: 'success',
      matched: expectedMatched,
      matchtedTotal: expectedMatchtedTotal,
      notIncluded: expectedNotIncluded,
      notIncludedTotal: expectedNotIncludedTotal,
    });
  });

  it('should handle errors', async () => {
    jest.spyOn(service, 'getMissingChars').mockRejectedValue(new Error('Test error'));
   
    try {
      await controller.GetMissingChars(mockResponse, mockStoryData);
    } catch (error) {
      expect(error.message).toBe('Test error');
    }

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.send).toHaveBeenCalledWith({
      status: 'error',
      message: 'Server error - Error: Test error',
    });
  });


  // Api Name : getlatestmilestone

  const userId = 'testUserId';
  const language = 'en';
  const mockRecordData = [
    { milestone_level: 'm2' },
  ];
  it('should return the latest milestone level for a user', async () => {
   

    jest.spyOn(service, 'getlatestmilestone').mockResolvedValue(mockRecordData);

    await controller.getMilestone(userId, language, mockResponse);

    expect(service.getlatestmilestone).toHaveBeenCalledWith(userId, language);
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CREATED);
    expect(mockResponse.send).toHaveBeenCalledWith({
      status: 'success',
      data: { milestone_level: 'm2' },
    });
  });

  it('should return m0 if no milestone level is found', async () => {
    const mockResponse = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as unknown as FastifyReply;

    const userId = 'testUserId';
    const language = 'en';
    const mockRecordData = [];

    jest.spyOn(service, 'getlatestmilestone').mockResolvedValue(mockRecordData);

    await controller.getMilestone(userId, language, mockResponse);

    expect(service.getlatestmilestone).toHaveBeenCalledWith(userId, language);
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CREATED);
    expect(mockResponse.send).toHaveBeenCalledWith({
      status: 'success',
      data: { milestone_level: 'm0' },
    });
  });

  it('should handle errors', async () => {
   
    jest.spyOn(service, 'getlatestmilestone').mockRejectedValue(new Error('Test error'));

    await controller.getMilestone(userId, language, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.send).toHaveBeenCalledWith({
      status: 'error',
      message: 'Server error - Error: Test error',
    });
  });


  // Api Name : GetSetResult 

  
})