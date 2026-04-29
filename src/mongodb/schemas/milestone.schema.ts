import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Milestone extends Document {
  @Prop({ required: true })
  user_id: string;

  @Prop({ required: true })
  session_id: string;

  @Prop({ required: false, default: '' })
  sub_session_id: string;

  @Prop({ required: true, index: true })
  milestone_level: string;

  @Prop({ required: false, default: '' })
  sub_milestone_level: string;

  @Prop({ required: true, index: true })
  language: string;
}

export type MilestoneDocument = Milestone & Document;

export const MilestoneSchema = SchemaFactory.createForClass(Milestone);

MilestoneSchema.index({ user_id: 1, language: 1, createdAt: -1 });
