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

export const assessmentInputSchema = SchemaFactory.createForClass(assessmentInput);