import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class ProsodyFluency extends Document {
  @Prop({ required: true })
  user_id: string;

  @Prop({ required: true })
  session_id: string;

  @Prop({ required: true, index: true })
  sub_session_id: string;

  @Prop({ required: true })
  language: string;

  @Prop({ type: Object, required: false })
  pitch: {
    pitch_classification: string;
    pitch_mean: number;
    pitch_std: number;
  };

  @Prop({ type: Object, required: false })
  intensity: {
    intensity_classification: string;
    intensity_mean: number;
    intensity_std: number;
  };

  @Prop({ type: Object, required: false })
  tempo: {
    tempo_classification: string;
    words_per_minute: number;
    pause_count: number;
  };

  @Prop({ required: false, default: '' })
  expression_classification: string;

  @Prop({ type: Object, required: false })
  smoothness: {
    smoothness_classification: string;
    pause_count: number;
    avg_pause: number;
  };

  @Prop({ type: Object, required: false })
  rate: {
    rate_classification: string;
    words_per_minute: number;
  };

  @Prop({ type: Object, required: false })
  accuracy: {
    accuracy_classification: string;
    fluencyScore: number;
  };
}

export type ProsodyFluencyDocument = ProsodyFluency & Document;

export const ProsodyFluencySchema = SchemaFactory.createForClass(ProsodyFluency);

ProsodyFluencySchema.index({ user_id: 1, sub_session_id: 1, language: 1 });
