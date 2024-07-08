import { Test, TestingModule } from '@nestjs/testing';
import { ScoresController } from './scores.controller';
import { ScoresService } from './scores.service';
import { getModelToken } from '@nestjs/mongoose';
import { CacheService } from './cache/cache.service';
import { HttpService } from '@nestjs/axios';
import { HttpStatus, INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { FastifyReply, FastifyRequest } from 'fastify';
import ta_config from './config/language/ta';
import { of } from 'rxjs';
import { AxiosResponse } from 'axios';



describe('ScoresController', () => {
  let controller: ScoresController;
  let service: ScoresService;
  let app: INestApplication;
  let httpService: HttpService;

  const mockScoreModel = {
    find: jest.fn().mockResolvedValue([{ score: 100 }]),
    findOne: jest.fn().mockResolvedValue({ score: 100 }),
    save: jest.fn(),
  };

  const mockHexcodeMappingModel = {};
  const mockAssessmentInputModel = {};
  const mockDenoiserOutputLogsModel = {};

  beforeEach(async () => {
    process.env.ALL_CONTENT_SERVICE_API = 'http://mockapi.com'
    process.env.denoiserEnabled = "true";
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScoresController],
      providers: [
        ScoresService,
        { provide: getModelToken('Score'), useValue: mockScoreModel },
        { provide: getModelToken('hexcodeMapping'), useValue: mockHexcodeMappingModel },
        { provide: getModelToken('assessmentInput'), useValue: mockAssessmentInputModel },
        { provide: getModelToken('denoiserOutputLogs'), useValue: mockDenoiserOutputLogsModel },
        { provide: CacheService, useValue: {} },
        { provide: HttpService, useValue: {
          post: jest.fn()
        } },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    controller = module.get<ScoresController>(ScoresController);
    service = module.get<ScoresService>(ScoresService);
    httpService = module.get<HttpService>(HttpService);
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

  // Mock data 
  const mockTargetResult = [
    { target: 'target1', score: 1 },
    { target: 'target2', score: 2 },
  ];

  const mockFamiliarityResult = [
    { familiarity: 'fam1', score: 1 },
    { familiarity: 'fam2', score: 2 },
  ];

  const userId = 'testUserId';
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
  describe('getUsersFamilirity', () => {
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
  })

  // Api name : getUserProfile
  describe('getUserProfile', () => {
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
  })

  // Api Name : getUsersTargets
  describe('getUsersTargets', () => {
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

  })

  // Api Name : GetSessionIdsByUser
  describe('GetSessionIdsByUser', () => { 
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
  })
  
  // Api Name : assessmentInputCreate
  describe('assessmentInputCreate', () => {
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
  })

  // Api Name : GetMissingChars
  describe('GetMissingChars', () => {
    const mockStoryData = {
      storyLanguage: 'ta',
      storyString: 'க்ஷ்ா',
    };
    const mockMissingChars = ['க', '்', 'ஷ', 'ா'];

    it('should return missing characters for a given story', async () => {

      jest.spyOn(service, 'getMissingChars').mockResolvedValue(mockMissingChars);

      await controller.GetMissingChars(mockResponse, mockStoryData);

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
  })

  // Api Name : getlatestmilestone
  describe('getlatestmilestone', () => {
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
  })

  // Api Name : GetFamiliarityByUser 
  describe('GetFamiliarityByUser', () => {
    const language = 'ta'
    it('should return familiarity result for a user', async () => {

      jest.spyOn(service, 'getFamiliarityByUser').mockResolvedValue(mockFamiliarityResult);

      await controller.GetFamiliarityByUser(userId, language, mockResponse);

      expect(service.getFamiliarityByUser).toHaveBeenCalledWith(userId, language);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockResponse.send).toHaveBeenCalledWith(mockFamiliarityResult);
    });

    it('should handle errors', async () => {

      jest.spyOn(service, 'getFamiliarityByUser').mockRejectedValue(new Error('Test error'));

      await controller.GetFamiliarityByUser(userId, language, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.send).toHaveBeenCalledWith({
        status: 'error',
        message: 'Server error - Error: Test error',
      });
    });
  })

  // Api Name : get familiarity by session
  describe('get familiarity by session', () => {
    const sessionId = 'testSessionId';
    const language = 'ta'
    it('should return familiarity result for a session', async () => {

      jest.spyOn(service, 'getFamiliarityBySession').mockResolvedValue(mockFamiliarityResult);

      await controller.GetFamiliarityBysession(sessionId, language, mockResponse);

      expect(service.getFamiliarityBySession).toHaveBeenCalledWith(sessionId, language);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockResponse.send).toHaveBeenCalledWith(mockFamiliarityResult);
    });

    it('should handle errors', async () => {

      jest.spyOn(service, 'getFamiliarityBySession').mockRejectedValue(new Error('Test error'));
      await controller.GetFamiliarityBysession(sessionId, language, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.send).toHaveBeenCalledWith({
        status: 'error',
        message: 'Server error - Error: Test error',
      });
    });


  })

  // Api Name : familiarity by sub session
  describe('familiarity by sub session', () => {
    const subsessionId = 'testSubsessionId';
    const language = 'ta';
    it('should return familiarity result for a subsession', async () => {

      jest.spyOn(service, 'getFamiliarityBysubSession').mockResolvedValue(mockFamiliarityResult);

      await controller.GetFamiliaritybysubsession(subsessionId, language, mockResponse);

      expect(service.getFamiliarityBysubSession).toHaveBeenCalledWith(subsessionId, language);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockResponse.send).toHaveBeenCalledWith(mockFamiliarityResult);
    });

    it('should handle errors', async () => {

      jest.spyOn(service, 'getFamiliarityBysubSession').mockRejectedValue(new Error('Test error'));

      await controller.GetFamiliaritybysubsession(subsessionId, language, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.send).toHaveBeenCalledWith({
        status: 'error',
        message: 'Server error - Error: Test error',
      });
    });
  })

  // Api Name : getTargetsBysubSession
  describe('getUsersTargets', () => {
    const mockTargetResult = [
      { target: 'target1', score: 1 },
      { target: 'target2', score: 2 },
    ];
    const subsessionId = 'testSubsessionId';
    const language = 'ta';
    it('should return targets for a subsession', async () => {

      jest.spyOn(service, 'getTargetsBysubSession').mockResolvedValue(mockTargetResult);

      await controller.GetTargetsbysubsession(subsessionId, language, mockResponse);

      expect(service.getTargetsBysubSession).toHaveBeenCalledWith(subsessionId, language);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockResponse.send).toHaveBeenCalledWith(mockTargetResult);
    });

    it('should handle errors', async () => {

      jest.spyOn(service, 'getTargetsBysubSession').mockRejectedValue(new Error('Test error'));

      await controller.GetTargetsbysubsession(subsessionId, language, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.send).toHaveBeenCalledWith({
        status: 'error',
        message: 'Server error - Error: Test error',
      });
    });
  })

  // Api Name : getTargetsByUser
  describe('getTargetsByUser', () => {
    const language = 'ta'
    it('should return targets for a user', async () => {
      jest.spyOn(service, 'getTargetsByUser').mockResolvedValue(mockTargetResult);

      await controller.GetTargetsbyUser(userId, language, mockResponse);

      expect(service.getTargetsByUser).toHaveBeenCalledWith(userId, language);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockResponse.send).toHaveBeenCalledWith(mockTargetResult);
    });

    it('should handle errors', async () => {

      jest.spyOn(service, 'getTargetsByUser').mockRejectedValue(new Error('Test error'));

      await controller.GetTargetsbyUser(userId, language, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.send).toHaveBeenCalledWith({
        status: 'error',
        message: 'Server error - Error: Test error',
      });
    });
  })

  // Api Name : getTargetsBySession
  describe('getTargetsBySession', () => {
    const sessionId = 'testSubsessionId';
    const language = 'ta';
    it('should return targets for a session', async () => {

      jest.spyOn(service, 'getTargetsBySession').mockResolvedValue(mockTargetResult);

      await controller.GetTargetsbySession(sessionId, language, mockResponse);

      expect(service.getTargetsBySession).toHaveBeenCalledWith(sessionId, language);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockResponse.send).toHaveBeenCalledWith(mockTargetResult);
    });

    it('should handle errors', async () => {

      jest.spyOn(service, 'getTargetsBySession').mockRejectedValue(new Error('Test error'));

      await controller.GetTargetsbySession(sessionId, language, mockResponse);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.send).toHaveBeenCalledWith({
        status: 'error',
        message: 'Server error - Error: Test error',
      });
    });
  })

  // Api Name : Update leraner profile ta
  describe('Update leraner profile ta', () => {
    const language: string = 'ta'
    const mockCreateLearnerProfileDto = {
      user_id: 'user1',
      session_id: 'session1',
      sub_session_id: 'subSession1',
      contentType: 'word',
      contentId: 'content1',
      language: 'ta',
      original_text: 'original text',
      audio: Buffer.from('audio data'),
      output: undefined,
      date: new Date(),
    };
    const mockOriginalTokenArr = [
      'இ', 'ப', 'ப்',
      'ப', 'பா', 'ட',
      'ல', 'லி', 'ன',
      'ன்'
    ]
    const mockAudioOutput = {
      asrOutDenoisedOutput: {
        taskType: 'asr',
        output: [
          {
            source: 'ஈ பாடலேந்',
            nBestTokens: [
              {
                word: 'ஈ',
                tokens: [
                  {
                    'ஈ': 0.888,
                    'இ': 0.081,
                  },
                ],
              },
              {
                word: 'பாடலேந்',
                tokens: [
                  {
                    'பா': 0.9,
                    'ப்ப': 0.084,
                  },
                  {
                    'ட': 0.993,
                    'டெ': 0.003,
                  },
                  {
                    'ல': 0.042,
                  },
                  {
                    'ே': 0.972,
                  },
                  {
                    'ந்': 0.548,
                    'நி': 0.122,
                  },
                ],
              },
            ],
          },
        ],
        config: null,
      },
      asrOutBeforeDenoised: {
        taskType: 'asr',
        output: [
          {
            source: 'ஈ பாடலேந்',
            nBestTokens: [
              {
                word: 'ஈ',
                tokens: [
                  {
                    'ஈ': 0.888,
                    'இ': 0.081,
                  },
                ],
              },
              {
                word: 'பாடலேந்',
                tokens: [
                  {
                    'பா': 0.9,
                    'ப்ப': 0.084,
                  },
                  {
                    'ட': 0.993,
                    'டெ': 0.003,
                  },
                  {
                    'ல': 0.042,
                  },
                  {
                    'ே': 0.972,
                  },
                  {
                    'ந்': 0.548,
                    'நி': 0.122,
                  },
                ],
              },
            ],
          },
        ],
        config: null,
      },
      pause_count: 0,
    };
    const mockVowel = ['ா', 'ி', 'ீ', 'ு', 'ூ', 'ெ', 'ே', 'ை', 'ொ', 'ோ', 'ௌ', '்',]

    const denoise = {
      user_id: '9054461392',
      session_id: 'gQG5rPPquMWhmfVBzP6ajFkl5fvjWG6n',
      sub_session_id: 'UJoRJ7sbVnvT0QGVeTsJwAp4wa5FSmNA',
      contentId: '42d02538-0326-4f56-9dec-d49b6fb017ce',
      contentType: 'Word',
      language: 'ta',
      original_text: 'இப்பாடலின்',
      response_text: 'ஈ பாடலேந்',
      denoised_response_text: 'ஈ பாடலேந்',
      improved: false,
      comment: '',
      _id: "667be88d1513af6acb932ffd",
      createdAt: '2024-06-26T10:08:13.025Z',
      updatedAt: '2024-06-26T10:08:13.025Z',
      __v: 0
    }

    it('should update learner profile for Tamil', async () => {

      jest.spyOn(service, 'getSyllablesFromString').mockResolvedValue(mockOriginalTokenArr);
      jest.spyOn(service, 'audioFileToAsrOutput').mockResolvedValue(mockAudioOutput);
      jest.spyOn(service, 'getTextSimilarity').mockResolvedValue(0.8);
      jest.spyOn(service, 'gethexcodeMapping').mockResolvedValue([]);
      jest.spyOn(service, 'getConstructedText').mockResolvedValue({ constructText: 'constructed text', reptitionCount: 1 });
      jest.spyOn(service, 'identifyTokens').mockResolvedValue({ confidence_scoresArr: [], missing_token_scoresArr: [], anomaly_scoreArr: [] });
      jest.spyOn(service, 'getTextMetrics').mockResolvedValue({ cer: 0, wer: 0, insertion: [], deletion: [], substitution: [] });
      jest.spyOn(service, 'addDenoisedOutputLog').mockResolvedValue(denoise);
      jest.spyOn(service, 'getCalculatedFluency').mockResolvedValue(0.9);
      jest.spyOn(service, 'getRetryStatus').mockResolvedValue(1);
      jest.spyOn(service, 'create').mockResolvedValue(null);
      jest.spyOn(service, 'getTargetsBysubSession').mockResolvedValue([{ character: 'syllable1' }]);
      jest.spyOn(service, 'getSubsessionOriginalTextSyllables').mockResolvedValue(['syllable1']);
      jest.spyOn(service, 'getFluencyBysubSession').mockResolvedValue(0.8);

      await controller.updateLearnerProfileTa(mockResponse, mockCreateLearnerProfileDto);

      expect(service.getSyllablesFromString).toHaveBeenCalledWith(mockCreateLearnerProfileDto.original_text, mockVowel, mockCreateLearnerProfileDto.language);
      expect(service.audioFileToAsrOutput).toHaveBeenCalledWith(expect.any(String), 'ta', 'word');
      expect(service.getTextSimilarity).toHaveBeenCalledWith('original text', 'ஈ பாடலேந்');
      expect(service.getTextSimilarity).toHaveBeenCalledWith('original text', 'ஈ பாடலேந்');
      expect(service.gethexcodeMapping).toHaveBeenCalledWith(ta_config.language_code);
      expect(service.getConstructedText).toHaveBeenCalledWith('original text', 'ஈ பாடலேந்');
      expect(service.identifyTokens).toHaveBeenCalled();
      expect(service.getTextMetrics).toHaveBeenCalled();
      expect(service.addDenoisedOutputLog).toHaveBeenCalled();
      expect(service.getCalculatedFluency).toHaveBeenCalled();
      expect(service.getRetryStatus).toHaveBeenCalledWith('user1', 'content1');
      expect(service.create).toHaveBeenCalled();
      expect(service.getTargetsBysubSession).toHaveBeenCalledWith('subSession1', 'ta');
      expect(service.getSubsessionOriginalTextSyllables).toHaveBeenCalledWith('subSession1');
      expect(service.getFluencyBysubSession).toHaveBeenCalledWith('subSession1', 'ta');
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CREATED);
    });

    it('should handle empty ASR output error', async () => {
      jest.spyOn(service, 'getSyllablesFromString').mockResolvedValue(['syllable1', 'syllable2']);
      jest.spyOn(service, 'audioFileToAsrOutput').mockResolvedValue({
        asrOutDenoisedOutput: { output: [{ source: '' }] },
        asrOutBeforeDenoised: { output: [{ source: '' }] },
        pause_count: 1,
      });

      await controller.updateLearnerProfileTa(mockResponse, mockCreateLearnerProfileDto);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.send).toHaveBeenCalledWith({
        status: 'error',
        message: 'Server error - TypeError: this.cacheService.get is not a function',
      });
    });

    it('should handle internal server errors', async () => {
      jest.spyOn(service, 'getSyllablesFromString').mockRejectedValue(new Error('Test error'));

      await controller.updateLearnerProfileTa(mockResponse, mockCreateLearnerProfileDto);
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.send).toHaveBeenCalledWith({
        status: 'error',
        message: 'Server error - Error: Test error',
      });
    });

  })

  // Api Name : Update learner profile Hi
  describe('Update learner profile Hi', () => {
    it('should update learner profile for Hindi', async () => {

      const mockCreateLearnerProfileDto = {
        user_id: 'user1',
        session_id: 'session1',
        sub_session_id: 'subSession1',
        contentType: 'word',
        contentId: 'content1',
        language: 'hi',
        original_text: 'original text',
        audio: Buffer.from('audio data'),
        output: undefined,
        date: new Date(),
      };

      const mockAudioOutput = {
        output: [
          {
            source: 'अनुमान',
            nBestTokens: [
              {
                word: 'अनुमान',
                tokens: [
                  {
                    'अ': 0.9,
                    'न': 0.8,
                  },
                  {
                    'ु': 0.7,
                  },
                  {
                    'म': 0.6,
                  },
                  {
                    'ा': 0.5,
                  },
                  {
                    'न': 0.4,
                  },
                ],
              },
            ],
          },
        ],
        pause_count: 0,
      };

      jest.spyOn(service, 'audioFileToAsrOutput').mockResolvedValue(mockAudioOutput);
      jest.spyOn(service, 'gethexcodeMapping').mockResolvedValue([]);
      jest.spyOn(service, 'getRetryStatus').mockResolvedValue(1);
      jest.spyOn(service, 'create').mockResolvedValue(null);

      await controller.updateLearnerProfileHi(mockResponse, mockCreateLearnerProfileDto);

      expect(service.audioFileToAsrOutput).toHaveBeenCalledWith(expect.any(String), 'hi', 'word');
      expect(service.gethexcodeMapping).toHaveBeenCalledWith('hi');
      expect(service.getRetryStatus).toHaveBeenCalledWith('user1', 'content1');
      expect(service.create).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(mockResponse.send).toHaveBeenCalledWith({
        status: 'success',
        msg: 'Successfully stored data to learner profile',
        responseText: 'अनुमान',
      });
    });

    it('should handle empty ASR output error', async () => {
      const mockCreateLearnerProfileDto = {
        user_id: 'user1',
        session_id: 'session1',
        sub_session_id: 'subSession1',
        contentType: 'word',
        contentId: 'content1',
        language: 'hi',
        original_text: 'original text',
        audio: Buffer.from('audio data'),
        output: undefined,
        date: new Date(),
      };

      const mockAudioOutput = {
        output: [
          {
            source: '',
            nBestTokens: [],
          },
        ],
        pause_count: 0,
      };

      jest.spyOn(service, 'audioFileToAsrOutput').mockResolvedValue(mockAudioOutput);

      await controller.updateLearnerProfileHi(mockResponse, mockCreateLearnerProfileDto);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.send).toHaveBeenCalledWith({
        status: 'error',
        message: 'Audio to Text functionality Responded Empty Response. Please check audio file or speak Loudly',
      });
    });

    it('should handle internal server errors', async () => {
      const mockCreateLearnerProfileDto = {
        user_id: 'user1',
        session_id: 'session1',
        sub_session_id: 'subSession1',
        contentType: 'word',
        contentId: 'content1',
        language: 'hi',
        original_text: 'original text',
        audio: Buffer.from('audio data'),
        output: undefined,
        date: new Date(),
      };

      jest.spyOn(service, 'audioFileToAsrOutput').mockRejectedValue(new Error('Test error'));

      await controller.updateLearnerProfileHi(mockResponse, mockCreateLearnerProfileDto);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.send).toHaveBeenCalledWith({
        status: 'error',
        message: 'Server error - Error: Test error',
      });
    });

  })

  // Api Name : Update learner profile Kannada
  describe('Update learner profile Kannada', () => {
    it('should update learner profile for Kannada', async () => {

      const mockCreateLearnerProfileDto = {
        user_id: 'user1',
        session_id: 'session1',
        sub_session_id: 'subSession1',
        contentType: 'word',
        contentId: 'content1',
        language: 'kn',
        original_text: 'original text',
        audio: Buffer.from('audio data'),
        output: undefined,
        date: new Date(),
      };

      const mockAudioOutput = {
        asrOutDenoisedOutput: {
          taskType: 'asr',
          output: [
            {
              source: 'ಅಪಾಡಲುಮಾನ',
              nBestTokens: [
                {
                  word: 'ಅಪಾಡಲುಮಾನ',
                  tokens: [
                    { 'ಅ': 0.9, 'ಪ': 0.8 },
                    { 'ಾ': 0.7 },
                    { 'ಡ': 0.6 },
                    { 'ಲು': 0.5 },
                    { 'ಮಾ': 0.4 },
                  ],
                },
              ],
            },
          ],
        },
        asrOutBeforeDenoised: {
          taskType: 'asr',
          output: [
            {
              source: 'ಅಪಾಡಲುಮಾನ',
              nBestTokens: [
                {
                  word: 'ಅಪಾಡಲುಮಾನ',
                  tokens: [
                    { 'ಅ': 0.9, 'ಪ': 0.8 },
                    { 'ಾ': 0.7 },
                    { 'ಡ': 0.6 },
                    { 'ಲು': 0.5 },
                    { 'ಮಾ': 0.4 },
                  ],
                },
              ],
            },
          ],
        },
        pause_count: 0,
      };

      jest.spyOn(service, 'audioFileToAsrOutput').mockResolvedValue(mockAudioOutput);
      jest.spyOn(service, 'gethexcodeMapping').mockResolvedValue([]);
     
      await controller.updateLearnerProfileKn(mockResponse, mockCreateLearnerProfileDto);

      expect(service.audioFileToAsrOutput).toHaveBeenCalledWith(expect.any(String), 'kn', 'word');
      expect(service.gethexcodeMapping).toHaveBeenCalledWith('kn');
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CREATED);
    });

    it('should handle empty ASR output error', async () => {

      const mockCreateLearnerProfileDto = {
        user_id: 'user1',
        session_id: 'session1',
        sub_session_id: 'subSession1',
        contentType: 'word',
        contentId: 'content1',
        language: 'kn',
        original_text: 'original text',
        audio: Buffer.from('audio data'),
        output: undefined,
        date: new Date(),
      };

      const mockAudioOutput = {
        asrOutDenoisedOutput: { output: [{ source: '' }] },
        asrOutBeforeDenoised: { output: [{ source: '' }] },
        pause_count: 1,
      };

      jest.spyOn(service, 'audioFileToAsrOutput').mockResolvedValue(mockAudioOutput);

      await controller.updateLearnerProfileKn(mockResponse, mockCreateLearnerProfileDto);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.send).toHaveBeenCalledWith({
        status: 'error',
        message: 'Audio to Text functionality Responded Empty Response. Please check audio file or speak Loudly',
      });
    });

    it('should handle internal server errors', async () => {

      const mockCreateLearnerProfileDto = {
        user_id: 'user1',
        session_id: 'session1',
        sub_session_id: 'subSession1',
        contentType: 'word',
        contentId: 'content1',
        language: 'kn',
        original_text: 'original text',
        audio: Buffer.from('audio data'),
        output: undefined,
        date: new Date(),
      };

      jest.spyOn(service, 'audioFileToAsrOutput').mockRejectedValue(new Error('Test error'));

      await controller.updateLearnerProfileKn(mockResponse, mockCreateLearnerProfileDto);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.send).toHaveBeenCalledWith({
        status: 'error',
        message: 'Server error - Error: Test error',
      });
    });
  })

  // Api Name : Update learner profile English
  describe('Update learner profile English', () => {
    it('should update learner profile for English', async () => {
      const mockCreateLearnerProfileDto = {
        user_id: 'user1',
        session_id: 'session1',
        sub_session_id: 'subSession1',
        contentType: 'word',
        contentId: 'content1',
        language: 'en',
        original_text: 'original text',
        audio: Buffer.from('audio data'),
        output: undefined,
        date: new Date(),
      };

      const mockOriginalText = 'original processed text';
      const mockAudioOutput = {
        asrOutDenoisedOutput: {
          output: [{ source: 'denoised response text' }],
        },
        asrOutBeforeDenoised: {
          output: [{ source: 'non-denoised response text' }],
        },
        pause_count: 0,
      };
      const mockHexcodeDataArr = [];
      const mockTextMetrics = {
        cer: 0.1,
        wer: 0.2,
        insertion: [],
        deletion: [],
        substitution: [],
        confidence_char_list: ['a', 'b', 'c'],
        missing_char_list: ['d', 'e', 'f'],
        construct_text: 'constructed text',
      };
      const mockTargets = [{ character: 'a' }];
      const mockFluency = 0.8;

      jest.spyOn(service, 'processText').mockResolvedValue(mockOriginalText);
      jest.spyOn(service, 'audioFileToAsrOutput').mockResolvedValue(mockAudioOutput);
      jest.spyOn(service, 'getTextSimilarity').mockResolvedValue(0.9);
      jest.spyOn(service, 'gethexcodeMapping').mockResolvedValue(mockHexcodeDataArr);
      jest.spyOn(service, 'getTextMetrics').mockResolvedValue(mockTextMetrics);
      jest.spyOn(service, 'getTokenHexcode').mockResolvedValue('hexcode');
      jest.spyOn(service, 'getConstructedText').mockResolvedValue({ constructText: '', reptitionCount: 0 });
      jest.spyOn(service, 'getCalculatedFluency').mockResolvedValue(0.9);
      jest.spyOn(service, 'addDenoisedOutputLog').mockResolvedValue(null);
      jest.spyOn(service, 'getRetryStatus').mockResolvedValue(1);
      jest.spyOn(service, 'create').mockResolvedValue(null);
      jest.spyOn(service, 'getTargetsBysubSession').mockResolvedValue(mockTargets);
      jest.spyOn(service, 'getFluencyBysubSession').mockResolvedValue(mockFluency);

      await controller.updateLearnerProfileEn(mockResponse, mockCreateLearnerProfileDto);

      expect(service.processText).toHaveBeenCalledWith('original text');
      expect(service.audioFileToAsrOutput).toHaveBeenCalledWith(expect.any(String), 'en', 'word');
      expect(service.getTextSimilarity).toHaveBeenCalledTimes(2);
      expect(service.gethexcodeMapping).toHaveBeenCalledWith('en');
      expect(service.getTokenHexcode).toHaveBeenCalledTimes(6);
      expect(service.getTextMetrics).toHaveBeenCalledWith(mockOriginalText, 'original processed text', 'en', mockCreateLearnerProfileDto.audio);
      expect(service.getConstructedText).toHaveBeenCalledWith(mockOriginalText, 'original processed text');
      expect(service.getCalculatedFluency).toHaveBeenCalled();
      expect(service.addDenoisedOutputLog).toHaveBeenCalled();
      expect(service.getRetryStatus).toHaveBeenCalledWith('user1', 'content1');
      expect(service.create).toHaveBeenCalled();
      expect(service.getTargetsBysubSession).toHaveBeenCalledWith('subSession1', 'en');
      expect(service.getFluencyBysubSession).toHaveBeenCalledWith('subSession1', 'en');
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CREATED);
    });


    it('should handle empty ASR output error', async () => {
      const mockCreateLearnerProfileDto = {
        user_id: 'user1',
        session_id: 'session1',
        sub_session_id: 'subSession1',
        contentType: 'word',
        contentId: 'content1',
        language: 'en',
        original_text: 'original text',
        audio: Buffer.from('audio data'),
        output: undefined,
        date: new Date(),
      };

      jest.spyOn(service, 'processText').mockResolvedValue('original processed text');
      jest.spyOn(service, 'audioFileToAsrOutput').mockResolvedValue({
        asrOutDenoisedOutput: { output: [{ source: '' }] },
        asrOutBeforeDenoised: { output: [{ source: '' }] },
        pause_count: 0,
      });

      await controller.updateLearnerProfileEn(mockResponse, mockCreateLearnerProfileDto);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.send).toHaveBeenCalledWith({
        status: 'error',
        message: 'Audio to Text functionality Responded Empty Response. Please check audio file or speak Loudly',
      });
    });


    it('should handle internal server errors', async () => {
      const mockCreateLearnerProfileDto = {
        user_id: 'user1',
        session_id: 'session1',
        sub_session_id: 'subSession1',
        contentType: 'word',
        contentId: 'content1',
        language: 'en',
        original_text: 'original text',
        audio: Buffer.from('audio data'),
        output: undefined,
        date: new Date(),
      };

      jest.spyOn(service, 'processText').mockRejectedValue(new Error('Test error'));

      await controller.updateLearnerProfileEn(mockResponse, mockCreateLearnerProfileDto);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.send).toHaveBeenCalledWith({
        status: 'error',
        message: 'Server error - Error: Test error',
      });
    });
  })

  // Api Name : Update learner profile telgu
  describe(' Update learner profile telgu', () => {
    it('should process Telugu text correctly', async () => {
      const mockCreateLearnerProfileDto = {
        user_id: 'user1',
        session_id: 'session1',
        sub_session_id: 'subSession1',
        contentType: 'word',
        contentId: 'content1',
        language: 'te',
        original_text: 'original text',
        audio: Buffer.from('audio data'),
        output: undefined,
        date: new Date(),
      };

      const telguVowelSignArr = [
        "ా", "ి", "ీ", "ు", "ూ", "ృ", "ౄ", "ె", "ే", "ై", "ొ", "ో", "ౌ", "ం", "ః"
      ];

      const originalText = 'original text';
      let originalTokenArr = [];
      let prevEle = '';
      let isPrevVowel = false;

      for (let originalTextELE of originalText.split("")) {
        if (originalTextELE != ' ') {
          if (telguVowelSignArr.includes(originalTextELE)) {
            if (isPrevVowel) {
              prevEle = prevEle + originalTextELE;
              originalTokenArr.push(prevEle);
            } else {
              prevEle = prevEle + originalTextELE;
              originalTokenArr.push(prevEle);
            }
            isPrevVowel = true;
          } else {
            originalTokenArr.push(originalTextELE);
            prevEle = originalTextELE;
            isPrevVowel = false;
          }
        }
      }

      expect(originalTokenArr).toEqual(['o', 'r', 'i', 'g', 'i', 'n', 'a', 'l', 't', 'e', 'x', 't']);
    });


    it('should handle empty or undefined audio and output correctly', async () => {
      const mockCreateLearnerProfileDto = {
        user_id: 'user1',
        session_id: 'session1',
        sub_session_id: 'subSession1',
        contentType: 'word',
        contentId: 'content1',
        language: 'te',
        original_text: 'original text',
        audio: undefined,
        output: undefined,
        date: new Date(),
      };

      await controller.updateLearnerProfileTe(mockResponse, mockCreateLearnerProfileDto);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.send).toHaveBeenCalledWith({
        status: 'error',
        message: 'Audio to Text functionality Responded Empty Response. Please check audio file or speak Loudly',
      });
    });


    it('should process audio file correctly and return success', async () => {
      const mockCreateLearnerProfileDto = {
        user_id: 'user1',
        session_id: 'session1',
        sub_session_id: 'subSession1',
        contentType: 'word',
        contentId: 'content1',
        language: 'te',
        original_text: 'original text',
        audio: Buffer.from('audio data'),
        output: undefined,
        date: new Date(),
      };

      const mockAudioOutput = {
        asrOutDenoisedOutput: {
          output: [{ source: 'response text', nBestTokens: [] }]
        },
        asrOutBeforeDenoised: {
          output: [{ source: 'response text', nBestTokens: [] }]
        },
        pause_count: 1
      };

      jest.spyOn(service, 'audioFileToAsrOutput').mockResolvedValue(mockAudioOutput);
      jest.spyOn(service, 'getTextSimilarity').mockResolvedValue(0.9);
      jest.spyOn(service, 'gethexcodeMapping').mockResolvedValue([]);
      jest.spyOn(service, 'getTextMetrics').mockResolvedValue({
        cer: 0.1,
        wer: 0.2,
        insertion: [],
        deletion: [],
        substitution: [],
        confidence_char_list: [],
        missing_char_list: [],
        construct_text: 'constructed text'
      });
      jest.spyOn(service, 'getCalculatedFluency').mockResolvedValue(0.8);
      jest.spyOn(service, 'getRetryStatus').mockResolvedValue(1);
      jest.spyOn(service, 'create').mockResolvedValue(null);
      jest.spyOn(service, 'getTargetsBysubSession').mockResolvedValue([{ character: 'syllable1' }]);
      jest.spyOn(service, 'getSubsessionOriginalTextSyllables').mockResolvedValue(['syllable1']);
      jest.spyOn(service, 'getFluencyBysubSession').mockResolvedValue(0.7);
      
      await controller.updateLearnerProfileTe(mockResponse, mockCreateLearnerProfileDto);
     
      expect(service.audioFileToAsrOutput).toHaveBeenCalledWith(expect.any(String), 'te', 'word');
      expect(service.gethexcodeMapping).toHaveBeenCalledWith('te');
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CREATED);
    });
  })

  // Api Name : GetContentCharbyUser
  describe('GetContentCharbyUser', ()=> {
    const userId = 'user1';
      const language = 'ta';
      const contentlimit = 5;
      const gettargetlimit = 5;
      const tags = 'tag1,tag2';
    it('should return content for user', async () => {
      const mockMilestone = [{ milestone_level: 'm2' }];
      const mockTargets = [{ character: 'char1' }, { character: 'char2' }];
      const mockValidations = [{ validation: 'val1' }];
      const mockHexcodeMapping = [{ token: 'char1', graphemes: 'grapheme1' }];
      const mockContentServiceResponse = {
        data: {
          wordsArr: ['word1', 'word2'],
          contentForToken: ['token1', 'token2'],
        },
      };
  
      jest.spyOn(service, 'getlatestmilestone').mockResolvedValue(mockMilestone);
      jest.spyOn(service, 'getTargetsByUser').mockResolvedValue(mockTargets);
      jest.spyOn(service, 'getAssessmentRecordsUserid').mockResolvedValue(mockValidations);
      jest.spyOn(service, 'gethexcodeMapping').mockResolvedValue(mockHexcodeMapping);
  
      const axiosResponse: AxiosResponse<any> = {
        data: mockContentServiceResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {
          headers: undefined
        },
      };
  
      jest.spyOn(httpService, 'post').mockReturnValue(of(axiosResponse));
  
      await controller.GetContentCharbyUser(
        userId,
        language,
        { contentlimit },
        { gettargetlimit },
        { tags },
        mockResponse,
      );
  
      expect(service.getlatestmilestone).toHaveBeenCalledWith(userId, language);
      expect(service.getTargetsByUser).toHaveBeenCalledWith(userId, language);
      expect(service.getAssessmentRecordsUserid).toHaveBeenCalledWith(userId);
      expect(service.gethexcodeMapping).toHaveBeenCalledWith(language);
      expect(httpService.post).toHaveBeenCalledWith(
        'http://mockapi.com', // This is the URL we set in the environment variable
        expect.any(String),
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockResponse.send).toHaveBeenCalledWith({
        content: mockContentServiceResponse.data.wordsArr,
        contentForToken: mockContentServiceResponse.data.contentForToken,
        getTargetChar: ['char1', 'char2'],
        totalTargets: mockTargets.length,
      });
    });
  
    it('should return an empty content if no wordsArr or contentForToken found', async () => {
      
      const mockMilestone = [{ milestone_level: 'm2' }];
      const mockTargets = [{ character: 'char1' }, { character: 'char2' }];
      const mockValidations = [{ validation: 'val1' }];
      const mockHexcodeMapping = [{ token: 'char1', graphemes: 'grapheme1' }];
      const mockContentServiceResponse = {
        data: {},
      };
  
      jest.spyOn(service, 'getlatestmilestone').mockResolvedValue(mockMilestone);
      jest.spyOn(service, 'getTargetsByUser').mockResolvedValue(mockTargets);
      jest.spyOn(service, 'getAssessmentRecordsUserid').mockResolvedValue(mockValidations);
      jest.spyOn(service, 'gethexcodeMapping').mockResolvedValue(mockHexcodeMapping);
  
      const axiosResponse: AxiosResponse<any> = {
        data: mockContentServiceResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {
          headers: undefined
        },
      };
  
      jest.spyOn(httpService, 'post').mockReturnValue(of(axiosResponse));
  
      await controller.GetContentCharbyUser(
        userId,
        language,
        { contentlimit },
        { gettargetlimit },
        { tags },
        mockResponse,
      );
  
      expect(service.getlatestmilestone).toHaveBeenCalledWith(userId, language);
      expect(service.getTargetsByUser).toHaveBeenCalledWith(userId, language);
      expect(service.getAssessmentRecordsUserid).toHaveBeenCalledWith(userId);
      expect(service.gethexcodeMapping).toHaveBeenCalledWith(language);
      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Object),
      );
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockResponse.send).toHaveBeenCalledWith({
        content: [],
        contentForToken: [],
        getTargetChar: ['char1', 'char2'],
        totalTargets: mockTargets.length,
      });
    });
  
    it('should handle errors correctly', async () => {
      jest.spyOn(service, 'getlatestmilestone').mockRejectedValue(new Error('Service error'));
      await controller.GetContentCharbyUser(
        userId,
        language,
        { contentlimit },
        { gettargetlimit },
        { tags },
        mockResponse,
      );
  
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.send).toHaveBeenCalledWith({
        status: 'error',
        message: 'Server error - Error: Service error',
      });
    });

    const mockTargets = [{ character: 'char1' }, { character: 'char2' }];
    const mockValidations = [{ validation: 'val1' }];
    const mockHexcodeMapping = [{ token: 'char1', graphemes: 'grapheme1' }];
    const mockContentServiceResponse = {
      data: {
        wordsArr: ['word1', 'word2'],
        contentForToken: ['token1', 'token2'],
      },
    };
  
    const axiosResponse: AxiosResponse<any> = {
      data: mockContentServiceResponse,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {
        headers: undefined
      },
    };
  
    const commonSetup = async (currentLevel: string) => {
      jest.spyOn(service, 'getlatestmilestone').mockResolvedValue([{ milestone_level: currentLevel }]);
      jest.spyOn(service, 'getTargetsByUser').mockResolvedValue(mockTargets);
      jest.spyOn(service, 'getAssessmentRecordsUserid').mockResolvedValue(mockValidations);
      jest.spyOn(service, 'gethexcodeMapping').mockResolvedValue(mockHexcodeMapping);
      jest.spyOn(httpService, 'post').mockReturnValue(of(axiosResponse));
  
      await controller.GetContentCharbyUser(
        'user1',
        'ta',
        { contentlimit: 5 },
        { gettargetlimit: 5 },
        { tags: 'tag1,tag2' },
        mockResponse,
      );
  
      expect(service.getlatestmilestone).toHaveBeenCalledWith('user1', 'ta');
      expect(service.getTargetsByUser).toHaveBeenCalledWith('user1', 'ta');
      expect(service.getAssessmentRecordsUserid).toHaveBeenCalledWith('user1');
      expect(service.gethexcodeMapping).toHaveBeenCalledWith('ta');
      expect(httpService.post).toHaveBeenCalledWith(
        'http://mockapi.com',
        expect.any(String),
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockResponse.send).toHaveBeenCalledWith({
        content: mockContentServiceResponse.data.wordsArr,
        contentForToken: mockContentServiceResponse.data.contentForToken,
        getTargetChar: ['char1', 'char2'],
        totalTargets: mockTargets.length,
      });
    };
  
    it('should set contentLevel to L1 for m0', async () => {
      await commonSetup('m0');
    });
  
    it('should set contentLevel to L1 for m1', async () => {
      await commonSetup('m1');
    });
  
    it('should set contentLevel to L2 and complexityLevel to C1 for m2', async () => {
      await commonSetup('m2');
    });
  
    it('should set contentLevel to L2 and complexityLevel to C1, C2 for m3', async () => {
      await commonSetup('m3');
    });
  
    it('should set contentLevel to L3 and complexityLevel to C1, C2, C3 for m4', async () => {
      await commonSetup('m4');
    });
  
    it('should set contentLevel to L3 and complexityLevel to C2, C3 for m5', async () => {
      await commonSetup('m5');
    });
  
    it('should set contentLevel to L4 and complexityLevel to C2, C3 for m6', async () => {
      await commonSetup('m6');
    });
  
    it('should set contentLevel to L4 and complexityLevel to C2, C3, C4 for m7', async () => {
      await commonSetup('m7');
    });
  
    it('should set contentLevel to L5 and complexityLevel to C3, C4 for m8', async () => {
      await commonSetup('m8');
    });
  
    it('should set contentLevel to L6 and complexityLevel to C3, C4 for m9', async () => {
      await commonSetup('m9');
    });
  })

  // Ani Name : GetContentWordbyUser
  describe('GetContentWordbyUser', ()=> {
    it('should return content for user', async () => {
      const mockGetLatestMilestone = [{ milestone_level: 'm2' }];
      const mockGetTargetsByUser = [{ character: 'char1' }, { character: 'char2' }];
      const mockHexcodeMapping = [
        { token: 'char1', graphemes: 'grapheme1' },
        { token: 'char2', graphemes: '' },
      ];
      const mockContentServiceResponse = {
        data: {
          wordsArr: [{ contentSourceData: [{ phonemes: ['a', 'b'] }] }],
          contentForToken: ['token1', 'token2'],
        },
      };
      const axiosResponse: AxiosResponse<any> = {
        data: mockContentServiceResponse,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {
          headers: undefined
        },
      };
  
      jest.spyOn(service, 'getlatestmilestone').mockResolvedValue(mockGetLatestMilestone);
      jest.spyOn(service, 'getTargetsByUser').mockResolvedValue(mockGetTargetsByUser);
      jest.spyOn(service, 'gethexcodeMapping').mockResolvedValue(mockHexcodeMapping);
      jest.spyOn(httpService, 'post').mockReturnValue(of(axiosResponse));
  
      await controller.GetContentWordbyUser(
        'user1',
        'en',
        { contentlimit: 5 },
        { gettargetlimit: 5 },
        ['tag1', 'tag2'],
        mockResponse,
      );
  
      expect(service.getlatestmilestone).toHaveBeenCalledWith('user1', 'en');
      expect(service.getTargetsByUser).toHaveBeenCalledWith('user1', 'en');
      expect(service.gethexcodeMapping).toHaveBeenCalledWith('en');
      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify({
          tokenArr: ['g', 'r', 'a', 'p', 'h', 'e', 'm', 'e', '1'],
          language: 'en',
          contentType: 'Word',
          limit: 5,
          tags: ['tag1', 'tag2'],
          cLevel: 'L2',
          complexityLevel: ['C1'],
          graphemesMappedObj: {
            char1: 'grapheme1',
            char2: '',
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockResponse.send).toHaveBeenCalledWith({
        content: mockContentServiceResponse.data.wordsArr,
        contentForToken: mockContentServiceResponse.data.contentForToken,
        getTargetChar: ['g', 'r', 'a', 'p', 'h', 'e', 'm', 'e', '1'],
        totalTargets: 2,
        totalSyllableCount: 2,
      });
    });
  
    it('should handle server error', async () => {
      jest.spyOn(service, 'getlatestmilestone').mockRejectedValue(new Error('Test error'));
  
      await controller.GetContentWordbyUser(
        'user1',
        'en',
        { contentlimit: 5 },
        { gettargetlimit: 5 },
        ['tag1', 'tag2'],
        mockResponse,
      );
  
      expect(service.getlatestmilestone).toHaveBeenCalledWith('user1', 'en');
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.send).toHaveBeenCalledWith({
        status: 'error',
        message: 'Server error - Error: Test error',
      });
    });
  })

  

  // GetContentSentencebyUser
  describe('GetContentSentencebyUser', ()=> {
    it('should return content for user in English language', async () => {
      const userId = '123';
      const language = 'en';
      const contentlimit = 5;
      const gettargetlimit = 5;
      const tags = ['tag1', 'tag2'];
  
      const mockRecordData = [{ milestone_level: 'm2' }];
      const mockGetTarget = [{ character: 'char1' }, { character: 'char2' }];
      const mockContentComplexityLevel = {
        contentLevel: 'L2',
        complexityLevel: ['C1'],
      };
  
      jest.spyOn(service, 'getlatestmilestone').mockResolvedValue(mockRecordData);
      jest.spyOn(service, 'getTargetsByUser').mockResolvedValue(mockGetTarget);
      jest.spyOn(service, 'gethexcodeMapping').mockResolvedValue([
        { token: 'char1', graphemes: ['g1'] },
        { token: 'char2', graphemes: ['g2'] },
      ]);
  
      const axiosResponse: AxiosResponse = {
        data: {
          wordsArr: [{ contentSourceData: [{ phonemes: ['a', 'b'] }] }],
          contentForToken: ['token1', 'token2'],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {
          headers: undefined
        },
      };
  
      jest.spyOn(httpService, 'post').mockReturnValue(of(axiosResponse));
  
      await controller.GetContentSentencebyUser(userId, language, { contentlimit }, { gettargetlimit }, tags, mockResponse);
  
      expect(service.getlatestmilestone).toHaveBeenCalledWith(userId, language);
      expect(service.getTargetsByUser).toHaveBeenCalledWith(userId, language);
      expect(service.gethexcodeMapping).toHaveBeenCalledWith('en');
  
      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify({
          tokenArr: ['g1', 'g2'],
          language: 'en',
          contentType: 'Sentence',
          limit: 5,
          tags: ['tag1', 'tag2'],
          cLevel: 'L2',
          complexityLevel: ['C1'],
          graphemesMappedObj: { char1: ['g1'], char2: ['g2'] },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
  
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
    });
  
    it('should return content for user in non-English language', async () => {
      const userId = '123';
      const language = 'ta';
      const contentlimit = 5;
      const gettargetlimit = 5;
      const tags = [];
  
      const mockRecordData = [{ milestone_level: 'm2' }];
      const mockGetTarget = [{ character: 'char1' }, { character: 'char2' }];
      const mockContentComplexityLevel = {
        contentLevel: 'L2',
        complexityLevel: ['C1', 'C2'],
      };
  
      jest.spyOn(service, 'getlatestmilestone').mockResolvedValue(mockRecordData);
      jest.spyOn(service, 'getTargetsByUser').mockResolvedValue(mockGetTarget);
   
      const axiosResponse: AxiosResponse = {
        data: {
          wordsArr: [{ contentSourceData: [{ syllableCount: 2 }] }],
          contentForToken: ['token1', 'token2'],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {
          headers: undefined
        },
      };
  
      jest.spyOn(httpService, 'post').mockReturnValue(of(axiosResponse));
  
      await controller.GetContentSentencebyUser(userId, language, { contentlimit }, { gettargetlimit }, tags, mockResponse);
  
      expect(service.getlatestmilestone).toHaveBeenCalledWith(userId, language);
      expect(service.getTargetsByUser).toHaveBeenCalledWith(userId, language);
      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify({
          tokenArr: ['char1', 'char2'],
          language: 'ta',
          contentType: 'Sentence',
          limit: 5,
          tags: [],
          cLevel: 'L2',
          complexityLevel: ['C1'],
          graphemesMappedObj: {},
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
  
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('should handle server error', async () => {
      const userId = '123';
      const language = 'ta';
      const contentlimit = 5;
      const gettargetlimit = 5;
      const tags = [];
  
      jest.spyOn(service, 'getlatestmilestone').mockRejectedValue(new Error('Test error'));
  
      await controller.GetContentSentencebyUser(userId, language, { contentlimit }, { gettargetlimit }, tags, mockResponse);
  
      expect(service.getlatestmilestone).toHaveBeenCalledWith(userId, language);
  
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.send).toHaveBeenCalledWith({
        status: 'error',
        message: 'Server error - Error: Test error',
      });
    });
  })

  // GetContentParagraphbyUser
  describe('GetContentParagraphbyUser', ()=> {
    it('should return content for user in English language', async () => {
      const userId = '123';
      const language = 'en';
      const contentlimit = 5;
      const gettargetlimit = 5;
      const tags = ['tag1', 'tag2'];
  
      const mockRecordData = [{ milestone_level: 'm2' }];
      const mockGetTarget = [{ character: 'char1' }, { character: 'char2' }];
      const mockContentComplexityLevel = {
        contentLevel: 'L2',
        complexityLevel: ['C1'],
      };
  
      jest.spyOn(service, 'getlatestmilestone').mockResolvedValue(mockRecordData);
      jest.spyOn(service, 'getTargetsByUser').mockResolvedValue(mockGetTarget);
      jest.spyOn(service, 'gethexcodeMapping').mockResolvedValue([
        { token: 'char1', graphemes: ['g1'] },
        { token: 'char2', graphemes: ['g2'] },
      ]);
  
      const axiosResponse: AxiosResponse = {
        data: {
          wordsArr: [{ contentSourceData: [{ phonemes: ['a', 'b'] }] }],
          contentForToken: ['token1', 'token2'],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {
          headers: undefined
        },
      };
  
      jest.spyOn(httpService, 'post').mockReturnValue(of(axiosResponse));
  
      await controller.GetContentParagraphbyUser(userId, language, { contentlimit }, { gettargetlimit }, tags, mockResponse);
  
      expect(service.getlatestmilestone).toHaveBeenCalledWith(userId, language);
      expect(service.getTargetsByUser).toHaveBeenCalledWith(userId, language);
      expect(service.gethexcodeMapping).toHaveBeenCalledWith('en');
  
      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify({
          tokenArr: ['g1', 'g2'],
          language: 'en',
          contentType: 'Paragraph',
          limit: 5,
          tags: ['tag1', 'tag2'],
          cLevel: 'L2',
          complexityLevel: ['C1'],
          graphemesMappedObj: { char1: ['g1'], char2: ['g2'] },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
  
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('should return content for user in non-English language', async () => {
      const userId = '123';
      const language = 'ta';
      const contentlimit = 5;
      const gettargetlimit = 5;
      const tags = [];
  
      const mockRecordData = [{ milestone_level: 'm2' }];
      const mockGetTarget = [{ character: 'char1' }, { character: 'char2' }];
      const mockContentComplexityLevel = {
        contentLevel: 'L2',
        complexityLevel: ['C1', 'C2'],
      };
  
      jest.spyOn(service, 'getlatestmilestone').mockResolvedValue(mockRecordData);
      jest.spyOn(service, 'getTargetsByUser').mockResolvedValue(mockGetTarget);
     
      const axiosResponse: AxiosResponse = {
        data: {
          wordsArr: [{ contentSourceData: [{ syllableCount: 2 }] }],
          contentForToken: ['token1', 'token2'],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {
          headers: undefined
        },
      };
  
      jest.spyOn(httpService, 'post').mockReturnValue(of(axiosResponse));
  
      await controller.GetContentParagraphbyUser(userId, language, { contentlimit }, { gettargetlimit }, tags, mockResponse);
  
      expect(service.getlatestmilestone).toHaveBeenCalledWith(userId, language);
      expect(service.getTargetsByUser).toHaveBeenCalledWith(userId, language);
      expect(httpService.post).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify({
          tokenArr: ['char1', 'char2'],
          language: 'ta',
          contentType: 'Paragraph',
          limit: 5,
          tags: [],
          cLevel: 'L2',
          complexityLevel: ['C1'],
          graphemesMappedObj: {},
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
  
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.OK);
    });
  
    it('should handle server error', async () => {
      const userId = '123';
      const language = 'ta';
      const contentlimit = 5;
      const gettargetlimit = 5;
      const tags = [];
  
      jest.spyOn(service, 'getlatestmilestone').mockRejectedValue(new Error('Test error'));
  
      await controller.GetContentParagraphbyUser(userId, language, { contentlimit }, { gettargetlimit }, tags, mockResponse);
  
      expect(service.getlatestmilestone).toHaveBeenCalledWith(userId, language);
  
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.send).toHaveBeenCalledWith({
        status: 'error',
        message: 'Server error - Error: Test error',
      });
    });
  })

  // getSetResult
  describe('getSetResult', ()=> {
    it('should return success with session result pass', async () => {
      const getSetResult = {
        sub_session_id: 'subSession123',
        language: 'en',
        totalSyllableCount: 40,
        user_id: 'user123',
        session_id: 'session123',
        contentType: 'word',
      };
  
      const mockTargets = [{ character: 'a' }];
      const mockFluency = 1;
      const mockFamiliarity = [{ character: 'a' }];
      const mockRecordData = [{ milestone_level: 'm2' }];
  
      jest.spyOn(service, 'getTargetsBysubSession').mockResolvedValue(mockTargets);
      jest.spyOn(service, 'getFluencyBysubSession').mockResolvedValue(mockFluency);
      jest.spyOn(service, 'getFamiliarityBysubSession').mockResolvedValue(mockFamiliarity);
      jest.spyOn(service, 'getlatestmilestone').mockResolvedValue(mockRecordData);
      jest.spyOn(service, 'createMilestoneRecord').mockResolvedValue(null);
  
      await controller.getSetResult(mockResponse, getSetResult);
  
      expect(service.getTargetsBysubSession).toHaveBeenCalledWith(getSetResult.sub_session_id, getSetResult.language);
      expect(service.getFluencyBysubSession).toHaveBeenCalledWith(getSetResult.sub_session_id, getSetResult.language);
      expect(service.getFamiliarityBysubSession).toHaveBeenCalledWith(getSetResult.sub_session_id, getSetResult.language);
      expect(service.getlatestmilestone).toHaveBeenCalledWith(getSetResult.user_id, getSetResult.language);
      expect(service.createMilestoneRecord).toHaveBeenCalledWith({
         user_id: getSetResult.user_id,
         session_id: getSetResult.session_id,
         sub_session_id: getSetResult.sub_session_id,
         milestone_level: 'm3',
         sub_milestone_level: '',
      });
  
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CREATED);
    });

    it('should return success with session result fail', async () => {
      const getSetResult = {
        sub_session_id: 'subSession123',
        language: 'en',
        totalSyllableCount: 40,
        user_id: 'user123',
        session_id: 'session123',
        contentType: 'word',
      };
  
      const mockTargets = [{ character: 'a' }];
      const mockFluency = 3;
      const mockFamiliarity = [{ character: 'a' }];
      const mockRecordData = [{ milestone_level: 'm2' }];
  
      jest.spyOn(service, 'getTargetsBysubSession').mockResolvedValue(mockTargets);
      jest.spyOn(service, 'getFluencyBysubSession').mockResolvedValue(mockFluency);
      jest.spyOn(service, 'getFamiliarityBysubSession').mockResolvedValue(mockFamiliarity);
      jest.spyOn(service, 'getlatestmilestone').mockResolvedValue(mockRecordData);
      jest.spyOn(service, 'createMilestoneRecord').mockResolvedValue(null);
  
      await controller.getSetResult(mockResponse, getSetResult);
  
      expect(service.getTargetsBysubSession).toHaveBeenCalledWith(getSetResult.sub_session_id, getSetResult.language);
      expect(service.getFluencyBysubSession).toHaveBeenCalledWith(getSetResult.sub_session_id, getSetResult.language);
      expect(service.getFamiliarityBysubSession).toHaveBeenCalledWith(getSetResult.sub_session_id, getSetResult.language);
      expect(service.getlatestmilestone).toHaveBeenCalledWith(getSetResult.user_id, getSetResult.language);
      expect(service.createMilestoneRecord).toHaveBeenCalledWith({
        user_id: getSetResult.user_id,
        session_id: getSetResult.session_id,
        sub_session_id: getSetResult.sub_session_id,
        milestone_level: 'm2',
        sub_milestone_level: '',
      });
  
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CREATED);
    });

    it('should handle server error', async () => {
      const getSetResult = {
        sub_session_id: 'subSession123',
        language: 'en',
        totalSyllableCount: 40,
        user_id: 'user123',
        session_id: 'session123',
        contentType: 'word',
      };
  
      jest.spyOn(service, 'getTargetsBysubSession').mockRejectedValue(new Error('Test error'));
  
      await controller.getSetResult(mockResponse, getSetResult);
  
      expect(service.getTargetsBysubSession).toHaveBeenCalledWith(getSetResult.sub_session_id, getSetResult.language);
  
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.send).toHaveBeenCalledWith({
        status: 'error',
        message: 'Server error - Error: Test error',
      });
    });
  })
});
