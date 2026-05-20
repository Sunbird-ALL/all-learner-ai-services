import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class correct_practice_word extends Document {
  @Prop({ required: true })
  original_text: string;

  @Prop({ required: true })
  user_id: string;

  @Prop({ required: true })
  content_id: string;

  @Prop({ required: true })
  milestone_level: string;

  @Prop({ required: true })
  practice_level: string;

  @Prop({ required: true })
  session_id: string;

  @Prop({ required: false, default: false})
  practiced?: boolean; 

  @Prop({ required: false, default: false})
  learned?: boolean; 

  @Prop({ required: false, default: false})
  understood?: boolean; 

  @Prop({ default: Date.now })
  createdAt: Date;
}

export type correct_practice_wordDocument = correct_practice_word & Document;

export const correct_practice_wordSchema =
  SchemaFactory.createForClass(correct_practice_word);
