import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class llmOutputLogs extends Document {
  @Prop({ required: true })
  user_id: string;

  @Prop({ required: true })
  session_id: string;

  @Prop({ required: true })
  sub_session_id: string;

  @Prop({ required: true })
  teacherText: string;

  @Prop({ required: false })
  questionText: string[];

  @Prop({ required: true })
  studentText: string;

  @Prop({ type: [String], required: true })
  ansKey: string[];

  @Prop({ required: true })
  marks: number;

  @Prop({ required: true })
  semantics: number;

  @Prop({ required: true })
  grammar: number;

  @Prop({ required: true })
  accuracy: number;

  @Prop({ required: true })
  overall: number;

  createdAt:{ type: Date, required: true}
}

export type llmOutputLogsDocument = llmOutputLogs & Document;

export const llmOutputLogsSchema =
  SchemaFactory.createForClass(llmOutputLogs);
