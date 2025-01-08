import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Mixed } from 'mongoose';

@Schema({ timestamps: true })
export class Score {
  @Prop({ required: true, unique: true, index: true })
  user_id: string; // userid sent by client

  @Prop({
    type: [
      {
        session_id: { type: String, required: true, index: true },
        sub_session_id: { type: String, required: false, index: true },
        contentType: { type: String, required: true },
        contentId: { type: String, required: false, index: true },
        createdAt: { type: Date, required: true },
        original_text: { type: String, required: true },
        response_text: { type: String, required: true },
        construct_text: { type: String, required: true },
        language: { type: String, required: true, index: true },
        is_correct_choice:{ type: Boolean, required: false},
        correctness_score: {type: Number, required: false},
        confidence_scores: [
          {
            token: { type: String, required: true, index: true },
            hexcode: { type: String },
            confidence_score: { type: Number, required: true, index: true },
            identification_status: { type: Number },
          },
        ],
        missing_token_scores: [
          {
            token: { type: String, required: true, index: true },
            hexcode: { type: String },
            confidence_score: { type: Number, required: true, index: true },
            identification_status: { type: Number },
          },
        ],
        anamolydata_scores: [
          {
            token: { type: String, required: true, index: true },
            hexcode: { type: String },
            confidence_score: { type: Number, required: true, index: true },
            identification_status: { type: Number },
          },
        ],
        error_rate: {
          word: { type: Number },
          character: { type: Number },
        },
        count_diff: {
          character: { type: Number },
          word: { type: Number },
        },
        no_of_repetitions: { type: Number },
        eucledian_distance: {
          insertions: {
            chars: [{ type: String }],
            count: { type: Number },
          },
          deletions: {
            chars: [{ type: String }],
            count: { type: Number },
          },
          substitutions: {
            chars: [
              {
                removed: { type: String },
                replaced: { type: String },
              },
            ],
            count: { type: Number },
          },
        },
        fluencyScore: { type: Number, index: true },
        silence_Pause: {
          total_duration: { type: Number },
          count: { type: Number },
        },
        reptitionsCount: { type: Number },
        mechanics_id: { type: String, required: false },
        asrOutput: { type: String, required: true },
        isRetry: { type: Boolean, required: false },
      },
    ],
    required: true,
  })
  sessions: {
    _id: any;
    session_id: string; // working logged in session id
    original_text: string; // content text shown to speak
    sub_session_id: string; // used to club set recorded data within session
    contentType: string; // contentType could be Char, Word, Sentence and Paragraph
    contentId: string; // contentId of original text content shown to user to speak
    response_text: string; // text return by ai after converting audio to text
    construct_text: string; // this will be constructed by matching response text with original text.
    language: string; // content language
    is_correct_choice:boolean;
    correctness_score:number;
    confidence_scores: {
      token: string;
      hexcode: string;
      confidence_score: number;
      identification_status: number;
    }[]; // confidence score array will include char's has identified by ai and has score
    missing_token_scores: {
      token: string;
      hexcode: string;
      confidence_score: number;
      identification_status: number;
    }[]; // this char's missed to spoke or recognise by ai
    anamolydata_scores: {
      token: string;
      hexcode: string;
      confidence_score: number;
      identification_status: number;
    }[]; // this char's recognise as noise in audio
    error_rate: {
      word: number;
      character: number;
    };
    count_diff: {
      character: number;
      word: number;
    };
    no_of_repetitions: number;
    eucledian_distance: {
      insertions: {
        chars: [string];
        count: number;
      };
      deletions: {
        chars: [string];
        count: number;
      };
      substitutions: {
        chars: [Mixed];
        count: number;
      };
    };
    fluencyScore: number;
    silence_Pause: {
      total_duration: number;
      count: number;
    };
    reptitionsCount: number;
    mechanics_id: string;
    asrOutput: string;
    createdAt: Date;
    isRetry: boolean;
  }[];

  @Prop({
    type: [
      {
        session_id: { type: String, required: true, index: true },
        sub_session_id: { type: String, required: false, index: true },
        milestone_level: { type: String, required: true, index: true },
        sub_milestone_level: { type: String, required: false },
        createdAt: { type: Date, required: true, index: true },
      },
    ],
    required: false,
  })
  milestone_progress: {
    session_id: string;
    sub_session_id: string;
    milestone_level: string;
    sub_milestone_level: string;
    createdAt: Date;
  }[]; // This array includes milestone progress and we take latest entry in array as current milestone for user
}

export type ScoreDocument = Score & Document;

export const ScoreSchema = SchemaFactory.createForClass(Score);
