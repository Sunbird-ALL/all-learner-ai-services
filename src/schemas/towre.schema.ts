import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TowreDocument = Towre & Document;

@Schema({ timestamps: true })
export class Towre {
  [x: string]: any;
  @Prop({ required: true })
  user_id: string;

  @Prop({ required: true, type: [Object] })
  towre_result: ResultItem[];

  @Prop({ required: true })
  audio_file_path: string;

  @Prop({ required: true })
  session_id: string;

  @Prop({ required: false })
  milestone_level?: string;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ required: true })
  language: string;

  @Prop({ default: Date.now })
  createdAt: Date;
}

class ResultItem {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  isCorrect: boolean;
}

export const TowreSchema = SchemaFactory.createForClass(Towre);
