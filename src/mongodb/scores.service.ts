import { Inject, Injectable } from '@nestjs/common';
import { ScoreDocument } from './schemas/scores.schema';
import {
  hexcodeMappingDocument,
} from './schemas/hexcodeMapping.schema';
import {
  assessmentInputDocument,
} from './schemas/assessmentInput.schema';
import { denoiserOutputLogsDocument } from './schemas/denoiserOutputLogs.schema';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
import { catchError, lastValueFrom, map } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { CacheService } from './cache/cache.service';
import lang_common_config from "./config/language/common/commonConfig"

@Injectable()
export class ScoresService {
  constructor(
    @InjectModel('Score') private readonly scoreModel: Model<ScoreDocument>,
    @InjectModel('hexcodeMapping')
    private readonly hexcodeMappingModel: Model<hexcodeMappingDocument>,
    @InjectModel('assessmentInput')
    private readonly assessmentInputModel: Model<assessmentInputDocument>,
    @InjectModel('denoiserOutputLogs') private readonly denoiserOutputLogsModel: Model<denoiserOutputLogsDocument>,
    private readonly cacheService: CacheService,
    private readonly httpService: HttpService,
  ) { }

  async create(createScoreDto: any): Promise<any> {
    try {
      const recordData = await this.scoreModel
        .find({ user_id: createScoreDto.user_id })
        .exec();
      if (recordData.length === 0) {
        const createdScore = new this.scoreModel(createScoreDto);
        const result = await createdScore.save();
        const updatedRecordData = this.scoreModel.updateOne(
          { user_id: createScoreDto.user_id },
          { $push: { sessions: createScoreDto.session } },
        );
        return await updatedRecordData;
      } else {
        const updatedRecordData = this.scoreModel.updateOne(
          { user_id: createScoreDto.user_id },
          { $push: { sessions: createScoreDto.session } },
        );
        return await updatedRecordData;
      }
    } catch (err) {
      return err;
    }
  }

  async createMilestoneRecord(createMilestoneRecord: any): Promise<any> {
    try {
      const insertData = {
        session_id: createMilestoneRecord.session_id,
        sub_session_id: createMilestoneRecord.sub_session_id,
        milestone_level: createMilestoneRecord.milestone_level,
        sub_milestone_level: createMilestoneRecord.sub_milestone_level,
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

      return updatedRecordData;
    } catch (err) {
      return err;
    }
  }

  async audioFileToAsrOutput(data: any, language: string, contentType: string): Promise<any> {
    let asrOutDenoisedOutput: any;
    let asrOutBeforeDenoised: any;
    let audio: any = data;
    let pause_count: number = 0;

    let serviceId = '';
    switch (language) {
      case 'kn':
        serviceId = 'ai4bharat/conformer-multilingual-dravidian--gpu-t4';
        break;
      case 'ta':
        serviceId = 'ai4bharat/conformer-multilingual-dravidian--gpu-t4';
        break;
      case 'en':
        serviceId = 'ai4bharat/whisper--gpu-t4';
        break;
      case 'hi':
        serviceId = 'ai4bharat/conformer-hi--gpu-t4';
        break;
      case "te":
        serviceId = "ai4bharat/conformer-multilingual-dravidian--gpu-t4";
        break;
      default:
        serviceId = `ai4bharat/conformer-${language}-gpu--t4`;
    }

    if (process.env.skipNonDenoiserAsrCall !== "true") {
      asrOutBeforeDenoised = await asrCall();
    }



    let denoiserConfig =
    {
      method: 'post',
      url: process.env.ALL_TEXT_EVAL_API + '/audio_processing',
      headers: {
        'Content-Type': 'application/json'
      },
      data: {
        "base64_string": audio,
        "enableDenoiser": process.env.denoiserEnabled === "true" ? true : false,
        "enablePauseCount": true,
        "contentType": contentType
      }
    }

    await axios.request(denoiserConfig)
      .then((response) => {
        audio = response.data.denoised_audio_base64;
        pause_count = response.data.pause_count;
      })
      .catch((error) => {
        console.log(error);
      });

    if (process.env.denoiserEnabled === "true") {
      asrOutDenoisedOutput = await asrCall();
    }

    async function asrCall() {
      let output: any;

      let optionsObj = {
        "config": {
          "serviceId": serviceId,
          "language": {
            "sourceLanguage": language
          },
          "audioFormat": "wav",
          "transcriptionFormat": {
            "value": "transcript"
          },
          "bestTokenCount": 2
        },
        "audio": [
          {
            "audioContent": audio
          }
        ]
      }

      if (language === "en") {
        delete optionsObj.config.bestTokenCount
      }

      let options = JSON.stringify(optionsObj);

      let config = {
        method: 'post',
        url: process.env.AI4BHARAT_URL,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': process.env.AI4BHARAT_API_KEY
        },
        data: options
      };

      await axios.request(config)
        .then((response) => {
          output = response.data;
        })
        .catch((error) => {
          console.log(error);
        });

      return output;
    }

    return { asrOutDenoisedOutput: asrOutDenoisedOutput, asrOutBeforeDenoised: asrOutBeforeDenoised, pause_count: pause_count };
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

  async getRetryStatus(userId: string, contentId: string) {
    try {
      const recordData = await this.scoreModel.find({ user_id: userId }).exec();
      const updatedRecords = [];
      for (const record of recordData) {
        if (record.sessions.length > 0) {
          const lastSession = record.sessions[record.sessions.length - 1];
          if (lastSession.contentId === contentId) {
            lastSession.isRetry = true;
            const updatedRecord = await this.scoreModel.updateOne(
              {
                'sessions._id': lastSession._id,
              },
              {
                $set: { 'sessions.$': lastSession },
              },
            );
            updatedRecords.push(updatedRecord);
          }
        }
      }
      return 1;
    } catch (error) {
      console.error('Error fetching retry status:', error);
      throw error;
    }
  }

  async getTargetsBySession(sessionId: string, language: string = null) {
    const threshold = 0.9;
    const RecordData = await this.scoreModel.aggregate([
      {
        $unwind: '$sessions',
      },
      {
        $match: {
          'sessions.session_id': sessionId,
        },
      },
      {
        $unwind: '$sessions.confidence_scores',
      },
      {
        $project: {
          _id: 0,
          user_id: 1,
          date: '$sessions.date',
          session_id: '$sessions.session_id',
          language: '$sessions.language',
          character: '$sessions.confidence_scores.token',
          score: '$sessions.confidence_scores.confidence_score',
          isRetryExists: { $ifNull: ['$sessions.isRetry', false] }
        }
      },
      {
        $match: {
          $or: [
            { isRetryExists: false },
            { 'sessions.isRetry': false }
          ]
        }
      },
    ]);

    const MissingRecordData = await this.scoreModel.aggregate([
      {
        $unwind: '$sessions',
      },
      {
        $match: {
          'sessions.session_id': sessionId,
        },
      },
      {
        $unwind: '$sessions.missing_token_scores',
      },
      {
        $project: {
          _id: 0,
          user_id: 1,
          date: '$sessions.date',
          session_id: '$sessions.session_id',
          language: '$sessions.language',
          character: '$sessions.missing_token_scores.token',
          score: '$sessions.missing_token_scores.confidence_score',
        },
      },
    ]);

    const charScoreData = [];

    const uniqueChar = new Set();

    for (const RecordDataele of RecordData) {
      if (language != null && RecordDataele.language === language) {
        uniqueChar.add(RecordDataele.character);
      } else if (language === null) {
        uniqueChar.add(RecordDataele.character);
      }
    }

    for (const char of uniqueChar) {
      let score = 0;
      let count = 0;
      for (const checkRecordDataele of RecordData) {
        if (
          char === checkRecordDataele.character &&
          checkRecordDataele.score >= score
        ) {
          score += checkRecordDataele.score;
          count++;
        }
      }
      const avgScore = score / count;
      if (avgScore < 0.9 && count > 0) {
        charScoreData.push({ character: char, score: avgScore });
      }
    }

    const missingUniqueChar = new Set();

    for (const MissingRecordDataEle of MissingRecordData) {
      if (
        !uniqueChar.has(MissingRecordDataEle.character) &&
        !missingUniqueChar.has(MissingRecordDataEle.character) &&
        language != null &&
        MissingRecordDataEle.language === language
      ) {
        charScoreData.push({
          character: MissingRecordDataEle.character,
          score: MissingRecordDataEle.score,
        });
        missingUniqueChar.add(MissingRecordDataEle.character);
      } else if (
        !uniqueChar.has(MissingRecordDataEle.character) &&
        !missingUniqueChar.has(MissingRecordDataEle.character)
      ) {
        charScoreData.push({
          character: MissingRecordDataEle.character,
          score: MissingRecordDataEle.score,
        });
        missingUniqueChar.add(MissingRecordDataEle.character);
      }
    }

    return charScoreData.sort((a, b) => a.score - b.score);
  }

  async getTargetsByContentId(
    subSessionId: string,
    contentType: string,
    language: string,
    contentId: string,
  ) {
    const threshold = 0.7;
    let RecordData = [];

    RecordData = await this.scoreModel.aggregate([
      {
        $unwind: '$sessions',
      },
      {
        $match: {
          'sessions.sub_session_id': subSessionId,
          'sessions.language': language,
          'sessions.contentId': contentId,
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
                user_id: 1,
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
                user_id: 1,
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
          user_id: '$user_id',
          sessionId: '$session_id',
          date: '$date',
          token: '$character',
          score: '$score',
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
    subSessionId: string,
    contentType: string,
    language: string,
  ) {
    const threshold = 0.7;
    let RecordData = [];

    RecordData = await this.scoreModel.aggregate([
      {
        $unwind: '$sessions',
      },
      {
        $match: {
          'sessions.sub_session_id': subSessionId,
          'sessions.language': language
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
                user_id: 1,
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
                user_id: 1,
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
          user_id: '$user_id',
          sessionId: '$session_id',
          date: '$date',
          token: '$character',
          score: '$score',
          isRetryExists: { $ifNull: ['$sessions.isRetry', false] }
        }
      },
      {
        $match: {
          $or: [
            { isRetryExists: false },
            { 'sessions.isRetry': false }
          ]
        }
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

  async getTargetsByUser(userId: string, language: string = null) {
    const threshold = 0.7;
    let RecordData = [];

    RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          user_id: userId
        }
      },
      {
        $unwind: '$sessions',
      },
      {
        $match: {
          'sessions.language': language
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
                user_id: 1,
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
                user_id: 1,
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
          user_id: '$user_id',
          sessionId: '$session_id',
          date: '$date',
          token: '$character',
          score: '$score',
          isRetryExists: { $ifNull: ['$sessions.isRetry', false] }
        }
      },
      {
        $match: {
          $or: [
            { isRetryExists: false },
            { 'sessions.isRetry': false }
          ]
        }
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
          character: "$_id.token",
          latestScores: {
            $slice: ['$scores', -5]
          }
        }
      },
      {
        $addFields: {
          countBelowThreshold: {
            $size: {
              $filter: {
                input: '$latestScores',
                as: 'score',
                cond: {
                  $lt: ['$$score', threshold]
                }
              }
            }
          },
          countAboveThreshold: {
            $size: {
              $filter: {
                input: '$latestScores',
                as: 'score',
                cond: {
                  $gte: ['$$score', threshold]
                }
              }
            }
          },
          avgScore: { $avg: "$latestScores" }
        }
      },
      {
        $match: {
          $expr: {
            $gt: ['$countBelowThreshold', '$countAboveThreshold'],

          }
        }
      },
      {
        $project: {
          character: 1,
          score: "$avgScore"
        }
      },
      {
        $addFields: {
          score: {
            $divide: [
              { $trunc: { $multiply: ['$score', 100] } },
              100
            ]
          }
        }
      }
    ]
    );

    return RecordData;
  }

  async getFamiliarityBySession(sessionId: string) {
    const threshold = 0.9;
    const RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          'sessions.session_id': sessionId,
        },
      },
      {
        $unwind: '$sessions',
      },
      {
        $match: {
          'sessions.session_id': sessionId,
        },
      },
      {
        $unwind: '$sessions.confidence_scores',
      },
      // {
      //   $match: {
      //     'sessions.confidence_scores.confidence_score': { $gte: threshold }
      //   }
      // },
      {
        $match: {
          'sessions.session_id': sessionId,
        },
      },
      {
        $project: {
          _id: 0,
          character: '$sessions.confidence_scores.token',
          score: '$sessions.confidence_scores.confidence_score',
        },
      },
    ]);
    const charScoreData = [];

    const uniqueChar = new Set();

    for (const RecordDataele of RecordData) {
      uniqueChar.add(RecordDataele.character);
    }

    for (const char of uniqueChar) {
      let score = 0;
      let count = 0;
      for (const checkRecordDataele of RecordData) {
        if (
          char === checkRecordDataele.character &&
          checkRecordDataele.score >= score
        ) {
          score += checkRecordDataele.score;
          count++;
        }
      }

      const avgScore = score / count;
      if (avgScore >= 0.9) {
        charScoreData.push({ character: char, score: score });
      }
    }

    return charScoreData.sort((a, b) => a.score - b.score);
  }

  async getFamiliarityBysubSession(
    subSessionId: string,
    contentType: string,
    language: string,
  ) {
    const threshold = 0.7;

    let RecordData = [];

    RecordData = await this.scoreModel.aggregate([
      {
        $unwind: '$sessions',
      },
      {
        $match: {
          'sessions.sub_session_id': subSessionId,
          'sessions.language': language
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
                user_id: 1,
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
                user_id: 1,
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
          user_id: '$user_id',
          sessionId: '$session_id',
          date: '$date',
          token: '$character',
          score: '$score',
          isRetryExists: { $ifNull: ['$sessions.isRetry', false] }
        }
      },
      {
        $match: {
          $or: [
            { isRetryExists: false },
            { 'sessions.isRetry': false }
          ]
        }
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

  async getFamiliarityByUser(userId: string, language: string) {
    const threshold = 0.7;
    let RecordData = [];

    RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          user_id: userId
        }
      },
      {
        $unwind: '$sessions',
      },
      {
        $match: {
          'sessions.language': language
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
                user_id: 1,
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
                user_id: 1,
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
          user_id: '$user_id',
          sessionId: '$session_id',
          date: '$date',
          token: '$character',
          score: '$score',
          isRetryExists: { $ifNull: ['$sessions.isRetry', false] }
        }
      },
      {
        $match: {
          $or: [
            { isRetryExists: false },
            { 'sessions.isRetry': false }
          ]
        }
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
          }
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
          score: { $avg: "$latestScores" }
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

  async getFluencyBysubSession(subSessionId: string, language: string) {
    const RecordData = await this.scoreModel.aggregate([
      {
        $unwind: '$sessions',
      },
      {
        $match: {
          'sessions.sub_session_id': subSessionId,
          'sessions.language': language
        },
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
          isRetryExists: { $ifNull: ['$sessions.isRetry', false] }
        }
      },
      {
        $match: {
          $or: [
            { isRetryExists: false },
            { 'sessions.isRetry': false }
          ]
        }
      },
    ]);

    return RecordData[0]?.fluencyScore || 0;
  }

  async findbyUser(id: string) {
    const UserRecordData = await this.scoreModel.find({ user_id: id }).exec();
    return UserRecordData;
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
      console.log("data from cache");
    }

    return recordData;
  }

  async getMeanLearnerBySession(sessionId: string) {
    const RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          'sessions.session_id': sessionId,
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
    const RecordData = await this.scoreModel
      .aggregate([
        {
          $match: {
            user_id: userId,
          },
        },
        {
          $unwind: '$milestone_progress',
        },
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
                            $eq: [
                              '$$session.sub_session_id',
                              '$sub_session_id',
                            ],
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
        {
          $match: {
            language: language,
          },
        },
        {
          $sort: {
            createdAt: -1,
          },
        },
      ])
      .limit(1);
    return RecordData;
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
          'sessions.session_id': sessionId,
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
    console.log(RecordData);
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

  async addDenoisedOutputLog(DenoisedOutputLog: any): Promise<any> {
    try {
      const createDenoisedOutputLog = new this.denoiserOutputLogsModel(DenoisedOutputLog);
      const result = await createDenoisedOutputLog.save();
      return result;
    } catch (err) {
      return err;
    }
  }

  async getSubessionIds(user_id: string) {
    const RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          "user_id": user_id
        }
      },
      {
        $unwind: '$sessions'
      },
      {
        $project: {
          _id: 0,
          sub_session_ids: '$sessions.sub_session_id',
          createdAt: '$sessions.createdAt'
        }
      },
      {
        $group: {
          _id: {
            sub_session_id: "$sub_session_ids",
          },
          createdAt: { $max: "$createdAt" }
        }
      },
      {
        $project: {
          _id: 0,
          sub_session_id: '$_id.sub_session_id',
          createdAt: '$createdAt'
        }
      },
    ]);
    return RecordData;
  }

  async getTargetsBysubSessionUserProfile(subSessionId: string, language: string) {
    let threshold = 0.70;

    const RecordData = await this.scoreModel.aggregate([
      {
        $unwind: '$sessions'
      },
      {
        $match: {
          'sessions.sub_session_id': subSessionId,
          'sessions.language': language
        }
      },
      {
        $facet: {
          confidenceScores: [
            {
              $unwind: '$sessions.confidence_scores'
            },
            {
              $project: {
                _id: 0,
                date: '$sessions.createdAt',
                original_text: '$sessions.original_text',
                response_text: '$sessions.response_text',
                character: '$sessions.confidence_scores.token',
                score: '$sessions.confidence_scores.confidence_score',
              }
            },
            {
              $sort: {
                date: -1
              }
            }
          ],
          missingTokenScores: [
            {
              $unwind: '$sessions.missing_token_scores'
            },
            {
              $project: {
                _id: 0,
                date: '$sessions.createdAt',
                original_text: '$sessions.original_text',
                response_text: '$sessions.response_text',
                character: '$sessions.missing_token_scores.token',
                score: '$sessions.missing_token_scores.confidence_score'
              }
            },
            {
              $sort: {
                date: -1
              }
            }
          ]
        }
      },
      {
        $project: {
          combinedResults: {
            $concatArrays: ['$confidenceScores', '$missingTokenScores']
          }
        }
      },
      {
        $unwind: '$combinedResults'
      },
      {
        $replaceRoot: {
          newRoot: '$combinedResults'
        }
      },
      {
        $project: {
          original_text: '$original_text',
          response_text: '$response_text',
          date: '$date',
          token: '$character',
          score: '$score',
          isRetryExists: { $ifNull: ['$sessions.isRetry', false] }
        }
      },
      {
        $match: {
          $or: [
            { isRetryExists: false },
            { 'sessions.isRetry': false }
          ]
        }
      },
      {
        $sort: {
          date: -1
        }
      },
      {
        $group: {
          _id: {
            token: "$token"
          },
          scores: {
            $push: {
              score: '$score',
              original_text: '$original_text',
              response_text: '$response_text'
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          character: "$_id.token",
          latestScores: {
            $slice: ['$scores', -5]
          }
        }
      },
      {
        $addFields: {
          countBelowThreshold: {
            $size: {
              $filter: {
                input: '$latestScores',
                as: 'score',
                cond: {
                  $lt: ['$$score.score', threshold]
                }
              }
            }
          },
          countAboveThreshold: {
            $size: {
              $filter: {
                input: '$latestScores',
                as: 'score',
                cond: {
                  $gte: ['$$score.score', threshold]
                }
              }
            }
          },
          avgScore: { $avg: '$latestScores.score' }
        }
      },
      {
        $project: {
          character: 1,
          countBelowThreshold: 1,
          countAboveThreshold: 1,
          avgScore: 1,
          latestScores: 1
        }
      },
      {
        $match: {
          $expr: {
            $lt: ['$countBelowThreshold', '$countAboveThreshold']
          }
        }
      }
    ]);

    return RecordData;
  }

  async getFamiliarityBysubSessionUserProfile(subSessionId: string, language: string) {
    let threshold = 0.70;
    let RecordData = [];

    RecordData = await this.scoreModel.aggregate([
      {
        $unwind: '$sessions'
      },
      {
        $match: {
          'sessions.sub_session_id': subSessionId,
          'sessions.language': language
        }
      },
      {
        $facet: {
          confidenceScores: [
            {
              $unwind: '$sessions.confidence_scores'
            },
            {
              $project: {
                _id: 0,
                date: '$sessions.createdAt',
                character: '$sessions.confidence_scores.token',
                score: '$sessions.confidence_scores.confidence_score',
                original_text: '$sessions.original_text',
                response_text: '$sessions.response_text'
              }
            },
            {
              $sort: {
                date: -1
              }
            }
          ],
          missingTokenScores: [
            {
              $unwind: '$sessions.missing_token_scores'
            },
            {
              $project: {
                _id: 0,
                date: '$sessions.createdAt',
                character: '$sessions.missing_token_scores.token',
                score: '$sessions.missing_token_scores.confidence_score',
                original_text: '$sessions.original_text',
                response_text: '$sessions.response_text'
              }
            },
            {
              $sort: {
                date: -1
              }
            }
          ]
        }
      },
      {
        $project: {
          combinedResults: {
            $concatArrays: ['$confidenceScores', '$missingTokenScores']
          }
        }
      },
      {
        $unwind: '$combinedResults'
      },
      {
        $replaceRoot: {
          newRoot: '$combinedResults'
        }
      },
      {
        $project: {
          date: '$date',
          token: '$character',
          score: '$score',
          original_text: '$original_text',
          response_text: '$response_text',
          isRetryExists: { $ifNull: ['$sessions.isRetry', false] }
        }
      },
      {
        $match: {
          $or: [
            { isRetryExists: false },
            { 'sessions.isRetry': false }
          ]
        }
      },
      {
        $sort: {
          date: -1
        }
      },
      {
        $group: {
          _id: {
            token: "$token"
          },
          scores: {
            $push: {
              score: '$score',
              original_text: '$original_text',
              response_text: '$response_text'
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          character: "$_id.token",
          latestScores: {
            $slice: ['$scores', -5]
          }
        }
      },
      {
        $addFields: {
          countBelowThreshold: {
            $size: {
              $filter: {
                input: '$latestScores',
                as: 'score',
                cond: {
                  $lt: ['$$score.score', threshold]
                }
              }
            }
          },
          countAboveThreshold: {
            $size: {
              $filter: {
                input: '$latestScores',
                as: 'score',
                cond: {
                  $gte: ['$$score.score', threshold]
                }
              }
            }
          },
          avg: {
            $avg: '$latestScores.score'
          }
        }
      },
      {
        $match: {
          $expr: {
            $gte: ['$countAboveThreshold', '$countBelowThreshold']
          }
        }
      }
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
              newValue =
                Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return (
      (longerLength - costs[s2.length]) /
      parseFloat(longerLength)
    );
  }

  async getSyllablesFromString(text: string, vowelSignArr: string[], language: string): Promise<string[]> {
    let prevEle = '';
    let isPrevVowel = false;
    let syllableArr = []

    // This code block used to create syllable list from text strings
    if (language === "ta") {
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
    }

    return syllableArr;
  }

  async getConstructedText(original_text: string, response_text: string) {
    let constructText = '';
    const compareCharArr = [];
    const constructTextSet = new Set();
    let reptitionCount = 0;

    for (const originalEle of original_text.split(
      ' ',
    )) {
      let originalRepCount = 0;
      for (const sourceEle of response_text.split(' ')) {
        const similarityScore = await this.getTextSimilarity(originalEle, sourceEle);
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
          compareCharArrEle.original_text ===
          compareCharArrCmpEle.original_text
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

    return { constructText, reptitionCount }
  }

  async getTextMetrics(original_text: string, response_text: string, language: string, base64_string) {
    const url = process.env.ALL_TEXT_EVAL_API + "/getTextMatrices";

    const textData = {
      reference: original_text,
      hypothesis: response_text,
      language: language,
      base64_string: base64_string.toString('base64'),
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
            throw 'Error from text Eval service' + error;
          }),
        ),
    );

    return textEvalMatrices;
  }

  async getCalculatedFluency(textEvalMetrics, repetitionCount, original_text, response_text, pause_count) {
    let fluencyCalPerc = lang_common_config.fluencyCalPerc;

    let wer = textEvalMetrics.wer;
    let cercal = textEvalMetrics.cer * 2;
    let charCount = Math.abs(original_text.length - response_text.length);
    let wordCount = Math.abs(original_text.split(' ').length - response_text.split(' ').length);
    let repetitions = repetitionCount;
    let pauseCount = pause_count;
    let ins = textEvalMetrics.insertion.length;
    let del = textEvalMetrics.deletion.length;
    let sub = textEvalMetrics.substitution.length;

    let fluencyScore = ((wer * fluencyCalPerc.wer) + (cercal * fluencyCalPerc.cercal) + (charCount * fluencyCalPerc.charCount) + (wordCount * 10) + (repetitions * fluencyCalPerc.repetitions) + (pauseCount * fluencyCalPerc.pauseCount) + (ins * fluencyCalPerc.ins) + (del * fluencyCalPerc.del) + (sub * fluencyCalPerc.sub)) / 100;

    return fluencyScore;
  }

  async getTokenHexcode(hexcodeTokenArr, token) {
    const result = hexcodeTokenArr.find(
      (item) => item.token === token,
    );
    return result?.hexcode || '';
  }

  async identifyTokens(bestTokens, correctTokens, missingTokens, tokenHexcodeDataArr, vowelSignArr) {
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
          const hexcode = await this.getTokenHexcode(tokenHexcodeDataArr, value.charkey);
          if (hexcode !== '') {
            confidence_scoresArr.push({
              token: value.charkey,
              hexcode: hexcode,
              confidence_score: value.charvalue,
              identification_status: identification_status,
            });
          } else {
            if (
              !missingTokens.includes(value.charkey)
            ) {
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
      const hexcode = await this.getTokenHexcode(tokenHexcodeDataArr, missingTokensEle);

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
        if (
          !correctTokens.includes(missingTokensEle)
        ) {
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
        const hexcode = await this.getTokenHexcode(tokenHexcodeDataArr, tokenString);
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

    return { confidence_scoresArr, missing_token_scoresArr, anomaly_scoreArr }
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
}
