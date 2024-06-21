import { Test, TestingModule } from '@nestjs/testing';
import { ScoresController } from './scores.controller';
import { ScoresService } from './scores.service';
import { getModelToken } from '@nestjs/mongoose';
import { CacheService } from './cache/cache.service';
import { HttpService } from '@nestjs/axios';
import { HttpStatus, INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { CreateLearnerProfileDto } from './dto/CreateLearnerProfile.dto';


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

  // Update Learner profile ta

  // describe('updateLearnerProfile', () => {
  //   it('should successfully update the learner profile', async () => {
  //     const updateProfileDto: CreateLearnerProfileDto = {
  //       original_text: 'இப்பாடலின்',
  //       user_id: '9054461392',
  //       session_id: 'gQG5rPPquMWhmfVBzP6ajFkl5fvjWG6n',
  //       language: 'ta',
  //       sub_session_id: 'UJoRJ7sbVnvT0QGVeTsJwAp4wa5FSmNA',
  //       contentId: '42d02538-0326-4f56-9dec-d49b6fb017ce',
  //       contentType: 'Word',
  //       audio: Buffer.from(''),
  //       output: [],
  //       date: undefined
  //     };

  //     const expectedResponse = {
  //       status: "success",
  //       msg: "Successfully stored data to learner profile",
  //       responseText: "ஈ பாடலேந்",
  //       subsessionTargetsCount: 8,
  //       subsessionFluency: 1.1
  //     };

  //     // Mock all service methods used in updateLearnerProfile
  //     jest.spyOn(service, 'getSyllablesFromString').mockResolvedValue([])
  //     jest.spyOn(service, 'audioFileToAsrOutput').mockResolvedValue({
  //       asrOutDenoisedOutput: { output: [{ source: 'sourceText' }] },
  //       asrOutBeforeDenoised: { output: [{ source: 'sourceText' }] },
  //       pause_count: 0,
  //     });
  //     jest.spyOn(service, 'getTextSimilarity').mockResolvedValue(1);
  //     jest.spyOn(service, 'getSyllablesFromString').mockResolvedValue(['syllable1']);
  //     jest.spyOn(service, 'gethexcodeMapping').mockResolvedValue([]);
  //     jest.spyOn(service, 'getConstructedText').mockResolvedValue({
  //       constructText: 'constructedText',
  //       reptitionCount: 0,
  //     });
  //     jest.spyOn(service, 'identifyTokens').mockResolvedValue({
  //       confidence_scoresArr: [],
  //       missing_token_scoresArr: [],
  //       anomaly_scoreArr: [],
  //     });
  //     jest.spyOn(service, 'getTextMetrics').mockResolvedValue({
  //       cer: 0,
  //       wer: 0,
  //       insertion: [],
  //       deletion: [],
  //       substitution: [],
  //     });
  //     jest.spyOn(service, 'getCalculatedFluency').mockResolvedValue(1.1);
  //     jest.spyOn(service, 'addDenoisedOutputLog').mockResolvedValue({});
  //     jest.spyOn(service, 'create').mockResolvedValue({});
  //     jest.spyOn(service, 'getRetryStatus').mockResolvedValue(1);
  //     jest.spyOn(service, 'getTargetsBysubSession').mockResolvedValue([]);
  //     jest.spyOn(service, 'getFluencyBysubSession').mockResolvedValue(1.1);

  //     const response = await request(app.getHttpServer())
  //       .post('/scores/updateLearnerProfile/ta')
  //       .send(updateProfileDto)
  //       .expect(HttpStatus.INTERNAL_SERVER_ERROR);

  //     console.log(response.body);
      
  //     expect(response.body).toEqual(expectedResponse);
  //   });

  //   it('should handle validation errors', async () => {
  //     const invalidUpdateProfileDto = {
  //       original_text: '',
  //       user_id: '',
  //       session_id: '',
  //       language: '',
  //       sub_session_id: '',
  //       contentId: '',
  //       contentType: '',
  //       audio: Buffer.from(''),
  //       date: '',
  //       output: []
  //     };

  //     const response = await request(app.getHttpServer())
  //       .post('/scores/updateLearnerProfile/ta')
  //       .send(invalidUpdateProfileDto)
  //       .expect(HttpStatus.BAD_REQUEST);

  //     expect(response.body.statusCode).toBe(HttpStatus.BAD_REQUEST);
  //   });
  // });


  // Api Name : 
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

      jest.spyOn(service, 'getlatestmilestone').mockImplementation((userId, language) => {
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
        // Missing required fields
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
});
