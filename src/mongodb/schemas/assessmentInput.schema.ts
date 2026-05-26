import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class assessmentInput extends Document {
  @Prop({ required: true })
  user_id: string;

  @Prop({ required: true })
  session_id: string;

  @Prop({ required: true })
  token: string;

  @Prop({ required: true })
  feedback: number;
}

export type assessmentInputDocument = assessmentInput & Document;

export const assessmentInputSchema =
  SchemaFactory.createForClass(assessmentInput);

// Compound index covers
assessmentInputSchema.index({ user_id: 1, session_id: 1, token: 1 });
