import { Injectable } from '@nestjs/common';
import { CreateLearnerProfileDto } from './dto/CreateLearnerProfile.dto';
import { ScoreSchema, ScoreDocument } from './schemas/scores.schema';
import { hexcodeMappingSchema, hexcodeMappingDocument } from './schemas/hexcodeMapping.schema';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';

@Injectable()
export class ScoresService {
  constructor(@InjectModel('Score') private readonly scoreModel: Model<ScoreDocument>, @InjectModel('hexcodeMapping') private readonly hexcodeMappingModel: Model<hexcodeMappingDocument>) { }


  async create(createScoreDto: any): Promise<any> {
    try {
      const recordData = await this.scoreModel.find({ user_id: createScoreDto.user_id }).exec();
      if (recordData.length === 0) {
        const createdScore = new this.scoreModel(createScoreDto);
        const result = await createdScore.save();
        const updatedRecordData = this.scoreModel.updateOne(
          { 'user_id': createScoreDto.user_id },
          { $push: { "sessions": createScoreDto.session } },
        );
        return await updatedRecordData;
      } else {
        const updatedRecordData = this.scoreModel.updateOne(
          { 'user_id': createScoreDto.user_id },
          { $push: { "sessions": createScoreDto.session } },
        );
        return await updatedRecordData;
      }
    } catch (err) {
      return err;
    }
  }

  async audioFileToAsrOutput(data: any, language: String): Promise<any> {
    let asrOut: any;

    let serviceId = '';
    switch (language) {
      case "ta":
        serviceId = "ai4bharat/conformer-ta-gpu--t4";
        break;
      case "hi":
        serviceId = "ai4bharat/conformer-hi-gpu--t4";
        break;
      default:
        serviceId = "ai4bharat/conformer-ta-gpu--t4";
    }

    let options = JSON.stringify({
      "config": {
        "serviceId": `ai4bharat/conformer-${language}-gpu--t4`,
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
          "audioContent": data
        }
      ]
    });

    let config = {
      method: 'post',
      url: 'https://api.dhruva.ai4bharat.org/services/inference/asr',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': process.env.AI4BHARAT_API_KEY
      },
      data: options
    };

    await axios.request(config)
      .then((response) => {
        asrOut = response.data;
      })
      .catch((error) => {
        console.log(error);
      });

    return asrOut;
  }

  async findAll(): Promise<any> {
    const recordData = await this.scoreModel.find().exec();
    return recordData;
  }

  findOne(id: number) {
    return `This action returns a #${id} score`;
  }

  async findbySession(id: string) {
    const UserRecordData = await this.scoreModel.find({
      sessions:
      {
        $elemMatch:
        {
          session_id: id
        }
      }
    }).exec();
    return UserRecordData;
  }

  async getTargetsBySession(sessionId: string) {
    const threshold = 0.90
    const RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          'sessions.session_id': sessionId
        }
      },
      {
        $unwind: '$sessions'
      },
      {
        $match: {
          'sessions.session_id': sessionId
        }
      },
      {
        $unwind: '$sessions.confidence_scores'
      },
      {
        $match: {
          'sessions.confidence_scores.confidence_score': { $lt: threshold }
        }
      },
      {
        $match: {
          'sessions.session_id': sessionId
        }
      },
      {
        $project: {
          _id: 0,
          character: '$sessions.confidence_scores.token',
          score: '$sessions.confidence_scores.confidence_score'
        }
      }
    ]);
    let charScoreData = [];

    let uniqueChar = new Set();

    for (let RecordDataele of RecordData) { uniqueChar.add(RecordDataele.character) };


    for (let char of uniqueChar) {
      let score = 0;
      for (let checkRecordDataele of RecordData) {
        if (char === checkRecordDataele.character && checkRecordDataele.score >= score) {
          score = checkRecordDataele.score;
        }
      }
      charScoreData.push({ character: char, score: score });
    }

    return charScoreData.sort((a, b) => a.score - b.score);
  }

  async getTargetsByUser(userId: string) {
    const threshold = 0.90
    const RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          'user_id': userId
        }
      },
      {
        $unwind: '$sessions'
      },
      {
        $unwind: '$sessions.confidence_scores'
      },
      {
        $match: {
          'sessions.confidence_scores.confidence_score': { $lt: 0.90 }
        }
      },
      {
        $project: {
          _id: 0,
          user_id: 1,
          date: '$sessions.date',
          session_id: '$sessions.session_id',
          character: '$sessions.confidence_scores.token',
          score: '$sessions.confidence_scores.confidence_score'
        }
      }
    ]);

    let charScoreData = [];

    let uniqueChar = new Set();

    for (let RecordDataele of RecordData) { uniqueChar.add(RecordDataele.character) };


    for (let char of uniqueChar) {
      let score = 0;
      for (let checkRecordDataele of RecordData) {
        if (char === checkRecordDataele.character && checkRecordDataele.score >= score) {
          score = checkRecordDataele.score;
        }
      }
      charScoreData.push({ character: char, score: score });
    }

    return charScoreData.sort((a, b) => a.score - b.score);
  }

  async getConfidentSetBySession(sessionId: string) {
    const threshold = 0.90
    const RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          'sessions.session_id': sessionId
        }
      },
      {
        $unwind: '$sessions'
      },
      {
        $match: {
          'sessions.session_id': sessionId
        }
      },
      {
        $unwind: '$sessions.confidence_scores'
      },
      {
        $match: {
          'sessions.confidence_scores.confidence_score': { $gte: threshold }
        }
      },
      {
        $match: {
          'sessions.session_id': sessionId
        }
      },
      {
        $project: {
          _id: 0,
          character: '$sessions.confidence_scores.token',
          score: '$sessions.confidence_scores.confidence_score'
        }
      }
    ]);
    let charScoreData = [];

    let uniqueChar = new Set();

    for (let RecordDataele of RecordData) { uniqueChar.add(RecordDataele.character) };


    for (let char of uniqueChar) {
      let score = 0;
      for (let checkRecordDataele of RecordData) {
        if (char === checkRecordDataele.character && checkRecordDataele.score >= score) {
          score = checkRecordDataele.score;
        }
      }
      charScoreData.push({ character: char, score: score });
    }

    return charScoreData.sort((a, b) => a.score - b.score);
  }

  async getConfidentSetByUser(userId: string) {
    const threshold = 0.90
    const RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          'user_id': userId
        }
      },
      {
        $unwind: '$sessions'
      },
      {
        $unwind: '$sessions.confidence_scores'
      },
      {
        $match: {
          'sessions.confidence_scores.confidence_score': { $gte: threshold }
        }
      },
      {
        $project: {
          _id: 0,
          user_id: 1,
          date: '$sessions.date',
          character: '$sessions.confidence_scores.token',
          score: '$sessions.confidence_scores.confidence_score'
        }
      }
    ]);
    let charScoreData = [];

    let uniqueChar = new Set();

    for (let RecordDataele of RecordData) { uniqueChar.add(RecordDataele.character) };


    for (let char of uniqueChar) {
      let score = 0;
      for (let checkRecordDataele of RecordData) {
        if (char === checkRecordDataele.character && checkRecordDataele.score >= score) {
          score = checkRecordDataele.score;
        }
      }
      charScoreData.push({ character: char, score: score });
    }

    return charScoreData.sort((a, b) => a.score - b.score);
  }

  async findbyUser(id: string) {
    const UserRecordData = await this.scoreModel.find({ user_id: id }).exec();
    return UserRecordData;
  }

  async gethexcodeMapping(language: String) {
    const recordData = await this.hexcodeMappingModel.find({ language: language }).exec();
    return recordData;
  }

  async getMeanLearnerBySession(sessionId: string) {
    const RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          'sessions.session_id': sessionId
        }
      },
      {
        $unwind: '$sessions'
      },
      {
        $unwind: '$sessions.confidence_scores'
      },
      {
        $match: {
          'sessions.session_id': sessionId
        }
      },
      {
        $project: {
          _id: 0,
          user_id: 1,
          session_id: '$sessions.session_id',
          token: '$sessions.confidence_scores.token',
          score: '$sessions.confidence_scores.confidence_score',
          hexcode: '$sessions.confidence_scores.hexcode',
        }
      },
      {
        $group: {
          _id: {
            user_id: '$user_id',
            token: '$token'
          },
          mean: { $avg: '$score' }
        }
      },
      {
        $project: {
          _id: 0,
          token: '$_id.token',
          mean: 1
        }
      }
    ]
    );
    return RecordData;
  }

  async getMeanLearnerByUser(userId: string) {
    const RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          'user_id': userId
        }
      },
      {
        $unwind: '$sessions'
      },
      {
        $unwind: '$sessions.confidence_scores'
      },
      {
        $project: {
          _id: 0,
          user_id: 1,
          session_id: '$sessions.session_id',
          token: '$sessions.confidence_scores.token',
          score: '$sessions.confidence_scores.confidence_score',
          hexcode: '$sessions.confidence_scores.hexcode',
        }
      },
      {
        $group: {
          _id: {
            user_id: '$user_id',
            token: '$token'
          },
          mean: { $avg: '$score' }
        }
      },
      {
        $project: {
          _id: 0,
          token: '$_id.token',
          mean: 1
        }
      }
    ]
    );
    return RecordData;
  }

  async getFamiliarityLearnerByUser(userId: string) {
    const RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          'user_id': userId
        }
      },
      {
        $unwind: '$sessions'
      },
      {
        $unwind: '$sessions.confidence_scores'
      },
      {
        $project: {
          _id: 0,
          user_id: 1,
          token: '$sessions.confidence_scores.token',
          score: '$sessions.confidence_scores.confidence_score'
        }
      },
      {
        $group: {
          _id: {
            user_id: '$user_id',
            token: '$token'
          },
          scores: { $push: '$score' }
        }
      },
      {
        $project: {
          _id: 0,
          user_id: '$_id.user_id',
          token: '$_id.token',
          count: { $size: '$scores' },
          score:
          {
            $sortArray:
            {
              input: '$scores',
              sortBy: 1
            }
          }
        }
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
                  then: { $arrayElemAt: ['$score', { $floor: { $divide: ['$count', 2] } }] },
                  else: {
                    $avg: [
                      { $arrayElemAt: ['$score', { $subtract: [{ $round: { $divide: ['$count', 2] } }, 1] }] },
                      { $arrayElemAt: ['$score', { $divide: ['$count', 2] }] }
                    ]
                  }
                }
              }
            }
          }
        }
      }
    ]
    );
    return RecordData;
  }

  async getFamiliarityLearnerBySession(sessionId: string) {
    const RecordData = await this.scoreModel.aggregate([
      {
        $match: {
          'sessions.session_id': sessionId
        }
      },
      {
        $unwind: '$sessions'
      },
      {
        $unwind: '$sessions.confidence_scores'
      },
      {
        $match: {
          'sessions.session_id': sessionId
        }
      },
      {
        $project: {
          _id: 0,
          user_id: 1,
          token: '$sessions.confidence_scores.token',
          score: '$sessions.confidence_scores.confidence_score'
        }
      },
      {
        $group: {
          _id: {
            user_id: '$user_id',
            token: '$token'
          },
          scores: { $push: '$score' }
        }
      },
      {
        $project: {
          _id: 0,
          user_id: '$_id.user_id',
          token: '$_id.token',
          count: { $size: '$scores' },
          score:
          {
            $sortArray:
            {
              input: '$scores',
              sortBy: 1
            }
          }
        }
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
                  then: { $arrayElemAt: ['$score', { $floor: { $divide: ['$count', 2] } }] },
                  else: {
                    $avg: [
                      { $arrayElemAt: ['$score', { $subtract: [{ $round: { $divide: ['$count', 2] } }, 1] }] },
                      { $arrayElemAt: ['$score', { $divide: ['$count', 2] }] }
                    ]
                  }
                }
              }
            }
          }
        }
      }
    ]
    );
    return RecordData;
  }
}
