import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class SessionSummary extends Document {
  @Prop({ required: true })
  user_id: string;

  @Prop({ required: true })
  session_id: string;

  @Prop({ required: true })
  sub_session_id: string;

  @Prop({ required: true })
  language: string;

  @Prop({ required: true })
  contentType: string;

  @Prop({ required: false, default: '' })
  contentId: string;

  @Prop({ required: true })
  original_text: string;

  @Prop({ required: false, default: '' })
  response_text: string;

  @Prop({ required: false, default: '' })
  construct_text: string;

  @Prop({ required: false })
  read_duration: number;

  @Prop({ required: false })
  practice_duration: number;

  @Prop({ required: false })
  retry_count: number;

  @Prop({ required: false })
  is_correct_choice: boolean;

  @Prop({ required: false })
  correctness_score: number;

  @Prop({ type: Object, required: false })
  comprehension: {
    marks: number;
    semantics: number;
    context: number;
    grammar: number;
    accuracy: number;
    overall: number;
  };

  @Prop({
    type: [
      {
        token: { type: String },
        hexcode: { type: String },
        confidence_score: { type: Number },
        identification_status: { type: Number },
      },
    ],
    default: [],
  })
  confidence_scores: {
    token: string;
    hexcode: string;
    confidence_score: number;
    identification_status: number;
  }[];

  @Prop({
    type: [
      {
        token: { type: String },
        hexcode: { type: String },
        confidence_score: { type: Number },
        identification_status: { type: Number },
      },
    ],
    default: [],
  })
  missing_token_scores: {
    token: string;
    hexcode: string;
    confidence_score: number;
    identification_status: number;
  }[];

  @Prop({
    type: [
      {
        token: { type: String },
        hexcode: { type: String },
        confidence_score: { type: Number },
        identification_status: { type: Number },
      },
    ],
    default: [],
  })
  anamolydata_scores: {
    token: string;
    hexcode: string;
    confidence_score: number;
    identification_status: number;
  }[];

  @Prop({ type: Object, required: false })
  error_rate: { word: number; character: number };

  @Prop({ type: Object, required: false })
  count_diff: { character: number; word: number };

  @Prop({ required: false })
  no_of_repetitions: number;

  @Prop({ type: Object, required: false })
  eucledian_distance: {
    insertions: { chars: string[]; count: number };
    deletions: { chars: string[]; count: number };
    substitutions: { chars: { removed: string; replaced: string }[]; count: number };
  };

  @Prop({ required: false })
  fluencyScore: number;

  @Prop({ type: Object, required: false })
  silence_Pause: { total_duration: number; count: number };

  @Prop({ required: false })
  mechanics_id: string;

  @Prop({ required: false, default: '' })
  asrOutput: string;

  @Prop({ required: false })
  mode: string;

  @Prop({ type: Object, required: false })
  ansSelectionStatus: Record<string, any>;

  @Prop({ required: false })
  feedback: string;
}

export type SessionSummaryDocument = SessionSummary & Document;
export const SessionSummarySchema = SchemaFactory.createForClass(SessionSummary);

SessionSummarySchema.index({ user_id: 1, sub_session_id: 1, language: 1 });
SessionSummarySchema.index({ user_id: 1, session_id: 1, language: 1 });
SessionSummarySchema.index({ user_id: 1, sub_session_id: 1 });
SessionSummarySchema.index({ session_id: 1 });
SessionSummarySchema.index({ user_id: 1 });
