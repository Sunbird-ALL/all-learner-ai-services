import { Injectable } from '@nestjs/common';
import { CreateLearnerProfileDto } from './dto/CreateLearnerProfile.dto';
import { ScoreSchema, ScoreDocument } from './schemas/scores.schema';
import { hexcodeMappingSchema, hexcodeMappingDocument } from './schemas/hexcodeMapping.schema';
import { assessmentInputSchema, assessmentInputDocument } from './schemas/assessmentInput.schema';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';

@Injectable()
export class ScoresService {
  constructor(
    @InjectModel('Score') private readonly scoreModel: Model<ScoreDocument>,
    @InjectModel('hexcodeMapping') private readonly hexcodeMappingModel: Model<hexcodeMappingDocument>,
    @InjectModel('assessmentInput') private readonly assessmentInputModel: Model<assessmentInputDocument>
  ) { }


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
      case "kn":
        serviceId = "ai4bharat/conformer-multilingual-dravidian-gpu--t4";
        break;
      default:
        serviceId = `ai4bharat/conformer-${language}-gpu--t4`;
    }

    let options = JSON.stringify({
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

  async getTargetsBySession(sessionId: string, language: string = null) {
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
          'sessions.session_id': sessionId
        }
      },
      {
        $project: {
          _id: 0,
          user_id: 1,
          date: '$sessions.date',
          session_id: '$sessions.session_id',
          language: '$sessions.language',
          character: '$sessions.confidence_scores.token',
          score: '$sessions.confidence_scores.confidence_score'
        }
      }
    ]);

    const MissingRecordData = await this.scoreModel.aggregate([
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
        $unwind: '$sessions.missing_token_scores'
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
          date: '$sessions.date',
          session_id: '$sessions.session_id',
          language: '$sessions.language',
          character: '$sessions.missing_token_scores.token',
          score: '$sessions.missing_token_scores.confidence_score'
        }
      }
    ]);

    let charScoreData = [];

    let uniqueChar = new Set();

    console.log(RecordData);

    for (let RecordDataele of RecordData) {
      if (language != null && RecordDataele.language === language) {
        uniqueChar.add(RecordDataele.character)
      } else if (language === null) {
        uniqueChar.add(RecordDataele.character)
      }
    };

    console.log(uniqueChar);

    for (let char of uniqueChar) {
      let score = 0;
      let count = 0;
      for (let checkRecordDataele of RecordData) {
        if (char === checkRecordDataele.character && checkRecordDataele.score >= score) {
          score += checkRecordDataele.score;
          count++;
        }
      }
      let avgScore = score / count;
      if (avgScore < 0.90) {
        charScoreData.push({ character: char, score: avgScore });
      }
    }

    for (let MissingRecordDataele of MissingRecordData) {
      if (language != null && MissingRecordDataele.language === language) {
        uniqueChar.add(MissingRecordDataele.character)
      } else if (language === null) {
        uniqueChar.add(MissingRecordDataele.character)
      }
    };

    console.log(MissingRecordData);

    for (let MissingRecordDataEle of MissingRecordData) {
      if (!uniqueChar.has(MissingRecordDataEle.character) && language != null && MissingRecordDataEle.language === language) {
        charScoreData.push({ character: MissingRecordDataEle.character, score: MissingRecordDataEle.score });
      } else if (!uniqueChar.has(MissingRecordDataEle.character)) {
        charScoreData.push({ character: MissingRecordDataEle.character, score: MissingRecordDataEle.score });
      }
    }

    return charScoreData.sort((a, b) => a.score - b.score);
  }

  async getTargetsByUser(userId: string, language: string = null) {
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
        $project: {
          _id: 0,
          user_id: 1,
          date: '$sessions.date',
          session_id: '$sessions.session_id',
          language: '$sessions.language',
          character: '$sessions.confidence_scores.token',
          score: '$sessions.confidence_scores.confidence_score'
        }
      }
    ]);

    const MissingRecordData = await this.scoreModel.aggregate([
      {
        $match: {
          'user_id': userId
        }
      },
      {
        $unwind: '$sessions'
      },
      {
        $unwind: '$sessions.missing_token_scores'
      },
      {
        $project: {
          _id: 0,
          user_id: 1,
          date: '$sessions.date',
          session_id: '$sessions.session_id',
          language: '$sessions.language',
          character: '$sessions.missing_token_scores.token',
          score: '$sessions.missing_token_scores.confidence_score'
        }
      }
    ]);

    let charScoreData = [];

    let uniqueChar = new Set();


    for (let RecordDataele of RecordData) {
      if (language != null && RecordDataele.language === language) {
        uniqueChar.add(RecordDataele.character)
      } else if (language === null) {
        uniqueChar.add(RecordDataele.character)
      }
    };

    for (let MissingRecordDataele of MissingRecordData) {
      if (language != null && MissingRecordDataele.language === language) {
        uniqueChar.add(MissingRecordDataele.character)
      } else if (language === null) {
        uniqueChar.add(MissingRecordDataele.character)
      }
    };

    for (let char of uniqueChar) {
      let score = 0;
      let count = 0;
      for (let checkRecordDataele of RecordData) {
        if (char === checkRecordDataele.character && checkRecordDataele.score >= score) {
          score += checkRecordDataele.score;
          count++;
        }
      }
      let avgScore = score / count;
      if (avgScore < 0.90) {
        charScoreData.push({ character: char, score: avgScore });
      }
    }

    for (let MissingRecordDataEle of MissingRecordData) {
      if (!uniqueChar.has(MissingRecordDataEle.character) && language != null && MissingRecordDataEle.language === language) {
        charScoreData.push({ character: MissingRecordDataEle.character, score: MissingRecordDataEle.score });
      } else if (!uniqueChar.has(MissingRecordDataEle.character)) {
        charScoreData.push({ character: MissingRecordDataEle.character, score: MissingRecordDataEle.score });
      }
    }

    return charScoreData.sort((a, b) => a.score - b.score);
  }

  async getFamiliarityBySession(sessionId: string) {
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
      // {
      //   $match: {
      //     'sessions.confidence_scores.confidence_score': { $gte: threshold }
      //   }
      // },
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
      let count = 0;
      for (let checkRecordDataele of RecordData) {
        if (char === checkRecordDataele.character && checkRecordDataele.score >= score) {
          score += checkRecordDataele.score;
          count++;
        }
      }

      let avgScore = score / count;
      if (avgScore >= 0.90) {
        charScoreData.push({ character: char, score: score });
      }
    }

    return charScoreData.sort((a, b) => a.score - b.score);
  }

  async getFamiliarityByUser(userId: string) {
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
      let count = 0;

      for (let checkRecordDataele of RecordData) {
        if (char === checkRecordDataele.character && checkRecordDataele.score >= score) {
          score += checkRecordDataele.score;
          count++;
        }
      }

      let avgScore = score / count;
      if (avgScore >= 0.90) {
        charScoreData.push({ character: char, score: score });
      }
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

  async getConfidentVectorByUser(userId: string) {
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

  async getConfidentVectorBySession(sessionId: string) {
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

  async getMissingChars(language: string) {
    const RecordData = await this.hexcodeMappingModel.find({
      'language': language
    }, { 'token': 1, '_id': 0 }).exec();
    console.log(RecordData);
    let tokenArray = RecordData.map((data) => {
      return data.token;
    })
    return tokenArray;
  }

  async assessmentInputCreate(assessmentInputData: any): Promise<any> {
    try {

      const assessmentInput = this.assessmentInputModel.updateMany(
        { user_id: assessmentInputData.user_id, session_id: assessmentInputData.session_id, token: assessmentInputData.token },
        { $set: { feedback: assessmentInputData.feedback } },
        { new: true, upsert: true }
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
            session_id: sessionId
          }
        },
        {
          $group: {
            _id: {
              session_id: sessionId,
              token: "$token"
            },
            feedback: { $max: "$feedback" }
          }
        },
        {
          $match: {
            feedback: 0
          }
        },
        {
          $project: {
            _id: 0,
            session_id: "$_id.session_id",
            token: "$_id.token",
            feedback: 1
          }
        }
      ]);

      return AssessmentRecords;
    } catch (err) {
      return err;
    }
  }

  async getAllSessions(userId: string, limit: number) {
    const RecordData = await this.scoreModel.aggregate([
      {
        "$match": {
          "user_id": userId
        }
      },
      {
        "$unwind": '$sessions'
      },
      {
        "$project": {
          "_id": 0,
          "user_id": 1,
          "date": '$sessions.createdAt',
          "session_id": '$sessions.session_id'
        }
      },
      {
        "$group": {
          "_id": "$session_id",
          "user_id": { "$first": "$user_id" },
          "date": { "$first": "$date" }
        }
      },
      {
        "$sort": {
          "_id": -1
        }
      },
      {
        "$project": {
          "_id": 0,
          "session_id": "$_id",
        }
      }
    ]).limit(Number(limit));

    const sessionIds = RecordData.map(item => item.session_id)
    return sessionIds;
  }
}
