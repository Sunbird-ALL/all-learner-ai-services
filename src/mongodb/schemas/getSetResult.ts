import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class getSetResult extends Document {
    @Prop({ required: true })
    userId: string;

    @Prop({ required: true })
    sessionId: string;

    @Prop({ required: true })
    subSessionId: string;

    @Prop({ required: true })
    totalTargets: number;

    @Prop()
    currentLevel: string;

    @Prop()
    previousLevel: string;

    @Prop()
    totalSyllables: number;

    @Prop()
    fluency: number;

    @Prop()
    fluencyResult: string;

    @Prop()
    prosodyResult: string;

    @Prop()
    targetsPercentage: number;

    @Prop()
    totalCorrectnessScore: number;

    @Prop()
    comprehensionScore: number;

    @Prop({ default: Date.now })
    createdAt: Date;
}

export type getSetResultDocument = getSetResult & Document;

export const getSetResultSchema =
    SchemaFactory.createForClass(getSetResult);
