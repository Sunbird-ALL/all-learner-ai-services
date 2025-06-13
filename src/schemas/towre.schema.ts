import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TowreDocument = Towre & Document;

@Schema({ timestamps: true })
export class Towre {
  @Prop({ required: true })
  user_id: string;

  @Prop({ required: true })
  audio_file_path: string;

  @Prop({ required: true })
  session_id: string;

  @Prop({ required: false })
  milestone_level?: string;

  @Prop({ required: true, type: Object }) 
  towre_result: Record<string, any>;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const TowreSchema = SchemaFactory.createForClass(Towre);
