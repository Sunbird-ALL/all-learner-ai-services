import { HttpException, Inject, Injectable } from '@nestjs/common';
import { ScoreDocument } from './schemas/scores.schema';
import { hexcodeMappingDocument } from './schemas/hexcodeMapping.schema';
import { assessmentInputDocument } from './schemas/assessmentInput.schema';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
import { catchError, lastValueFrom, map } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { CacheService } from './cache/cache.service';
import lang_common_config from './config/language/common/commonConfig';
import * as splitGraphemes from 'split-graphemes';
import { llmOutputLogsDocument } from './schemas/llmOutputLogs';
import { getSetResult, getSetResultDocument } from './schemas/getSetResult';
import { filterBadWords } from '@tekdi/multilingual-profanity-filter';
import { TowreDocument } from 'src/schemas/towre.schema';
import { VocabularyDocument } from './schemas/vocabularySchema';
import { correct_practice_word, correct_practice_wordDocument } from '../schemas/correctPractice';
import { AssessmentTrackingDocument, AssessmentTrackingScoreDetailDocument, EvaluationType } from './schemas/assessment-tracking.schema';
import { CreateAssessmentTrackingDto } from './dto/create-assessment-tracking.dto';
import { randomUUID } from 'crypto';
import {
  buildErrorPayload,
  buildHttpExceptionFromUnknown,
  ErrorCodes,
  mapAxiosToUpstreamHttpException,
} from 'src/common/exceptions/api.exceptions';
import {
  FluencyClassification,
  ProsodyClassification,
  SessionResult,
  SUPPORTED_LANGUAGES,
} from 'src/common/enums/scores.enum';

@Injectable()
export class ScoresService {
  constructor(
    @InjectModel('Score') private readonly scoreModel: Model<ScoreDocument>,
    @InjectModel('hexcodeMapping')
    private readonly hexcodeMappingModel: Model<hexcodeMappingDocument>,
    @InjectModel('assessmentInput')
    private readonly assessmentInputModel: Model<assessmentInputDocument>,
    @InjectModel('llmOutputLogs')
    private readonly llmOutputLogsModel: Model<llmOutputLogsDocument>,
    @InjectModel('getSetResult')
    private readonly getSetResultModel: Model<getSetResultDocument>,
    @InjectModel('towre')
    private towreModel: Model<TowreDocument>,
    @InjectModel('vocabulary')
    private vocabularyModel: Model<VocabularyDocument>,
    @InjectModel('correct_practice_word')
    private correctPracticeWordModel: Model<correct_practice_wordDocument>,
    @InjectModel('AssessmentTracking')
    private readonly assessmentTrackingModel: Model<AssessmentTrackingDocument>,
    @InjectModel('AssessmentTrackingScoreDetail')
    private readonly assessmentTrackingScoreDetailModel: Model<AssessmentTrackingScoreDetailDocument>,
    private readonly cacheService: CacheService,
    private readonly httpService: HttpService,
  ) { }

  async create(createScoreDto: any): Promise<any> {
    try {
      return await this.scoreModel.updateOne(
        { user_id: createScoreDto.user_id },
        {
          $push: { sessions: createScoreDto.session },
          $setOnInsert: { user_id: createScoreDto.user_id },
        },
        { upsert: true },
      );
    } catch (err) {
      throw buildHttpExceptionFromUnknown(err);
    }
  }

  async createMilestoneRecord(createMilestoneRecord: any, knownCurrentMilestoneLevel?: string): Promise<any> {
    try {
      let milestoneToSet = createMilestoneRecord.milestone_level;

      if (createMilestoneRecord.language) {
        const currentMilestone = knownCurrentMilestoneLevel !== undefined
          ? knownCurrentMilestoneLevel
          : (await this.getlatestmilestone(
              createMilestoneRecord.user_id,
              createMilestoneRecord.language,
            ))[0]?.milestone_level;

        if (currentMilestone) {
          const getMilestoneNum = (level: string): number => {
            if (!level) return -1;
            if (level === 'B') return 0;
            if (level.startsWith('m')) {
              const num = parseInt(level.replace('m', ''), 10);
              return isNaN(num) ? -1 : num;
            }
            return -1;
          };

          const currentLevelNum = getMilestoneNum(currentMilestone);
          const newLevelNum = getMilestoneNum(milestoneToSet);

          // If new milestone is lower than current, prevent downgrade
          if (newLevelNum >= 0 && currentLevelNum >= 0 && newLevelNum < currentLevelNum) {
            console.log(
              `Milestone downgrade prevented: User ${createMilestoneRecord.user_id} is at ${currentMilestone}, ` +
              `attempted to set ${milestoneToSet}. Keeping ${currentMilestone}.`
            );
            milestoneToSet = currentMilestone;
          }
        }
      }

      const insertData = {
        session_id: createMilestoneRecord.session_id,
        sub_session_id: createMilestoneRecord.sub_session_id,
        milestone_level: milestoneToSet,
        sub_milestone_level: createMilestoneRecord.sub_milestone_level,
        language: createMilestoneRecord.language || null,
        createdAt: new Date().toISOString().replace('Z', '+00:00'),
      };

      const updatedRecordData = await this.scoreModel.updateOne(
        { user_id: createMilestoneRecord.user_id },
        {
          $push: {
            milestone_progress: insertData,
          },
        },
      );

      // Return both the update result and the actual milestone that was saved
      return {
        ...updatedRecordData,
        savedMilestoneLevel: milestoneToSet,
      };
    } catch (err) {
      throw buildHttpExceptionFromUnknown(err);
    }
  }

  async audioFileToAsrOutput(
    data: any,
    language: string,
    contentType: string,
  ): Promise<any> {
    let asrOutBeforeDenoised: any;
    let audio: any = data;
    let pause_count: number = 0;
    let avg_pause: number = 0;
    let pitch_classification: any;
    let pitch_mean: number = 0;
    let pitch_std: number = 0;
    let intensity_classification: any;
    let intensity_mean: number = 0;
    let intensity_std: number = 0;
    let expression_classification: any;
    let smoothness_classification: any;

    let serviceId = '';
    switch (language) {
      case 'kn':
        serviceId = 'ai4bharat/conformer-multilingual-all--gpu-t4';
        break;
      case 'ta':
        serviceId = 'ai4bharat/conformer-multilingual-dravidian--gpu-t4';
        break;
      case 'en':
        serviceId = 'ai4bharat/whisper--gpu-t4';
        break;
      case 'hi':
        serviceId = 'ai4bharat/conformer-multilingual-all--gpu-t4';
        break;
      case 'gu':
        serviceId = 'ai4bharat/conformer-gujarati--gpu-t4';
        break;
      case 'te':
        serviceId = 'ai4bharat/conformer-multilingual-dravidian--gpu-t4';
        break;
      case 'or':
        serviceId = 'ai4bharat/conformer-multilingual-indo-aryan--gpu-t4';
        break;
      default:
        serviceId = `ai4bharat/conformer-${language}-gpu--t4`;
    }

    asrOutBeforeDenoised = await asrCall();

    const denoiserConfig = {
      method: 'post',
      url: process.env.ALL_TEXT_EVAL_API + '/audio_processing',
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        base64_string: audio,
        enableDenoiser: process.env.denoiserEnabled === 'true' ? true : false,
        enablePauseCount: true,
        contentType: contentType,
        enable_prosody_fluency: true,
      },
    };

    try {
      const denoiserResponse = await axios.request(denoiserConfig);
      audio = denoiserResponse.data.denoised_audio_base64;
      pause_count = denoiserResponse.data.pause_count;
      avg_pause = denoiserResponse.data.avg_pause;
      pitch_classification = denoiserResponse.data.pitch_classification;
      pitch_mean = denoiserResponse.data.pitch_mean;
      pitch_std = denoiserResponse.data.pitch_std;
      intensity_classification = denoiserResponse.data.intensity_classification;
      intensity_mean = denoiserResponse.data.intensity_mean;
      intensity_std = denoiserResponse.data.intensity_std;
      expression_classification = denoiserResponse.data.expression_classification;
      smoothness_classification = denoiserResponse.data.smoothness_classification;
    } catch (error) {
      const { status, body } = buildErrorPayload(error);
      throw new HttpException(
        {
          ...body,
          code: ErrorCodes.TEXT_EVAL_AUDIO_PROCESSING_FAILED,
          message:
            'Text evaluation service could not run audio processing (denoiser / prosody pipeline).',
          upstream: 'text-eval',
        },
        status,
      );
    }

    async function asrCall() {
      const optionsObj = {
        config: {
          serviceId: serviceId,
          language: {
            sourceLanguage: language,
          },
          audioFormat: 'wav',
          transcriptionFormat: {
            value: 'transcript',
          },
          bestTokenCount: 2,
        },
        audio: [
          {
            audioContent: audio,
          },
        ],
      };

      if (language === 'en') {
        delete optionsObj.config.bestTokenCount;
      }

      const options = JSON.stringify(optionsObj);

      const config = {
        method: 'post',
        url: process.env.AI4BHARAT_URL,
        headers: {
          'Content-Type': 'application/json',
          Authorization: process.env.AI4BHARAT_API_KEY,
        },
        data: options,
      };

      try {
        const asrResponse = await axios.request(config);
        return asrResponse.data;
      } catch (error) {
        const { status, body } = buildErrorPayload(error);
        throw new HttpException(
          {
            ...body,
            code: ErrorCodes.AI4BHARAT_UNAVAILABLE,
            message:
              'Speech recognition (AI4Bharat) is unavailable or failed to transcribe audio.',
            upstream: 'ai4bharat',
          },
          status,
        );
      }
    }

    return {
      asrOutBeforeDenoised: asrOutBeforeDenoised,
      pause_count: pause_count,
      avg_pause: avg_pause,
      pitch_classification: pitch_classification,
      pitch_mean: pitch_mean,
      pitch_std: pitch_std,
      intensity_classification: intensity_classification,
      intensity_mean: intensity_mean,
      intensity_std: intensity_std,
      expression_classification: expression_classification,
      smoothness_classification: smoothness_classification,
    };
  }

  async findAll(): Promise<any> {
    const recordData = await this.scoreModel.find().exec();
    return recordData;
  }

  findOne(id: number) {
    return `This action returns a #${id} score`;
  }

  async findbySession(id: string) {
    const UserRecordData = await this.scoreModel
      .find({
        sessions: {
          $elemMatch: {
            session_id: id,
          },
        },
      })
      .exec();
    return UserRecordData;
  }

  async findbyUser(id: string) {
    const UserRecordData = await this.scoreModel.find({ user_id: id }).exec();
    return UserRecordData;
  }

  // Target Query
  async getTargetsBySession(sessionId: string, language: string) {
    const threshold = 0.7;
    let RecordData = [];

    RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          sessions: {
            $elemMatch: { session_id: sessionId, language: language },
          },
        },
      },
      {
        $unwind: '$sessions',
      },
      {
        $match: {
          'sessions.session_id': sessionId,
          'sessions.language': language,
        },
      },
      {
        $facet: {
          confidenceScores: [
            {
              $unwind: '$sessions.confidence_scores',
            },
            {
              $project: {
                _id: 0,
                date: '$sessions.createdAt',
                session_id: '$sessions.session_id',
                character: '$sessions.confidence_scores.token',
                score: '$sessions.confidence_scores.confidence_score',
              },
            },
            {
              $sort: {
                date: -1,
              },
            },
          ],
          missingTokenScores: [
            {
              $unwind: '$sessions.missing_token_scores',
            },
            {
              $project: {
                _id: 0,
                session_id: '$sessions.session_id',
                date: '$sessions.createdAt',
                character: '$sessions.missing_token_scores.token',
                score: '$sessions.missing_token_scores.confidence_score',
              },
            },
            {
              $sort: {
                date: -1,
              },
            },
          ],
        },
      },
      {
        $project: {
          combinedResults: {
            $concatArrays: ['$confidenceScores', '$missingTokenScores'],
          },
        },
      },
      {
        $unwind: '$combinedResults',
      },
      {
        $replaceRoot: {
          newRoot: '$combinedResults',
        },
      },
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
      {
        $sort: {
          date: -1,
        },
      },
      {
        $group: {
          _id: {
            token: '$token',
          },
          scores: {
            $push: '$score',
          },
        },
      },
      {
        $project: {
          _id: 0,
          character: '$_id.token',
          latestScores: {
            $slice: ['$scores', -5],
          },
        },
      },
      {
        $addFields: {
          countBelowThreshold: {
            $size: {
              $filter: {
                input: '$latestScores',
                as: 'score',
                cond: {
                  $lt: ['$$score', threshold],
                },
              },
            },
          },
          countAboveThreshold: {
            $size: {
              $filter: {
                input: '$latestScores',
                as: 'score',
                cond: {
                  $gte: ['$$score', threshold],
                },
              },
            },
          },
        },
      },
      {
        $match: {
          $expr: {
            $gt: ['$countBelowThreshold', '$countAboveThreshold'],
          },
        },
      },
    ]);

    return RecordData;
  }

  async getTargetsBysubSession(
    userId: string,
    subSessionId: string,
    language: string,
  ) {
    const threshold = 0.7;
    let RecordData = [];

    RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          user_id: userId,
        },
      },
      // Pre-filter sessions array before $unwind to avoid exploding the entire sessions array.
      {
        $project: {
          sessions: {
            $filter: {
              input: '$sessions',
              as: 's',
              cond: {
                $and: [
                  { $eq: ['$$s.sub_session_id', subSessionId] },
                  { $eq: ['$$s.language', language] },
                ],
              },
            },
          },
        },
      },
      {
        $unwind: '$sessions',
      },
      {
        $facet: {
          confidenceScores: [
            {
              $unwind: '$sessions.confidence_scores',
            },
            {
              $project: {
                _id: 0,
                date: '$sessions.createdAt',
                session_id: '$sessions.session_id',
                character: '$sessions.confidence_scores.token',
                score: '$sessions.confidence_scores.confidence_score',
              },
            },
            {
              $sort: {
                date: -1,
              },
            },
          ],
          missingTokenScores: [
            {
              $unwind: '$sessions.missing_token_scores',
            },
            {
              $project: {
                _id: 0,
                session_id: '$sessions.session_id',
                date: '$sessions.createdAt',
                character: '$sessions.missing_token_scores.token',
                score: '$sessions.missing_token_scores.confidence_score',
              },
            },
            {
              $sort: {
                date: -1,
              },
            },
          ],
        },
      },
      {
        $project: {
          combinedResults: {
            $concatArrays: ['$confidenceScores', '$missingTokenScores'],
          },
        },
      },
      {
        $unwind: '$combinedResults',
      },
      {
        $replaceRoot: {
          newRoot: '$combinedResults',
        },
      },
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
      {
        $sort: {
          date: -1,
        },
      },
      {
        $group: {
          _id: {
            token: '$token',
          },
          scores: {
            $push: '$score',
          },
        },
      },
      {
        $project: {
          _id: 0,
          character: '$_id.token',
          latestScores: {
            $slice: ['$scores', -5],
          },
        },
      },
      {
        $addFields: {
          countBelowThreshold: {
            $size: {
              $filter: {
                input: '$latestScores',
                as: 'score',
                cond: {
                  $lt: ['$$score', threshold],
                },
              },
            },
          },
          countAboveThreshold: {
            $size: {
              $filter: {
                input: '$latestScores',
                as: 'score',
                cond: {
                  $gte: ['$$score', threshold],
                },
              },
            },
          },
        },
      },
      {
        $match: {
          $expr: {
            $gt: ['$countBelowThreshold', '$countAboveThreshold'],
          },
        },
      },
    ]);

    // Get All hexcode for this selected language
    let tokenHexcodeDataArr = await this.gethexcodeMapping(language);

    const tokenMap = new Map();

    // Map token to its isCommon and indexNo properties
    tokenHexcodeDataArr.forEach((tokenObj: any) => {
      tokenMap.set(tokenObj.token, {
        isCommon: tokenObj.isCommon,
        indexNo: tokenObj.indexNo,
      });
    });

    const commonTargets: any[] = [];
    const nonCommonTargets: any[] = [];

    RecordData.forEach((target: any) => {
      const tokenInfo = tokenMap.get(target.character);

      if (tokenInfo && tokenInfo.isCommon) {
        commonTargets.push({ ...target, indexNo: tokenInfo.indexNo });
      } else {
        nonCommonTargets.push(target);
      }
    });

    // Sort common targets by indexNo
    commonTargets.sort((a: any, b: any) => a.indexNo - b.indexNo);
    return [...commonTargets, ...nonCommonTargets];
  }

  async getTargetsByUser(userId: string, language: string = null) {
    const threshold = 0.7;
    let RecordData = [];

    RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          user_id: userId,
        },
      },
      {
        $unwind: '$sessions',
      },
      {
        $match: {
          'sessions.language': language,
        },
      },
      {
        $facet: {
          confidenceScores: [
            {
              $unwind: '$sessions.confidence_scores',
            },
            {
              $project: {
                _id: 0,
                date: '$sessions.createdAt',
                character: '$sessions.confidence_scores.token',
                score: '$sessions.confidence_scores.confidence_score',
              },
            },
            {
              $sort: {
                date: -1,
              },
            },
          ],
          missingTokenScores: [
            {
              $unwind: '$sessions.missing_token_scores',
            },
            {
              $project: {
                _id: 0,
                date: '$sessions.createdAt',
                character: '$sessions.missing_token_scores.token',
                score: '$sessions.missing_token_scores.confidence_score',
              },
            },
            {
              $sort: {
                date: -1,
              },
            },
          ],
        },
      },
      {
        $project: {
          combinedResults: {
            $concatArrays: ['$confidenceScores', '$missingTokenScores'],
          },
        },
      },
      {
        $unwind: '$combinedResults',
      },
      {
        $replaceRoot: {
          newRoot: '$combinedResults',
        },
      },
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
      {
        $sort: {
          date: -1,
        },
      },
      {
        $group: {
          _id: {
            token: '$token',
          },
          scores: {
            $push: '$score',
          },
        },
      },
      {
        $project: {
          _id: 0,
          character: '$_id.token',
          latestScores: {
            $slice: ['$scores', -5],
          },
        },
      },
      {
        $addFields: {
          countBelowThreshold: {
            $size: {
              $filter: {
                input: '$latestScores',
                as: 'score',
                cond: {
                  $lt: ['$$score', threshold],
                },
              },
            },
          },
          countAboveThreshold: {
            $size: {
              $filter: {
                input: '$latestScores',
                as: 'score',
                cond: {
                  $gte: ['$$score', threshold],
                },
              },
            },
          },
          avgScore: { $avg: '$latestScores' },
        },
      },
      {
        $match: {
          $expr: {
            $gt: ['$countBelowThreshold', '$countAboveThreshold'],
          },
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

    return RecordData;
  }

  async getTargetsBysubSessionUserProfile(
    subSessionId: string,
    language: string,
  ) {
    let threshold = 0.7;

    const RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          sessions: {
            $elemMatch: { sub_session_id: subSessionId, language: language },
          },
        },
      },
      {
        $unwind: '$sessions',
      },
      {
        $match: {
          'sessions.sub_session_id': subSessionId,
          'sessions.language': language,
        },
      },
      {
        $facet: {
          confidenceScores: [
            {
              $unwind: '$sessions.confidence_scores',
            },
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
            {
              $sort: {
                date: -1,
              },
            },
          ],
          missingTokenScores: [
            {
              $unwind: '$sessions.missing_token_scores',
            },
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
            {
              $sort: {
                date: -1,
              },
            },
          ],
        },
      },
      {
        $project: {
          combinedResults: {
            $concatArrays: ['$confidenceScores', '$missingTokenScores'],
          },
        },
      },
      {
        $unwind: '$combinedResults',
      },
      {
        $replaceRoot: {
          newRoot: '$combinedResults',
        },
      },
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
      {
        $sort: {
          date: -1,
        },
      },
      {
        $group: {
          _id: {
            token: '$token',
          },
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
          latestScores: {
            $slice: ['$scores', -5],
          },
        },
      },
      {
        $addFields: {
          countBelowThreshold: {
            $size: {
              $filter: {
                input: '$latestScores',
                as: 'score',
                cond: {
                  $lt: ['$$score.score', threshold],
                },
              },
            },
          },
          countAboveThreshold: {
            $size: {
              $filter: {
                input: '$latestScores',
                as: 'score',
                cond: {
                  $gte: ['$$score.score', threshold],
                },
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
          $expr: {
            $lt: ['$countBelowThreshold', '$countAboveThreshold'],
          },
        },
      },
    ]);

    return RecordData;
  }

  async mostCommonTargets(tokenHexcodeDataArr: [], targets: []) {
    const tokenMap = new Map();

    // Map token to its isCommon and indexNo properties
    tokenHexcodeDataArr.forEach((tokenObj: any) => {
      tokenMap.set(tokenObj.token, {
        isCommon: tokenObj.isCommon,
        indexNo: tokenObj.indexNo,
      });
    });

    const commonTargets: any[] = [];
    const nonCommonTargets: any[] = [];

    targets.forEach((target: any) => {
      const tokenInfo = tokenMap.get(target.character);

      if (tokenInfo && tokenInfo.isCommon) {
        commonTargets.push({ ...target, indexNo: tokenInfo.indexNo });
      } else {
        nonCommonTargets.push(target);
      }
    });

    // Sort common targets by indexNo
    commonTargets.sort((a: any, b: any) => a.indexNo - b.indexNo);
    return [...commonTargets, ...nonCommonTargets];
  }

  // Familiarity Query
  async getFamiliarityBySession(sessionId: string, language: string) {
    const threshold = 0.7;
    let RecordData = [];

    RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          sessions: {
            $elemMatch: { session_id: sessionId, language: language },
          },
        },
      },
      {
        $unwind: '$sessions',
      },
      {
        $match: {
          'sessions.session_id': sessionId,
          'sessions.language': language,
        },
      },
      {
        $facet: {
          confidenceScores: [
            {
              $unwind: '$sessions.confidence_scores',
            },
            {
              $project: {
                _id: 0,
                date: '$sessions.createdAt',
                character: '$sessions.confidence_scores.token',
                score: '$sessions.confidence_scores.confidence_score',
              },
            },
            {
              $sort: {
                date: -1,
              },
            },
          ],
          missingTokenScores: [
            {
              $unwind: '$sessions.missing_token_scores',
            },
            {
              $project: {
                _id: 0,
                date: '$sessions.createdAt',
                character: '$sessions.missing_token_scores.token',
                score: '$sessions.missing_token_scores.confidence_score',
              },
            },
            {
              $sort: {
                date: -1,
              },
            },
          ],
        },
      },
      {
        $project: {
          combinedResults: {
            $concatArrays: ['$confidenceScores', '$missingTokenScores'],
          },
        },
      },
      {
        $unwind: '$combinedResults',
      },
      {
        $replaceRoot: {
          newRoot: '$combinedResults',
        },
      },
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
      {
        $sort: {
          date: -1,
        },
      },
      {
        $group: {
          _id: {
            token: '$token',
          },
          scores: {
            $push: '$score',
          },
        },
      },
      {
        $project: {
          _id: 0,
          character: '$_id.token',
          latestScores: {
            $slice: ['$scores', -5],
          },
        },
      },
      {
        $addFields: {
          countBelowThreshold: {
            $size: {
              $filter: {
                input: '$latestScores',
                as: 'score',
                cond: {
                  $lt: ['$$score', threshold],
                },
              },
            },
          },
          countAboveThreshold: {
            $size: {
              $filter: {
                input: '$latestScores',
                as: 'score',
                cond: {
                  $gte: ['$$score', threshold],
                },
              },
            },
          },
        },
      },
      {
        $match: {
          $expr: {
            $gte: ['$countAboveThreshold', '$countBelowThreshold'],
          },
        },
      },
    ]);

    return RecordData;
  }

  async getFamiliarityBysubSession(
    userId: string,
    subSessionId: string,
    language: string,
  ) {
    const threshold = 0.7;
    let RecordData = [];

    RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          user_id: userId,
        },
      },
      // Pre-filter sessions array before $unwind to avoid exploding the entire sessions array.
      {
        $project: {
          sessions: {
            $filter: {
              input: '$sessions',
              as: 's',
              cond: {
                $and: [
                  { $eq: ['$$s.sub_session_id', subSessionId] },
                  { $eq: ['$$s.language', language] },
                ],
              },
            },
          },
        },
      },
      {
        $unwind: '$sessions',
      },
      {
        $facet: {
          confidenceScores: [
            {
              $unwind: '$sessions.confidence_scores',
            },
            {
              $project: {
                _id: 0,
                date: '$sessions.createdAt',
                character: '$sessions.confidence_scores.token',
                score: '$sessions.confidence_scores.confidence_score',
              },
            },
            {
              $sort: {
                date: -1,
              },
            },
          ],
          missingTokenScores: [
            {
              $unwind: '$sessions.missing_token_scores',
            },
            {
              $project: {
                _id: 0,
                date: '$sessions.createdAt',
                character: '$sessions.missing_token_scores.token',
                score: '$sessions.missing_token_scores.confidence_score',
              },
            },
            {
              $sort: {
                date: -1,
              },
            },
          ],
        },
      },
      {
        $project: {
          combinedResults: {
            $concatArrays: ['$confidenceScores', '$missingTokenScores'],
          },
        },
      },
      {
        $unwind: '$combinedResults',
      },
      {
        $replaceRoot: {
          newRoot: '$combinedResults',
        },
      },
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
      {
        $sort: {
          date: -1,
        },
      },
      {
        $group: {
          _id: {
            token: '$token',
          },
          scores: {
            $push: '$score',
          },
        },
      },
      {
        $project: {
          _id: 0,
          character: '$_id.token',
          latestScores: {
            $slice: ['$scores', -5],
          },
        },
      },
      {
        $addFields: {
          countBelowThreshold: {
            $size: {
              $filter: {
                input: '$latestScores',
                as: 'score',
                cond: {
                  $lt: ['$$score', threshold],
                },
              },
            },
          },
          countAboveThreshold: {
            $size: {
              $filter: {
                input: '$latestScores',
                as: 'score',
                cond: {
                  $gte: ['$$score', threshold],
                },
              },
            },
          },
        },
      },
      {
        $match: {
          $expr: {
            $gte: ['$countAboveThreshold', '$countBelowThreshold'],
          },
        },
      },
    ]);

    return RecordData;
  }

  async getCorrectnessBysubSession(
    userId: string,
    subSessionId: string,
    language: string,
  ) {
    const threshold = 50;
    let RecordData = [];

    RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          user_id: userId,
        },
      },
      // Pre-filter sessions array before $unwind to avoid exploding the entire sessions array.
      {
        $project: {
          sessions: {
            $filter: {
              input: '$sessions',
              as: 's',
              cond: {
                $and: [
                  { $eq: ['$$s.sub_session_id', subSessionId] },
                  { $eq: ['$$s.language', language] },
                  { $ne: ['$$s.response_text', ''] },
                ],
              },
            },
          },
        },
      },
      {
        $unwind: '$sessions',
      },
      {
        $group: {
          _id: null,
          count_scores_gte_50: {
            $sum: {
              $cond: [
                { $gte: ['$sessions.correctness_score', threshold] },
                1,
                0,
              ], // Conditional count
            },
          },
          total_correctness_score: {
            $sum: '$sessions.correctness_score',
          },
          total_count: {
            $sum: 1,
          },
        },
      },
    ]);
    return RecordData;
  }

  async getFamiliarityByUser(userId: string, language: string) {
    const threshold = 0.7;
    let RecordData = [];

    RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          user_id: userId,
        },
      },
      {
        $unwind: '$sessions',
      },
      {
        $match: {
          'sessions.language': language,
        },
      },
      {
        $facet: {
          confidenceScores: [
            {
              $unwind: '$sessions.confidence_scores',
            },
            {
              $project: {
                _id: 0,
                date: '$sessions.createdAt',
                character: '$sessions.confidence_scores.token',
                score: '$sessions.confidence_scores.confidence_score',
              },
            },
            {
              $sort: {
                date: -1,
              },
            },
          ],
          missingTokenScores: [
            {
              $unwind: '$sessions.missing_token_scores',
            },
            {
              $project: {
                _id: 0,
                date: '$sessions.createdAt',
                character: '$sessions.missing_token_scores.token',
                score: '$sessions.missing_token_scores.confidence_score',
              },
            },
            {
              $sort: {
                date: -1,
              },
            },
          ],
        },
      },
      {
        $project: {
          combinedResults: {
            $concatArrays: ['$confidenceScores', '$missingTokenScores'],
          },
        },
      },
      {
        $unwind: '$combinedResults',
      },
      {
        $replaceRoot: {
          newRoot: '$combinedResults',
        },
      },
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
      {
        $sort: {
          date: -1,
        },
      },
      {
        $group: {
          _id: {
            token: '$token',
          },
          scores: {
            $push: '$score',
          },
        },
      },
      {
        $project: {
          _id: 0,
          character: '$_id.token',
          latestScores: {
            $slice: ['$scores', -5],
          },
        },
      },
      {
        $addFields: {
          countBelowThreshold: {
            $size: {
              $filter: {
                input: '$latestScores',
                as: 'score',
                cond: {
                  $lt: ['$$score', threshold],
                },
              },
            },
          },
          countAboveThreshold: {
            $size: {
              $filter: {
                input: '$latestScores',
                as: 'score',
                cond: {
                  $gte: ['$$score', threshold],
                },
              },
            },
          },
          score: { $avg: '$latestScores' },
        },
      },
      {
        $match: {
          $expr: {
            $gte: ['$countAboveThreshold', '$countBelowThreshold'],
          },
        },
      },
    ]);

    return RecordData;
  }

  async getFamiliarityBysubSessionUserProfile(
    subSessionId: string,
    language: string,
  ) {
    let threshold = 0.7;
    let RecordData = [];

    RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          sessions: {
            $elemMatch: { sub_session_id: subSessionId, language: language },
          },
        },
      },
      {
        $unwind: '$sessions',
      },
      {
        $match: {
          'sessions.sub_session_id': subSessionId,
          'sessions.language': language,
        },
      },
      {
        $facet: {
          confidenceScores: [
            {
              $unwind: '$sessions.confidence_scores',
            },
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
            {
              $sort: {
                date: -1,
              },
            },
          ],
          missingTokenScores: [
            {
              $unwind: '$sessions.missing_token_scores',
            },
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
            {
              $sort: {
                date: -1,
              },
            },
          ],
        },
      },
      {
        $project: {
          combinedResults: {
            $concatArrays: ['$confidenceScores', '$missingTokenScores'],
          },
        },
      },
      {
        $unwind: '$combinedResults',
      },
      {
        $replaceRoot: {
          newRoot: '$combinedResults',
        },
      },
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
      {
        $sort: {
          date: -1,
        },
      },
      {
        $group: {
          _id: {
            token: '$token',
          },
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
          latestScores: {
            $slice: ['$scores', -5],
          },
        },
      },
      {
        $addFields: {
          countBelowThreshold: {
            $size: {
              $filter: {
                input: '$latestScores',
                as: 'score',
                cond: {
                  $lt: ['$$score.score', threshold],
                },
              },
            },
          },
          countAboveThreshold: {
            $size: {
              $filter: {
                input: '$latestScores',
                as: 'score',
                cond: {
                  $gte: ['$$score.score', threshold],
                },
              },
            },
          },
          avg: {
            $avg: '$latestScores.score',
          },
        },
      },
      {
        $match: {
          $expr: {
            $gte: ['$countAboveThreshold', '$countBelowThreshold'],
          },
        },
      },
    ]);

    return RecordData;
  }

  async getFluencyBysubSession(
    userId: string,
    subSessionId: string,
    language: string,
  ) {
    const RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          user_id: userId,
        },
      },
      // Pre-filter sessions array before $unwind to avoid exploding the entire sessions array.
      {
        $project: {
          sessions: {
            $filter: {
              input: '$sessions',
              as: 's',
              cond: {
                $and: [
                  { $eq: ['$$s.sub_session_id', subSessionId] },
                  { $eq: ['$$s.language', language] },
                ],
              },
            },
          },
        },
      },
      {
        $unwind: '$sessions',
      },
      {
        $group: {
          _id: {
            subSessionId: '$sessions.sub_session_id',
          },
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

    return RecordData[0]?.fluencyScore || 0;
  }

  async gethexcodeMapping(language: string): Promise<any> {
    const cacheKey = 'hexcode_data_' + language;
    let recordData = await this.cacheService.get(cacheKey);

    if (!recordData) {
      recordData = await this.hexcodeMappingModel
        .find({ language: language })
        .exec();

      await this.cacheService.set(cacheKey, recordData, 360000);
    } else {
      console.log('data from cache');
    }

    return recordData;
  }

  async getMeanLearnerBySession(sessionId: string) {
    const RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          sessions: { $elemMatch: { session_id: sessionId } },
        },
      },
      {
        $unwind: '$sessions',
      },
      {
        $unwind: '$sessions.confidence_scores',
      },
      {
        $match: {
          'sessions.session_id': sessionId,
        },
      },
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
    return RecordData;
  }

  async getlatestmilestone(userId: string, language: string) {
    // Fast path: find the latest milestone with stored language using $reduce (O(M) single pass,
    // no sessions array needed). For users created after language field was added, this always hits.
    const modernResult = await this.scoreModel.aggregate([
      { $match: { user_id: userId } },
      {
        $project: {
          _id: 0,
          user_id: 1,
          latestMilestone: {
            $reduce: {
              input: {
                $filter: {
                  input: '$milestone_progress',
                  as: 'mp',
                  cond: { $eq: ['$$mp.language', language] },
                },
              },
              initialValue: null,
              in: {
                $cond: {
                  if: {
                    $or: [
                      { $eq: ['$$value', null] },
                      { $gt: ['$$this.createdAt', '$$value.createdAt'] },
                    ],
                  },
                  then: '$$this',
                  else: '$$value',
                },
              },
            },
          },
        },
      },
      { $match: { latestMilestone: { $ne: null } } },
    ]);

    if (modernResult.length > 0) {
      const { user_id, latestMilestone: m } = modernResult[0];
      return [
        {
          user_id,
          session_id: m.session_id,
          sub_session_id: m.sub_session_id,
          milestone_level: m.milestone_level,
          sub_milestone_level: m.sub_milestone_level,
          createdAt: m.createdAt,
          language: m.language,
        },
      ];
    }

  
    // Step 1: find the latest null-language milestone entry (O(M) single pass, no sessions).
    const legacyMilestone = await this.scoreModel.aggregate([
      { $match: { user_id: userId } },
      {
        $project: {
          _id: 0,
          user_id: 1,
          latestMilestone: {
            $reduce: {
              input: {
                $filter: {
                  input: '$milestone_progress',
                  as: 'mp',
                  cond: { $eq: [{ $ifNull: ['$$mp.language', null] }, null] },
                },
              },
              initialValue: null,
              in: {
                $cond: {
                  if: {
                    $or: [
                      { $eq: ['$$value', null] },
                      { $gt: ['$$this.createdAt', '$$value.createdAt'] },
                    ],
                  },
                  then: '$$this',
                  else: '$$value',
                },
              },
            },
          },
        },
      },
      { $match: { latestMilestone: { $ne: null } } },
    ]);

    if (!legacyMilestone.length) {
      return [];
    }

    const { user_id, latestMilestone: lm } = legacyMilestone[0];

    // Step 2: resolve language for this single entry via session lookup (O(N) once, not M times).
    const sessionResult = await this.scoreModel.aggregate([
      { $match: { user_id: userId } },
      {
        $project: {
          _id: 0,
          sessionLang: {
            $arrayElemAt: [
              {
                $map: {
                  input: {
                    $filter: {
                      input: '$sessions',
                      as: 's',
                      cond: { $eq: ['$$s.sub_session_id', lm.sub_session_id] },
                    },
                  },
                  as: 'matched',
                  in: '$$matched.language',
                },
              },
              0,
            ],
          },
        },
      },
    ]);

    const resolvedLanguage =
      lm.sub_milestone_level
        ? lm.language ?? null
        : (lm.language ?? sessionResult[0]?.sessionLang ?? null);

    if (resolvedLanguage !== language) {
      return [];
    }

    return [
      {
        user_id,
        session_id: lm.session_id,
        sub_session_id: lm.sub_session_id,
        milestone_level: lm.milestone_level,
        sub_milestone_level: lm.sub_milestone_level,
        createdAt: lm.createdAt,
        language: resolvedLanguage,
      },
    ];
  }

  async getMeanLearnerByUser(userId: string) {
    const RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          user_id: userId,
        },
      },
      {
        $unwind: '$sessions',
      },
      {
        $unwind: '$sessions.confidence_scores',
      },
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
    return RecordData;
  }

  async getConfidentVectorByUser(userId: string) {
    const RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          user_id: userId,
        },
      },
      {
        $unwind: '$sessions',
      },
      {
        $unwind: '$sessions.confidence_scores',
      },
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
          // score: 1,
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
    return RecordData;
  }

  async getConfidentVectorBySession(sessionId: string) {
    const RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          sessions: { $elemMatch: { session_id: sessionId } },
        },
      },
      {
        $unwind: '$sessions',
      },
      {
        $unwind: '$sessions.confidence_scores',
      },
      {
        $match: {
          'sessions.session_id': sessionId,
        },
      },
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
          // score: 1,
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
    return RecordData;
  }

  async getMissingChars(language: string) {
    const RecordData = await this.hexcodeMappingModel
      .find(
        {
          language: language,
        },
        { token: 1, _id: 0 },
      )
      .exec();
    const tokenArray = RecordData.map((data) => {
      return data.token;
    });
    return tokenArray;
  }

  async assessmentInputCreate(assessmentInputData: any): Promise<any> {
    try {
      const assessmentInput = this.assessmentInputModel.updateMany(
        {
          user_id: assessmentInputData.user_id,
          session_id: assessmentInputData.session_id,
          token: assessmentInputData.token,
        },
        { $set: { feedback: assessmentInputData.feedback } },
        { new: true, upsert: true },
      );

      return await assessmentInput;
    } catch (err) {
      return err;
    }
  }

  async getAssessmentRecords(sessionId: string): Promise<any> {
    try {
      const AssessmentRecords = await this.assessmentInputModel.aggregate([
        {
          $match: {
            session_id: sessionId,
          },
        },
        {
          $group: {
            _id: {
              session_id: sessionId,
              token: '$token',
            },
            feedback: { $max: '$feedback' },
          },
        },
        {
          $match: {
            feedback: 0,
          },
        },
        {
          $project: {
            _id: 0,
            session_id: '$_id.session_id',
            token: '$_id.token',
            feedback: 1,
          },
        },
      ]);

      return AssessmentRecords;
    } catch (err) {
      return err;
    }
  }

  async getAssessmentRecordsUserid(userId: string): Promise<any> {
    try {
      const AssessmentRecords = await this.assessmentInputModel.aggregate([
        {
          $match: {
            user_id: userId,
          },
        },
        {
          $group: {
            _id: {
              user_id: userId,
              token: '$token',
            },
            feedback: { $max: '$feedback' },
          },
        },
        {
          $match: {
            feedback: 0,
          },
        },
        {
          $project: {
            _id: 0,
            user_id: '$_id.user_id',
            token: '$_id.token',
            feedback: 1,
          },
        },
      ]);

      return AssessmentRecords;
    } catch (err) {
      return err;
    }
  }

  async getAllSessions(
    userId: string,
    limit: number,
    calculateMilestone = false,
  ) {
    const RecordData = await this.scoreModel
      .aggregate([
        {
          $match: {
            user_id: userId,
          },
        },
        {
          $unwind: '$sessions',
        },
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
        {
          $sort: {
            _id: -1,
          },
        },
        {
          $project: {
            _id: 0,
            session_id: '$_id',
            totalrecords: '$totalrecords',
          },
        },
      ])
      .limit(Number(limit));

    const sessionIds = RecordData.map((item) => {
      if (calculateMilestone && item.totalrecords < 3) {
      } else if (!calculateMilestone) {
        return item.session_id;
      } else {
        return item.session_id;
      }
    }).filter((sessionIdEle) => sessionIdEle != undefined);

    return sessionIds;
  }

  async addLlmOutputLog(llmOutputLog: any): Promise<any> {
    try {
      const createllmOutputLog = new this.llmOutputLogsModel(llmOutputLog);
      const result = await createllmOutputLog.save();
      return result;
    } catch (err) {
      return err;
    }
  }

  async addGetSetResultLog(getSetResultLog: any): Promise<any> {
    try {
      const createGetSetResultLog = new this.getSetResultModel(getSetResultLog);
      const result = await createGetSetResultLog.save();
      return result;
    } catch (err) {
      console.error('Error saving getSetResultLog:', err);
      throw err;
    }
  }

  async getGetSetResultHistory(
    userId: string,
    sessionId: string,
    language: string,
  ): Promise<any | null> {
    try {
      return await this.getSetResultModel
        .findOne({
          userId,
          sessionId,
          langauge: language,
        })
        .sort({ createdAt: -1 })
        .lean()
        .exec();
    } catch (err) {
      console.error('Error fetching getSetResult history:', err);
      return null;
    }
  }

  async getSubessionIds(user_id: string) {
    const RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          user_id: user_id,
        },
      },
      {
        $unwind: '$sessions',
      },
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
    return RecordData;
  }

  async getTextSimilarity(s1: string, s2: string) {
    let longer = s1;
    let shorter = s2;
    if (s1.length < s2.length) {
      longer = s2;
      shorter = s1;
    }
    const longerLength: any = longer.length;
    if (longerLength == 0) {
      return 1.0;
    }

    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();

    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i == 0) costs[j] = j;
        else {
          if (j > 0) {
            let newValue = costs[j - 1];
            if (s1.charAt(i - 1) != s2.charAt(j - 1))
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return (longerLength - costs[s2.length]) / parseFloat(longerLength);
  }

  async getSyllablesFromString(
    text: string,
    vowelSignArr: string[],
    language: string,
  ): Promise<string[]> {
    let prevEle = '';
    let isPrevVowel = false;
    let syllableArr = [];

    // This code block used to create syllable list from text strings
    //if (language === "ta") {
    for (const textELE of text.split('')) {
      if (textELE != ' ') {
        if (vowelSignArr.includes(textELE)) {
          if (isPrevVowel) {
          } else {
            prevEle = prevEle + textELE;
            syllableArr.push(prevEle);
          }
          isPrevVowel = true;
        } else {
          syllableArr.push(textELE);
          prevEle = textELE;
          isPrevVowel = false;
        }
      }
    }

    return syllableArr;
  }

  async getConstructedText(original_text: string, response_text: string) {
    let constructText = '';
    const compareCharArr = [];
    const constructTextSet = new Set();
    let reptitionCount = 0;

    for (const originalEle of original_text.split(' ')) {
      let originalRepCount = 0;
      for (const sourceEle of response_text.split(' ')) {
        const similarityScore = await this.getTextSimilarity(
          originalEle,
          sourceEle,
        );
        if (similarityScore >= 0.4) {
          compareCharArr.push({
            original_text: originalEle,
            response_text: sourceEle,
            score: similarityScore,
          });
        }
        if (similarityScore >= 0.6) {
          originalRepCount++;
        }
      }
      if (originalRepCount >= 2) {
        reptitionCount++;
      }
    }

    for (const compareCharArrEle of compareCharArr) {
      let score = 0;
      let word = '';
      for (const compareCharArrCmpEle of compareCharArr) {
        if (
          compareCharArrEle.original_text === compareCharArrCmpEle.original_text
        ) {
          if (compareCharArrCmpEle.score > score) {
            score = compareCharArrCmpEle.score;
            word = compareCharArrCmpEle.response_text;
          }
        }
      }
      constructTextSet.add(word);
    }

    for (const constructTextSetEle of constructTextSet) {
      constructText += constructTextSetEle + ' ';
    }

    constructText = constructText.trim();

    return { constructText, reptitionCount };
  }

  async getTextMetrics(
    original_text: string,
    response_text: string,
    language: string,
    base64_audio: string,
  ) {
    const url = process.env.ALL_TEXT_EVAL_API + '/getTextMatrices';

    const textData = {
      reference: original_text,
      hypothesis: response_text,
      language: language,
      base64_string: base64_audio,
    };

    const textEvalMatrices = await lastValueFrom(
      this.httpService
        .post(url, JSON.stringify(textData), {
          headers: {
            'Content-Type': 'application/json',
          },
        })
        .pipe(
          map((resp) => resp.data),
          catchError((error: AxiosError) => {
            throw mapAxiosToUpstreamHttpException(
              'text-eval',
              ErrorCodes.TEXT_EVAL_UNAVAILABLE,
              'Text evaluation service is unavailable or returned an error while computing text metrics.',
              error,
            );
          }),
        ),
    );

    return textEvalMatrices;
  }

  async getCalculatedFluency(
    textEvalMetrics,
    repetitionCount,
    original_text,
    response_text,
    pause_count,
  ) {
    let fluencyCalPerc = lang_common_config.fluencyCalPerc;

    let wer = textEvalMetrics.wer;
    let cercal = textEvalMetrics.cer * 2;
    let charCount = Math.abs(original_text.length - response_text.length);
    let wordCount = Math.abs(
      original_text.split(' ').length - response_text.split(' ').length,
    );
    let repetitions = repetitionCount;
    let pauseCount = pause_count;
    let ins = textEvalMetrics.insertion.length;
    let del = textEvalMetrics.deletion.length;
    let sub = textEvalMetrics.substitution.length;

    let fluencyScore =
      (wer * fluencyCalPerc.wer +
        cercal * fluencyCalPerc.cercal +
        charCount * fluencyCalPerc.charCount +
        wordCount * 10 +
        repetitions * fluencyCalPerc.repetitions +
        pauseCount * fluencyCalPerc.pauseCount +
        ins * fluencyCalPerc.ins +
        del * fluencyCalPerc.del +
        sub * fluencyCalPerc.sub) /
      100;

    return fluencyScore;
  }

  async getTokenHexcode(hexcodeTokenArr, token) {
    const result = hexcodeTokenArr.find((item) => item.token === token);
    return result?.hexcode || '';
  }

  async identifyTokens(
    bestTokens,
    correctTokens,
    missingTokens,
    tokenHexcodeDataArr,
    vowelSignArr,
  ) {
    let confidence_scoresArr = [];
    let missing_token_scoresArr = [];
    let anomaly_scoreArr = [];
    let prevEle = '';
    let isPrevVowel = false;
    const tokenArr = [];
    const anamolyTokenArr = [];
    const filteredTokenArr = [];

    // Create Single Array from AI4bharat tokens array
    bestTokens.forEach((element) => {
      element.tokens.forEach((token) => {
        if (Object.keys(token).length > 0) {
          const key = Object.keys(token)[0];
          const value = Object.values(token)[0];

          let insertObj = {};
          insertObj[key] = value;
          tokenArr.push(insertObj);

          if (Object.keys(token).length == 2) {
            const key1 = Object.keys(token)[1];
            const value1 = Object.values(token)[1];
            insertObj = {};
            insertObj[key1] = value1;
            anamolyTokenArr.push(insertObj);
          }
        }
      });
    });

    const uniqueChar = new Set();

    // Create Unique token array
    for (const tokenArrEle of tokenArr) {
      const tokenString = Object.keys(tokenArrEle)[0];
      for (const keyEle of tokenString.split('')) {
        if (vowelSignArr.includes(keyEle)) {
          if (isPrevVowel) {
            const prevEleArr = prevEle.split('');
            prevEle = prevEleArr[0] + keyEle;
            uniqueChar.add(prevEle);
          } else {
            prevEle = prevEle + keyEle;
            uniqueChar.add(prevEle);
          }
          isPrevVowel = true;
        } else {
          uniqueChar.add(keyEle);
          isPrevVowel = false;
          prevEle = keyEle;
        }
      }
    }

    //unique token list for ai4bharat response
    const uniqueCharArr = Array.from(uniqueChar);

    // Get best score for Each Char
    for (const char of uniqueCharArr) {
      let score = 0.0;
      prevEle = '';
      isPrevVowel = false;

      for (const tokenArrEle of tokenArr) {
        const tokenString = Object.keys(tokenArrEle)[0];
        const tokenValue = Object.values(tokenArrEle)[0];

        for (const keyEle of tokenString.split('')) {
          const scoreVal: any = tokenValue;
          let charEle: any = keyEle;

          if (vowelSignArr.includes(charEle)) {
            if (isPrevVowel) {
              const prevCharArr = prevEle.split('');
              prevEle = prevCharArr[0] + charEle;
              charEle = prevEle;
            } else {
              prevEle = prevEle + charEle;
              charEle = prevEle;
            }
            isPrevVowel = true;
          } else {
            prevEle = charEle;
            isPrevVowel = false;
          }

          if (char === charEle) {
            if (scoreVal > score) {
              score = scoreVal;
            }
          }
        }
      }

      filteredTokenArr.push({ charkey: char, charvalue: score });
    }

    // Create confidence score array and anomoly array
    for (const value of filteredTokenArr) {
      const score: any = value.charvalue;

      let identification_status = 0;
      if (score >= 0.9) {
        identification_status = 1;
      } else if (score >= 0.4) {
        identification_status = -1;
      } else {
        identification_status = 0;
      }

      if (value.charkey !== '' && value.charkey !== '▁') {
        if (correctTokens.includes(value.charkey)) {
          const hexcode = await this.getTokenHexcode(
            tokenHexcodeDataArr,
            value.charkey,
          );
          if (hexcode !== '') {
            confidence_scoresArr.push({
              token: value.charkey,
              hexcode: hexcode,
              confidence_score: value.charvalue,
              identification_status: identification_status,
            });
          } else {
            if (!missingTokens.includes(value.charkey)) {
              anomaly_scoreArr.push({
                token: value.charkey.replaceAll('_', ''),
                hexcode: hexcode,
                confidence_score: value.charvalue,
                identification_status: identification_status,
              });
            }
          }
        }
      }
    }

    for (const missingTokensEle of missingTokens) {
      const hexcode = await this.getTokenHexcode(
        tokenHexcodeDataArr,
        missingTokensEle,
      );

      if (hexcode !== '') {
        if (vowelSignArr.includes(missingTokensEle)) {
        } else {
          if (!uniqueChar.has(missingTokensEle)) {
            missing_token_scoresArr.push({
              token: missingTokensEle,
              hexcode: hexcode,
              confidence_score: 0.1,
              identification_status: 0,
            });
          }
        }
      } else {
        if (!correctTokens.includes(missingTokensEle)) {
          anomaly_scoreArr.push({
            token: missingTokensEle.replaceAll('_', ''),
            hexcode: hexcode,
            confidence_score: 0.1,
            identification_status: 0,
          });
        }
      }
    }

    for (const anamolyTokenArrEle of anamolyTokenArr) {
      const tokenString = Object.keys(anamolyTokenArrEle)[0];
      const tokenValue = Object.values(anamolyTokenArrEle)[0];

      if (tokenString != '') {
        const hexcode = await this.getTokenHexcode(
          tokenHexcodeDataArr,
          tokenString,
        );
        if (hexcode !== '') {
          if (vowelSignArr.includes(tokenString)) {
          } else {
            anomaly_scoreArr.push({
              token: tokenString.replaceAll('_', ''),
              hexcode: hexcode,
              confidence_score: tokenValue,
              identification_status: 0,
            });
          }
        }
      }
    }
    return { confidence_scoresArr, missing_token_scoresArr, anomaly_scoreArr };
  }

  async processText(text: string) {
    // Convert the text to lowercase
    text = text.toLowerCase();

    // Split the text into sentences based on '. and ,'
    const sentences = text.split(/[.,]/);

    // Process each sentence
    const processedSentences = sentences.map((sentence) => {
      // Apply special character logic
      const cleanedSentence = sentence.replace(/[^\w\s]/g, '');

      return cleanedSentence.trim(); // Trim any extra spaces
    });

    // Join the processed sentences back together with spaces and without the dot and comma
    const processedText = processedSentences.join(' ').trim();

    return processedText;
  }

  async getMilestoneBasedContentComplexity(milestone_level: string) {
    let contentLevel = '';
    let complexityLevel = [];

    if (milestone_level === 'm0') {
      contentLevel = 'L1';
    } else if (milestone_level === 'm1') {
      contentLevel = 'L1';
      complexityLevel = ['C0'];
    } else if (milestone_level === 'm2') {
      contentLevel = 'L2';
      complexityLevel = ['C1'];
    } else if (milestone_level === 'm3') {
      contentLevel = 'L2';
      complexityLevel = ['C1', 'C2'];
    } else if (milestone_level === 'm4') {
      contentLevel = 'L3';
      complexityLevel = ['C1', 'C2', 'C3'];
    } else if (milestone_level === 'm5') {
      contentLevel = 'L3';
      complexityLevel = ['C2', 'C3'];
    } else if (milestone_level === 'm6') {
      contentLevel = 'L4';
      complexityLevel = ['C2', 'C3'];
    } else if (milestone_level === 'm7') {
      contentLevel = 'L4';
      complexityLevel = ['C2', 'C3', 'C4'];
    } else if (milestone_level === 'm8') {
      contentLevel = 'L5';
      complexityLevel = ['C3', 'C4'];
    } else if (milestone_level === 'm9') {
      contentLevel = 'L6';
      complexityLevel = ['C3', 'C4'];
    }

    return { contentLevel: contentLevel, complexityLevel };
  }

  async getSubsessionOriginalTextSyllables(
    userId: string,
    sub_session_id: string,
  ) {
    const RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          user_id: userId,
        },
      },
      {
        $unwind: '$sessions',
      },
      {
        $match: {
          'sessions.sub_session_id': sub_session_id,
        },
      },
      {
        $project: {
          _id: 0,
          original_text: '$sessions.original_text',
        },
      },
    ]);

    let syllables = [];

    for (let RecordDataEle of RecordData) {
      let splitGraphemesData = splitGraphemes.splitGraphemes(
        RecordDataEle.original_text.replace(
          /[\u200B\u200C\u200D\uFEFF\s!@#$%^&*()_+{}\[\]:;<>,.?\/\\|~'"-=]/g,
          '',
        ),
      );
      syllables = syllables.concat(splitGraphemesData);
    }

    syllables = [...new Set(syllables)];

    return syllables;
  }

  async processTokens(nBestTokens) {
    let data_arr = [];

    nBestTokens.forEach((element) => {
      element.tokens.forEach((token) => {
        let insertObj = {}; // Create an empty object for each iteration

        // Add the first key-value pair if valid
        let key = Object.keys(token)[0];
        if (key && key.trim() !== '') {
          let value = Object.values(token)[0];
          insertObj[key] = value;
        }

        // Add the second key-value pair if valid
        if (Object.keys(token).length > 1) {
          let key1 = Object.keys(token)[1];
          if (key1 && key1.trim() !== '') {
            let value1 = Object.values(token)[1];
            insertObj[key1] = value1;
          }
        }

        // Only push to data_arr if there's at least one valid key-value pair
        if (Object.keys(insertObj).length > 0) {
          data_arr.push(insertObj);
        }
      });
    });

    return data_arr;
  }
  /*  Function for generating the constructed text without  missing the sequence and for every constructed text
   we are storing used chars and that are not used we are storing it in unused char array  */
  async generateWords(dataArr) {
    const generateRecursive = (
      currentWord,
      usedKeyValueArr,
      unusedKeyValueArr,
      index,
    ) => {
      if (index === dataArr.length) {
        return [[currentWord, usedKeyValueArr, unusedKeyValueArr]];
      }
      const possibleWords = [];
      const currentObject = dataArr[index];
      for (const key in currentObject) {
        if (currentObject.hasOwnProperty(key)) {
          const newWord = currentWord + key;
          const newUsedKeyValueArr = [
            ...usedKeyValueArr,
            { [key]: currentObject[key] },
          ];
          const newUnusedKeyValueArr = unusedKeyValueArr.filter(
            (pair) => !pair.hasOwnProperty(key),
          );
          possibleWords.push(
            ...generateRecursive(
              newWord,
              newUsedKeyValueArr,
              newUnusedKeyValueArr,
              index + 1,
            ),
          );
        }
      }
      return possibleWords;
    };
    const initialUnusedKeyValueArr = dataArr.flatMap((data) =>
      Object.entries(data).map(([key, value]) => ({ [key]: value })),
    );
    return generateRecursive('', [], initialUnusedKeyValueArr, 0);
  }

  /* Function for generating the simnilarities for each and every word with the
  original word and sort it in descending order */
  async findAllSimilarities(words_with_values, wordArray) {
    let highestScore = -Infinity;
    let highestScoreArr = null;

    for (const word of wordArray) {
      for (const wordWithVal of words_with_values) {
        const constructedWord = wordWithVal[0];
        const tokenArr = wordWithVal[1];
        const anamolyTokenArr = wordWithVal[2];
        const score = await this.getTextSimilarity(word, constructedWord);

        if (score > highestScore) {
          highestScore = score;
          highestScoreArr = [constructedWord, tokenArr, anamolyTokenArr, score];
        }
      }
    }
    return highestScoreArr;
  }

  async replaceCharacters(word) {
    // Agreeable Substitutes word generation
    let outcomes = new Set();

    // Function to perform the replacements
    function performReplacements(w) {
      let transformations = [];

      // Process 'ం' at the end of the word
      if (w.endsWith('ం')) {
        transformations.push(w.slice(0, -1) + 'మ్');
      }

      // Process 'ం' and 'ర' in the middle of the word

      for (let i = 0; i < w.length - 1; i++) {
        if (w[i] === 'ం') {
          let nextChar = w[i + 1];
          let inclu_char = '';
          if (['క', 'ఖ', 'గ', 'ఘ', 'ఙ'].includes(nextChar)) {
            inclu_char = 'ఙ్';
          } else if (['చ', 'ఛ', 'జ', 'ఝ', 'ఞ'].includes(nextChar)) {
            inclu_char = 'ఞ్';
          } else if (['ట', 'ఠ', 'డ', 'ఢ', 'ణ'].includes(nextChar)) {
            inclu_char = 'ణ్';
          } else if (['త', 'థ', 'ద', 'ధ', 'న'].includes(nextChar)) {
            inclu_char = 'న్';
          } else if (['ప', 'ఫ', 'బ', 'భ', 'మ'].includes(nextChar)) {
            inclu_char = 'మ్';
          } else {
            inclu_char = 'మ్';
          }
          transformations.push(w.slice(0, i) + inclu_char + w.slice(i + 1));
        }
        if (w[i] === 'ర') {
          transformations.push(w.slice(0, i) + 'ఱ' + w.slice(i + 1));
        }
      }

      // Apply new transformations
      transformations.forEach((newWord) => {
        if (!outcomes.has(newWord)) {
          outcomes.add(newWord);
          performReplacements(newWord); // Recursively handle new transformations
        }
      });
    }

    // Perform replacements on the original word
    performReplacements(word);

    // If no transformations were added, return the original word
    return outcomes.size > 0 ? Array.from(outcomes) : [word];
  }

  getAccuracyClassification(contentType: string, score: number): FluencyClassification | 'N/A' {
    const config: Record<string, [number, number, FluencyClassification][]> = {
      word: [
        [0, 1, FluencyClassification.FLUENT],
        [1, 2, FluencyClassification.MODERATELY_FLUENT],
        [2, 3, FluencyClassification.DISFLUENT],
        [3, Infinity, FluencyClassification.VERY_DISFLUENT],
      ],
      sentence: [
        [0, 3, FluencyClassification.FLUENT],
        [3, 6, FluencyClassification.MODERATELY_FLUENT],
        [6, 8, FluencyClassification.DISFLUENT],
        [8, Infinity, FluencyClassification.VERY_DISFLUENT],
      ],
      paragraph: [
        [0, 5, FluencyClassification.FLUENT],
        [5, 10, FluencyClassification.MODERATELY_FLUENT],
        [10, 12, FluencyClassification.DISFLUENT],
        [12, Infinity, FluencyClassification.VERY_DISFLUENT],
      ],
    };
    const ct = contentType.toLowerCase();
    const thresholds = config[ct];
    if (!thresholds) {
      return 'N/A';
    }
    for (const [min, max, label] of thresholds) {
      if (score >= min && score <= max) {
        return label;
      }
    }
    return 'N/A';
  }

  public classificationToScore(classification: string): number {
    switch (classification) {
      case FluencyClassification.FLUENT:
        return 4;
      case FluencyClassification.MODERATELY_FLUENT:
        return 3;
      case FluencyClassification.DISFLUENT:
        return 2;
      case FluencyClassification.VERY_DISFLUENT:
      default:
        return 1;
    }
  }

  public async getSubSessionScores(
    userId: string,
    subSessionId: string,
    language: string,
  ): Promise<any[]> {
    // Use $filter projection to return only matching sessions from the DB,
    // avoiding loading the entire user document into memory.
    const docs = await this.scoreModel.aggregate([
      {
        $match: { user_id: userId },
      },
      {
        $project: {
          _id: 0,
          sessions: {
            $filter: {
              input: '$sessions',
              as: 's',
              cond: {
                $and: [
                  { $eq: ['$$s.sub_session_id', subSessionId] },
                  { $eq: ['$$s.language', language] },
                ],
              },
            },
          },
        },
      },
    ]);

    return docs.length > 0 ? docs[0].sessions : [];
  }

  async computeFluencyAndProsodyResults(
    userId: string,
    subSessionId: string,
    language: string,
    collectionId: string | undefined,
    previousLevel: string | undefined,
    preloadedSessions?: any[],
  ): Promise<{ fluencyResult: SessionResult | undefined; prosodyResult: SessionResult | undefined }> {
    const langLower = language.toLowerCase();

    if (collectionId || !SUPPORTED_LANGUAGES.includes(langLower)) {
      return { fluencyResult: undefined, prosodyResult: undefined };
    }

    const userLevelNum = previousLevel ? parseInt(previousLevel.replace('m', ''), 10) : NaN;
    const needsFluency = !isNaN(userLevelNum) && userLevelNum < 10;
    const needsProsody = !isNaN(userLevelNum) && userLevelNum >= 6;

    if (!needsFluency && !needsProsody) {
      return { fluencyResult: undefined, prosodyResult: undefined };
    }

    const audioRecords = preloadedSessions ?? await this.getSubSessionScores(userId, subSessionId, langLower);
    const total = audioRecords.length;

    const { passThresholdM4Plus, passThresholdBelowM4, weights } =
      lang_common_config.fluencyAndProsody;

    let fluencyResult: SessionResult | undefined;
    if (needsFluency) {
      const passThreshold = userLevelNum >= 4 ? passThresholdM4Plus : passThresholdBelowM4;
      let passCount = 0;

      for (const record of audioRecords) {
        const prosody = record.prosody_fluency || {};
        const exprClass: string = prosody.expression_classification || FluencyClassification.VERY_DISFLUENT;
        const smoothClass: string = prosody.smoothness?.smoothness_classification || FluencyClassification.VERY_DISFLUENT;
        const accClass: string = prosody.accuracy?.accuracy_classification || FluencyClassification.VERY_DISFLUENT;
        const rateClass: string = prosody.rate?.rate_classification || FluencyClassification.VERY_DISFLUENT;

        const weightedScore =
          this.classificationToScore(exprClass) * weights.expression +
          this.classificationToScore(smoothClass) * weights.smoothness +
          this.classificationToScore(accClass) * weights.accuracy +
          this.classificationToScore(rateClass) * weights.rate;

        let recordPass: boolean;
        if (userLevelNum >= 4) {
          if (weightedScore >= passThreshold) {
            recordPass = true;
          } else {
            // Exception: three borderline combinations score 2.9 but are intentionally passing.
            recordPass =
              (exprClass === FluencyClassification.MODERATELY_FLUENT && smoothClass === FluencyClassification.DISFLUENT && accClass === FluencyClassification.MODERATELY_FLUENT && rateClass === FluencyClassification.MODERATELY_FLUENT) ||
              (exprClass === FluencyClassification.DISFLUENT && smoothClass === FluencyClassification.FLUENT && accClass === FluencyClassification.MODERATELY_FLUENT && rateClass === FluencyClassification.MODERATELY_FLUENT) ||
              (exprClass === FluencyClassification.VERY_DISFLUENT && smoothClass === FluencyClassification.MODERATELY_FLUENT && accClass === FluencyClassification.MODERATELY_FLUENT && rateClass === FluencyClassification.FLUENT);
          }
        } else {
          recordPass = weightedScore >= passThreshold;
        }

        if (recordPass) {
          passCount++;
        }
      }

      fluencyResult = total === 0
        ? SessionResult.FAIL
        : total % 2 === 0
          ? passCount >= total / 2 ? SessionResult.PASS : SessionResult.FAIL
          : passCount > total / 2 ? SessionResult.PASS : SessionResult.FAIL;
    }

    let prosodyResult: SessionResult | undefined;
    if (needsProsody) {
      const validProsodyClasses: string[] = Object.values(ProsodyClassification);
      const normalizeClass = (cls: string): string => {
        const lower = cls.toLowerCase();
        return validProsodyClasses.includes(lower) ? lower : ProsodyClassification.ERRATIC;
      };

      let passCountProsody = 0;

      for (const record of audioRecords) {
        const prosody = record.prosody_fluency || {};
        const pitchClass = normalizeClass(prosody.pitch?.pitch_classification || ProsodyClassification.ERRATIC);
        const intensityClass = normalizeClass(prosody.intensity?.intensity_classification || ProsodyClassification.ERRATIC);
        const tempoClass = normalizeClass(prosody.tempo?.tempo_classification || ProsodyClassification.ERRATIC);

        const exaggeratedCount = [pitchClass, intensityClass, tempoClass].filter(
          (c) => c === ProsodyClassification.EXAGGERATED,
        ).length;
        const recordProsodyPass =
          pitchClass !== ProsodyClassification.ERRATIC &&
          intensityClass !== ProsodyClassification.ERRATIC &&
          tempoClass !== ProsodyClassification.ERRATIC &&
          exaggeratedCount < 2;

        if (recordProsodyPass) passCountProsody++;
      }

      prosodyResult = total === 0
        ? SessionResult.FAIL
        : total % 2 === 0
          ? passCountProsody >= total / 2 ? SessionResult.PASS : SessionResult.FAIL
          : passCountProsody > total / 2 ? SessionResult.PASS : SessionResult.FAIL;
    }

    return { fluencyResult, prosodyResult };
  }

  public async getComprehensionScore(
    userId: string,
    subSessionId: string,
    language: string,
    preloadedSessions?: any[],
  ) {
    const sessions = preloadedSessions ?? await this.getSubSessionScores(userId, subSessionId, language);
    const comprehensionScores: any[] = [];
    sessions.forEach((session: any) => {
      if (session.comprehension !== undefined) {
        comprehensionScores.push(session.comprehension);
      }
    });
    let overallScore = 0;
    let isComprehension = false;
    if (comprehensionScores.length > 0) {
      comprehensionScores.forEach((score) => {
        overallScore += score.overall;
      });
      isComprehension = true;
    }
    return { overallScore, isComprehension };
  }

  async getComprehensionFromLLM(questionText, studentText, teacherText) {
    const url = process.env.ALL_LLM_URL;

    const data = {
      questionText: questionText,
      studentText: studentText,
      teacherText: teacherText,
      markPrompt: '',
    };
    const comprehension = await lastValueFrom(
      this.httpService
        .post(url, JSON.stringify(data), {
          headers: {
            'Content-Type': 'application/json',
          },
        })
        .pipe(
          map((resp) => {
            const item = resp.data.responseObj.responseDataParams.data[0];
            return {
              marks: item.marks,
              semantics: item.semantics,
              context: item.context,
              grammar: item.grammar,
              accuracy: item.accuracy,
              overall: item.overall,
              feedback: item.feedback
            };
          }),
          catchError((error: AxiosError) => {
            throw mapAxiosToUpstreamHttpException(
              'llm',
              ErrorCodes.LLM_SERVICE_UNAVAILABLE,
              'Comprehension (LLM) service is unavailable or returned an error.',
              error,
            );
          }),
        ),
    );

    return comprehension;
  }

  public readonly ones: string[] = [
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine',
  ];

  public readonly teens: string[] = [
    'ten',
    'eleven',
    'twelve',
    'thirteen',
    'fourteen',
    'fifteen',
    'sixteen',
    'seventeen',
    'eighteen',
    'nineteen',
  ];

  public readonly tens: string[] = [
    '',
    '',
    'twenty',
    'thirty',
    'forty',
    'fifty',
    'sixty',
    'seventy',
    'eighty',
    'ninety',
  ];

  // Map word => digit
  async wordToNumber(word: string): Promise<number | null> {
    word = word.toLowerCase().replace(/-/g, ' ');
    const parts = word.split(' ');

    if (this.ones.includes(parts[0])) return this.ones.indexOf(parts[0]);
    if (this.teens.includes(parts[0])) return this.teens.indexOf(parts[0]) + 10;

    const tensIndex = this.tens.indexOf(parts[0]);
    if (tensIndex > 0 && parts.length === 1) return tensIndex * 10;
    if (tensIndex > 0 && parts.length === 2 && this.ones.includes(parts[1])) {
      return tensIndex * 10 + this.ones.indexOf(parts[1]);
    }

    return null;
  }

  // Map digit => word
  async numberToWords(num: number): Promise<string> {
    if (num < 10) return this.ones[num];
    if (num < 20) return this.teens[num - 10];
    if (num < 100) {
      const ten = Math.floor(num / 10);
      const one = num % 10;
      return one === 0 ? this.tens[ten] : `${this.tens[ten]}-${this.ones[one]}`;
    }
    if (num === 100) return 'one hundred';
    return num.toString();
  }

  async normalizeResponseText(
    original_text: string,
    response_text: string,
  ): Promise<string> {
    const originalWords = original_text.split(/\s+/);
    const responseWords = response_text.split(/\s+/);

    const resultPromises = responseWords.map(async (word, i) => {
      const originalWord = originalWords[i];

      const originalNum = parseInt(originalWord);
      const responseNum = parseInt(word);

      // Case: original is digit, response is word => convert word to number
      if (!isNaN(originalNum)) {
        const fromWord = await this.wordToNumber(word);
        if (fromWord !== null) return fromWord.toString();
      }

      // Case: original is word, response is digit => convert number to word
      if (isNaN(originalNum) && !isNaN(responseNum)) {
        return await this.numberToWords(responseNum);
      }

      return word;
    });

    const resultWords = await Promise.all(resultPromises);
    return resultWords.join(' ');
  }

  async mergeResponseWordsUsingOriginal(original: string, response: string) {
    const originalWordsSet = new Set(original.split(' '));
    const responseWords = response.split(' ');
    const mergedResponse: string[] = [];
    let i = 0;
    while (i < responseWords.length) {
      if (i + 1 < responseWords.length) {
        const merged = responseWords[i] + responseWords[i + 1];
        if (originalWordsSet.has(merged)) {
          mergedResponse.push(merged);
          i += 2;
          continue;
        }
      }
      // No merge, keep original response word
      mergedResponse.push(responseWords[i]);
      i += 1;
    }
    return mergedResponse.join(' ');
  }

  async getBestCorrectedResponse(
    original: string,
    response: string,
    substitutions: { [key: string]: string[] }
  ): Promise<string> {
    const originalClean = original.trim().toLowerCase();
    const responseWords = response.trim().toLowerCase().split(" ");

    let bestResponse = responseWords.slice();
    let maxSimilarity = await this.getTextSimilarity(originalClean, responseWords.join(" "));

    const backtrack = async (index: number, current: string[]) => {
      if (index === responseWords.length) {
        const currentStr = current.join(" ");
        const sim = await this.getTextSimilarity(originalClean, currentStr);
        if (sim > maxSimilarity) {
          maxSimilarity = sim;
          bestResponse = current.slice();
        }
        return;
      }

      const word = responseWords[index];
      let substituted = false;

      for (const key in substitutions) {
        const subs = substitutions[key];
        for (let i = 0; i < subs.length; i++) {
          if (subs[i] === word) {
            current.push(key); // substitute
            await backtrack(index + 1, current);
            current.pop();
            substituted = true;
          }
        }
      }

      // Try original word as-is
      current.push(word);
      await backtrack(index + 1, current);
      current.pop();
    };

    await backtrack(0, []);
    return bestResponse.join(" ");
  }

  async checkProfanity(text: string, language: string): Promise<boolean> {
    const filteredText = filterBadWords(text, language);
    return filteredText != text;
  }


  async getRecommendation(
    level: string,
    contentType: string,
    token_value: string,
    language: string
  ): Promise<any> {
    const data = JSON.stringify({
      level: level,
      content_type: contentType,
      language: language
    });

    const config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: process.env.RECOMENDATION_API_URL,
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token_value}`,
      },
      data: data,
    };

    try {
      const response = await axios.request(config);
      return response.data;
    } catch (error) {
      console.error(
        'Error in getRecommendation:',
        (error as any)?.response?.data || (error as Error).message,
      );
      throw mapAxiosToUpstreamHttpException(
        'recommendation',
        ErrorCodes.RECOMMENDATION_UNAVAILABLE,
        'Recommendation service is unavailable or returned an error.',
        error,
      );
    }
  }

  async getTowreData(userId: string, language: string) {
    const result = await this.towreModel
      .findOne({ user_id: userId, language: language })
      .sort({ createdAt: -1 })
      .select({ towre_result: 1, _id: 0 })
      .lean();

    if (!result || !result.towre_result || result.towre_result.length === 0) {
      return null;
    }
    const towre_result = result.towre_result;
    // standrd for towre
    const wordCount = 108;
    const totalSec = 45;

    const correctWordsCount = towre_result.filter(word => word.isCorrect).length;
    const wordsPerMinute = Math.round((correctWordsCount / totalSec) * 60);
    const unattemptedWordsCount = Math.max(0, wordCount - towre_result.length);
    const newWordsLearnt = correctWordsCount;
    const incorrectWordCount = towre_result.filter(word => !word.isCorrect).length;

    const towreData = {
      wordsPerMinute: wordsPerMinute,
      correctWordsCount: correctWordsCount,
      unattemptedWordsCount: unattemptedWordsCount,
      newWordsLearnt: newWordsLearnt,
      incorrectWordCount: incorrectWordCount
    }
    return towreData;
  }

  async vocabularyCount(
    user_id: string,
    original_text: string,
    response_text: string,
    language: string,
    session: string,
    subSession: string,
  ): Promise<void> {
    const originalWords = this.normalize(original_text);
    if (originalWords.length === 0) return;

    const responseWordsSet = new Set(this.normalize(response_text));
    const now = new Date();

    const ops: any[] = originalWords.map((word) => {
      const isCorrect = responseWordsSet.has(word);
      const filter = { user_id, contentId: word, language };

      if (isCorrect) {
        return {
          updateOne: {
            filter,
            update: {
              $inc: { presentCount: 1, spokenCorrectly: 1 },
              $set: { updatedAt: now },
              $push: { attempts: { session, subSession, createdAt: now } },
            },
            upsert: true,
          },
        };
      }

      // Incorrect word: only increment presentCount if the record already exists
      // upsert: false ensures no new document is created for unseen words
      return {
        updateOne: {
          filter,
          update: {
            $inc: { presentCount: 1 },
            $set: { updatedAt: now },
          },
          upsert: false,
        },
      };
    });

    await this.vocabularyModel.bulkWrite(ops, { ordered: false });
  }

  // Simple word normalization
  private normalize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[।?!.,;'"’“”\-–—()<>[\]{}]/g, '')
      .split(/\s+/)
      .filter(Boolean);
  }

  async getVocabularyCount(userId: string, language: string): Promise<number> {
    return this.vocabularyModel.countDocuments({
      user_id: userId,
      language,
      $expr: {
        $gte: [
          '$spokenCorrectly',
          { $multiply: ['$presentCount', 0.7] }
        ]
      }
    });
  }

  async voiceAuth(audio: string, user_id: string): Promise<any> {
    const data = JSON.stringify({
      audio: audio,
      user_id: user_id,
    });

    const config = {
      method: 'post',
      url: process.env.VOICE_API_URL,
      headers: {
        'accept': 'application/json',
        'Content-Type': 'application/json',
      },
      data: data,
    };

    try {
      const response = await axios.request(config);
      return response.data;
    } catch (error) {
      console.error('Error in Voice auth api:', error.response?.data || error.message);
      throw error;
    }
  }

  async getVocabularyStats(userId: string): Promise<{ learned_words_count: number; understood_words_count: number }> {
    try {
      const vocabularyStats = await this.correctPracticeWordModel.aggregate([
        {
          $match: { user_id: userId }
        },
        {
          $group: {
            _id: null,
            learned_words_count: {
              $sum: { $cond: [{ $eq: ["$learned", true] }, 1, 0] }
            },
            understood_words_count: {
              $sum: { $cond: [{ $eq: ["$understood", true] }, 1, 0] }
            }
          }
        }
      ]);

      return {
        learned_words_count: vocabularyStats[0]?.learned_words_count || 0,
        understood_words_count: vocabularyStats[0]?.understood_words_count || 0
      };
    } catch (error) {
      console.error('Error getting vocabulary stats:', error);
      throw error;
    }
  }

  async calculateAnsSelectionResult(userId: string, sessionId: string, subSessionId: string, language: string): Promise<{ result: boolean; percentage: number } | null> {
    try {
      const user = await this.scoreModel.findOne({
        user_id: userId,
        sessions: {
          $elemMatch: {
            session_id: sessionId,
            sub_session_id: subSessionId,
            language,
            ansSelectionStatus: { $exists: true, $ne: null }
          }
        }
      }).exec();

      if (!user) {
        return null;
      }

      const session = user.sessions.find(s =>
        s.session_id === sessionId &&
        s.sub_session_id === subSessionId &&
        s.language === language &&
        s.ansSelectionStatus
      );

      if (!session || !session.ansSelectionStatus) {
        return null;
      }

      let correctCount = 0;
      let totalCount = 0;

      // Handle new array format: [{ text: "a", status: true, gameType: "..." }, ...]
      if (Array.isArray(session.ansSelectionStatus)) {
        totalCount = session.ansSelectionStatus.length;
        correctCount = session.ansSelectionStatus.filter(item =>
          item && typeof item === 'object' && item.status === true
        ).length;
      }
      // Handle old object format: { "a": true, "b": false, ... } (backward compatibility)
      else if (typeof session.ansSelectionStatus === 'object') {
        const values = Object.values(session.ansSelectionStatus);
        totalCount = values.length;
        correctCount = values.filter(Boolean).length;
      }
      else {
        return null;
      }

      const percentage = totalCount > 0 ? Math.floor((correctCount / totalCount) * 100) : 0;
      const result = totalCount > 0 ? percentage >= 80 : false;

      return { result, percentage };
    } catch (err) {
      console.error('Error calculating ansSelectionResult:', err);
      return null;
    }
  }

  async createAssessmentTracking(
    createAssessmentTrackingDto: CreateAssessmentTrackingDto,
    tenantId?: string,
    userId?: string
  ): Promise<any> {
    try {

      // Generate assessmentTrackingId if not provided
      if (!createAssessmentTrackingDto.assessmentTrackingId) {
        createAssessmentTrackingDto.assessmentTrackingId = randomUUID();
      }

      // Set default values
      if (!createAssessmentTrackingDto.createdOn) {
        createAssessmentTrackingDto.createdOn = new Date();
      }

      // Handle submitedBy and evaluatedBy
      if (
        !createAssessmentTrackingDto.submitedBy ||
        createAssessmentTrackingDto.submitedBy === ''
      ) {
        createAssessmentTrackingDto.submitedBy = 'Online';
      } else {
        const allowedValues = ['AI', 'Online', 'Manual', 'AI Evaluator'];
        if (createAssessmentTrackingDto.submitedBy === 'AI Evaluator') {
          createAssessmentTrackingDto.submitedBy = 'AI';
        }
        if (!allowedValues.includes(createAssessmentTrackingDto.submitedBy)) {
          createAssessmentTrackingDto.submitedBy = 'Online';
        }
      }

      createAssessmentTrackingDto.evaluatedBy =
        createAssessmentTrackingDto.submitedBy as EvaluationType;

      // Add tenantId if provided
      if (tenantId) {
        createAssessmentTrackingDto.tenantId = tenantId;
      }

      // Calculate session result
      let sessionResult = "pass";
      const passingThreshold = 80;

      // Calculate total score and maxScore from assessmentSummary
      let totalScore = 0;
      let totalMaxScore = 0;

      if (createAssessmentTrackingDto.courseId === "letterLauncher") {
        totalScore = createAssessmentTrackingDto.totalScore || 0;
        totalMaxScore = (createAssessmentTrackingDto.totalMaxScore || 0) * 5;

      } else {
        // For other courses, calculate from assessmentSummary
        const assessmentSummaryData = createAssessmentTrackingDto.assessmentSummary || [];

        for (const section of assessmentSummaryData) {
          const itemData = section?.data || [];
          for (const dataItem of itemData) {
            totalScore += dataItem?.score || 0;
            totalMaxScore += dataItem?.item?.maxscore || 0;
          }
        }
      }

      const scorePercentage = totalMaxScore > 0
        ? Math.round((totalScore / totalMaxScore) * 100)
        : 0;


      if (scorePercentage < passingThreshold) {
        sessionResult = "fail";
      }

      // Extract target_char (score=0) and familiarity_char (score=1) from assessmentSummary
      const targetCharSet = new Set<string>();
      const familiarityCharSet = new Set<string>();
      const assessmentSummary = createAssessmentTrackingDto.assessmentSummary || [];

      for (const section of assessmentSummary) {
        const itemData = section?.data || [];
        for (const dataItem of itemData) {
          let correctAnswer = dataItem?.resvalues?.[0]?.correctAnswer;
          if (correctAnswer) {
            if (correctAnswer.includes(':')) {
              correctAnswer = correctAnswer.split(':')[0];
            }
            if (dataItem?.score === 0) {
              targetCharSet.add(correctAnswer);
            } else if (dataItem?.score === 1) {
              familiarityCharSet.add(correctAnswer);
            }
          }
        }
      }

      // Remove from familiarity_char if it exists in target_char
      for (const char of targetCharSet) {
        familiarityCharSet.delete(char);
      }

      const target_char = Array.from(targetCharSet);
      const familiarity_char = Array.from(familiarityCharSet);

      // Handle Manual submission - update existing record if found
      if (createAssessmentTrackingDto.submitedBy === 'Manual') {
        const existingRecord = await this.assessmentTrackingModel.findOne({
          userId: userId,
          contentId: createAssessmentTrackingDto.contentId,
          courseId: createAssessmentTrackingDto.courseId,
          unitId: createAssessmentTrackingDto.unitId,
        });

        if (existingRecord) {
          // Update existing record
          Object.assign(existingRecord, createAssessmentTrackingDto);
          existingRecord.assessmentTrackingId = existingRecord.assessmentTrackingId;
          existingRecord.userId = userId;
          existingRecord.updatedOn = new Date();

          const updatedRecord = await existingRecord.save();

          // Delete existing score details
          await this.assessmentTrackingScoreDetailModel.deleteMany({
            assessmentTrackingId: existingRecord.assessmentTrackingId,
          });

          // Save new score details
          await this.saveScoreDetails(
            createAssessmentTrackingDto,
            existingRecord.assessmentTrackingId,
            userId
          );

          return {
            ...updatedRecord.toObject(),
            sessionResult: sessionResult,
            target_char: target_char,
            familiarity_char: familiarity_char,
          };
        }
      }

      // Create new assessment tracking record
      const assessmentTrackingData = {
        assessmentTrackingId: createAssessmentTrackingDto.assessmentTrackingId,
        userId: userId,
        courseId: createAssessmentTrackingDto.courseId,
        session_id: createAssessmentTrackingDto.session_id,
        sub_session_id: createAssessmentTrackingDto.sub_session_id,
        sub_milestone_level: createAssessmentTrackingDto.sub_milestone_level,
        apply_level: createAssessmentTrackingDto.apply_level,
        sub_apply_level: createAssessmentTrackingDto.sub_apply_level,
        contentId: createAssessmentTrackingDto.contentId,
        attemptId: createAssessmentTrackingDto.attemptId,
        createdOn: createAssessmentTrackingDto.createdOn,
        lastAttemptedOn: createAssessmentTrackingDto.lastAttemptedOn,
        assessmentSummary: createAssessmentTrackingDto.assessmentSummary,
        totalMaxScore: createAssessmentTrackingDto.totalMaxScore,
        totalScore: createAssessmentTrackingDto.totalScore,
        updatedOn: new Date(),
        timeSpent: createAssessmentTrackingDto.timeSpent,
        unitId: createAssessmentTrackingDto.unitId,
        tenantId: createAssessmentTrackingDto.tenantId,
        showFlag: createAssessmentTrackingDto.showFlag !== undefined
          ? createAssessmentTrackingDto.showFlag
          : true,
        evaluatedBy: createAssessmentTrackingDto.evaluatedBy,
        submitedBy: createAssessmentTrackingDto.submitedBy,
      };

      // Define valid values
      const validSubMilestoneLevels = ["F1", "F2", "F3"];
      const validApplyLevels = ["A1", "A2", "A3"];

      // Check conditions for creating milestone record
      const subMilestoneLevel = createAssessmentTrackingDto.sub_milestone_level;
      const applyLevel = createAssessmentTrackingDto.apply_level;
      const subApplyLevel = createAssessmentTrackingDto.sub_apply_level;

      // F1 exit criteria: A3-L9 → milestone level B
      if (
        subMilestoneLevel === "F1" &&
        applyLevel === "A3" &&
        subApplyLevel === 9 &&
        createAssessmentTrackingDto.session_id &&
        createAssessmentTrackingDto.sub_session_id
      ) {
        try {
          const milestoneLevel = "B";
          let finalSubMilestoneLevel: string;

          // Determine next sub-milestone level when completing A3-L9
          if (sessionResult === "pass") {
            finalSubMilestoneLevel = "F2";
          } else {
            finalSubMilestoneLevel = "F1";
          }

          await this.createMilestoneRecord({
            user_id: userId,
            session_id: createAssessmentTrackingDto.session_id,
            sub_session_id: createAssessmentTrackingDto.sub_session_id,
            milestone_level: milestoneLevel,
            sub_milestone_level: finalSubMilestoneLevel,
            language: createAssessmentTrackingDto.unitId
          });

        } catch (milestoneError) {
          console.error('Error creating milestone record:', milestoneError);
        }
      }
      // F2 exit criteria: A3-L18 → milestone level B
      else if (
        subMilestoneLevel === "F2" &&
        applyLevel === "A3" &&
        subApplyLevel === 18 &&
        createAssessmentTrackingDto.session_id &&
        createAssessmentTrackingDto.sub_session_id
      ) {
        try {
          const milestoneLevel = "B";
          let finalSubMilestoneLevel: string;

          // Determine next sub-milestone level when completing A3-L9
          if (sessionResult === "pass") {
            finalSubMilestoneLevel = "F3";
          } else {
            finalSubMilestoneLevel = "F2";
          }

          await this.createMilestoneRecord({
            user_id: userId,
            session_id: createAssessmentTrackingDto.session_id,
            sub_session_id: createAssessmentTrackingDto.sub_session_id,
            milestone_level: milestoneLevel,
            sub_milestone_level: finalSubMilestoneLevel,
            language: createAssessmentTrackingDto.unitId
          });

        } catch (milestoneError) {
          console.error('Error creating milestone record:', milestoneError);
        }
      }
      else if (
        subMilestoneLevel === "F3" &&
        applyLevel === "A2" &&
        subApplyLevel === 24 &&
        createAssessmentTrackingDto.courseId === "memoryChallenge" &&
        createAssessmentTrackingDto.session_id &&
        createAssessmentTrackingDto.sub_session_id
      ) {
        try {
          let finalMilestoneLevel: string;
          let finalSubMilestoneLevel: string;

          if (sessionResult === "pass") {
            finalMilestoneLevel = "m1";
            finalSubMilestoneLevel = "";
          } else {
            finalMilestoneLevel = "B";
            finalSubMilestoneLevel = "F3";
          }

          await this.createMilestoneRecord({
            user_id: userId,
            session_id: createAssessmentTrackingDto.session_id,
            sub_session_id: createAssessmentTrackingDto.sub_session_id,
            milestone_level: finalMilestoneLevel,
            sub_milestone_level: finalSubMilestoneLevel,
            language: createAssessmentTrackingDto.unitId
          });

        } catch (milestoneError) {
          console.error('Error creating milestone record:', milestoneError);
        }
      }

      const createdAssessment = new this.assessmentTrackingModel(
        assessmentTrackingData,
      );
      const result = await createdAssessment.save();

      // Save score details
      await this.saveScoreDetails(
        createAssessmentTrackingDto,
        result.assessmentTrackingId,
        userId
      );

      return {
        ...result.toObject(),
        sessionResult: sessionResult,
        target_char: target_char,
        familiarity_char: familiarity_char,
      };
    } catch (err) {
      console.error('Error creating assessment tracking:', err);
      throw err;
    }
  }

  private async saveScoreDetails(
    createAssessmentTrackingDto: CreateAssessmentTrackingDto,
    assessmentTrackingId: string,
    userId: string
  ): Promise<void> {
    try {
      const score_detail = createAssessmentTrackingDto.assessmentSummary;
      const scoreObj = [];
      const {
        session_id,
        sub_session_id,
        sub_milestone_level,
        apply_level,
        sub_apply_level,
        unitId
      } = createAssessmentTrackingDto;

      for (let i = 0; i < score_detail.length; i++) {
        const section: any = score_detail[i];
        const itemData = section?.data;
        if (itemData) {
          for (let j = 0; j < itemData.length; j++) {
            const dataItem = itemData[j];
            scoreObj.push({
              userId: userId,
              assessmentTrackingId: assessmentTrackingId,
              questionId: dataItem?.item?.id,
              pass: dataItem?.pass,
              sectionId: dataItem?.item?.sectionId,
              resValue: dataItem?.resvalues
                ? JSON.stringify(dataItem.resvalues)
                : '',
              duration: dataItem?.duration,
              score: dataItem?.score,
              maxScore: dataItem?.item?.maxscore,
              queTitle: dataItem?.item?.title,
              feedback: dataItem?.resvalues?.[0]?.AI_suggestion || '',
              session_id,
              sub_session_id,
              sub_milestone_level,
              apply_level,
              sub_apply_level,
              language: unitId
            });
          }
        }
      }

      if (scoreObj.length > 0) {
        await this.assessmentTrackingScoreDetailModel.insertMany(scoreObj);
      }
    } catch (e) {
      console.error('Error in CreateScoreDetail:', e);
      throw e;
    }
  }

  /**
   * Alert : This api is only for the UAT, Manually set milestone for a user 
   * Used for admin/manual milestone assignment
   */
  async setMilestoneManually(setMilestoneData: {
    user_id: string;
    language: string;
    milestone_level: string;
    sub_milestone_level?: string;
    session_id?: string;
    sub_session_id?: string;
  }): Promise<any> {
    try {
      // Validate milestone_level format
      const validMainMilestones = ['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'B'];
      if (!validMainMilestones.includes(setMilestoneData.milestone_level)) {
        throw new Error(
          `Invalid milestone_level: ${setMilestoneData.milestone_level}. Must be one of: ${validMainMilestones.join(', ')}`
        );
      }

      // Validate sub_milestone_level if provided
      if (setMilestoneData.sub_milestone_level) {
        const validSubMilestones = ['F1', 'F2', 'F3'];
        if (!validSubMilestones.includes(setMilestoneData.sub_milestone_level)) {
          throw new Error(
            `Invalid sub_milestone_level: ${setMilestoneData.sub_milestone_level}. Must be one of: ${validSubMilestones.join(', ')}`
          );
        }
      }

      // Generate session_id and sub_session_id if not provided
      const session_id = setMilestoneData.session_id || `manual-${Date.now()}`;
      const sub_session_id = setMilestoneData.sub_session_id || `manual-sub-${Date.now()}`;

      const insertData = {
        session_id: session_id,
        sub_session_id: sub_session_id,
        milestone_level: setMilestoneData.milestone_level,
        sub_milestone_level: setMilestoneData.sub_milestone_level || '',
        language: setMilestoneData.language,
        createdAt: new Date().toISOString().replace('Z', '+00:00'),
      };

      const userExists = await this.scoreModel.findOne({ user_id: setMilestoneData.user_id });

      if (!userExists) {
        await this.scoreModel.create({
          user_id: setMilestoneData.user_id,
          milestone_progress: [insertData],
          sessions: [],
        });
      } else {
        await this.scoreModel.updateOne(
          { user_id: setMilestoneData.user_id },
          {
            $push: {
              milestone_progress: insertData,
            },
          },
        );
      }

      const latestMilestone = await this.getlatestmilestone(
        setMilestoneData.user_id,
        setMilestoneData.language,
      );

      return {
        success: true,
        message: 'Milestone set successfully',
        data: {
          user_id: setMilestoneData.user_id,
          language: setMilestoneData.language,
          milestone_level: setMilestoneData.milestone_level,
          sub_milestone_level: setMilestoneData.sub_milestone_level || '',
          latest_milestone: latestMilestone[0] || null,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'Failed to set milestone',
        details: err,
      };
    }
  }
}




