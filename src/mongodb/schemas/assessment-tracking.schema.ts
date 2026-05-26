import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum EvaluationType {
  AI = 'AI',
  ONLINE = 'Online',
  MANUAL = 'Manual',
}

@Schema({ timestamps: true })
export class AssessmentTracking {
  @Prop({ type: String, required: true, unique: true })
  assessmentTrackingId: string;

  @Prop({ type: String, required: true, index: true })
  userId: string;

  @Prop({ type: String, required: true, index: true })
  courseId: string;

  @Prop({ type: String, required: true, index: true })
  session_id: string;

  @Prop({ type: String, required: true, index: true })
  sub_session_id: string;

  @Prop({ type: String, required: true })
  sub_milestone_level: string;

  @Prop({ type: String, required: true })
  apply_level: string;

  @Prop({ type: Number, required: true })
  sub_apply_level: number;

  @Prop({ type: String, required: true, index: true })
  contentId: string;

  @Prop({ type: String, required: true })
  attemptId: string;

  @Prop({ type: Date, default: Date.now })
  createdOn: Date;

  @Prop({ type: Date, required: false })
  lastAttemptedOn: Date;

  @Prop({ type: Object, required: true })
  assessmentSummary: Record<string, any>;

  @Prop({ type: Number, required: true })
  totalMaxScore: number;

  @Prop({ type: Number, required: true })
  totalScore: number;

  @Prop({ type: Date, default: Date.now })
  updatedOn: Date;

  @Prop({ type: Number, required: true })
  timeSpent: number;

  @Prop({ type: String, required: true, index: true })
  unitId: string;

  @Prop({ type: String, required: false, index: true })
  tenantId: string;

  @Prop({ type: Boolean, default: true })
  showFlag: boolean;

  @Prop({ 
    type: String, 
    enum: EvaluationType, 
    required: false 
  })
  evaluatedBy?: EvaluationType;

  @Prop({ type: String, required: false })
  submitedBy?: string;
}

@Schema({ timestamps: true })
export class AssessmentTrackingScoreDetail {
  @Prop({ type: String, required: true, index: true })
  userId: string;

  @Prop({ type: String, required: true, index: true })
  session_id: string;

  @Prop({ type: String, required: true, index: true })
  sub_session_id: string;

  @Prop({ type: String, required: true, index: true })
  language: string;

  @Prop({ type: String, required: true })
  sub_milestone_level: string;

  @Prop({ type: String, required: true })
  apply_level: string;

  @Prop({ type: Number, required: true })
  sub_apply_level: number;

  @Prop({ type: String, required: true, index: true })
  assessmentTrackingId: string;

  @Prop({ type: String, required: true })
  questionId: string;

  @Prop({ type: String, required: true })
  pass: string;

  @Prop({ type: String, required: true })
  sectionId: string;

  @Prop({ type: String, required: false })
  resValue: string;

  @Prop({ type: Number, required: false })
  duration: number;

  @Prop({ type: String, required: false })
  score: string;

  @Prop({ type: Number, required: false })
  maxScore: number;

  @Prop({ type: String, required: false })
  queTitle: string;

  @Prop({ type: String, required: false })
  feedback: string;
}

export type AssessmentTrackingDocument = AssessmentTracking & Document;
export type AssessmentTrackingScoreDetailDocument = AssessmentTrackingScoreDetail & Document;

export const AssessmentTrackingSchema = SchemaFactory.createForClass(AssessmentTracking);
export const AssessmentTrackingScoreDetailSchema = SchemaFactory.createForClass(AssessmentTrackingScoreDetail);
