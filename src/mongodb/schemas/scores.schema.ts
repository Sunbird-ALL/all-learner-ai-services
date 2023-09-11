import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class Score {
    @Prop({ required: true, unique: true })
    user_id: string;

    @Prop({
        type: [
            {
                session_id: { type: String, required: true },
                date: { type: String, required: true },
                original_text: { type: String, required: true },
                response_text: { type: String, required: true },
                confidence_scores: [
                    {
                        token: { type: String, required: true },
                        hexcode: { type: String },
                        confidence_score: { type: Number, required: true },
                        identification_status: { type: Number },
                    },
                ],
                anamolydata_scores: [
                    {
                        token: { type: String, required: true },
                        hexcode: { type: String },
                        confidence_score: { type: Number, required: true },
                        identification_status: { type: Number },
                    },
                ],
            },
        ],
        required: true,
    })
    sessions: {
        session_id: string;
        date: Date;
        confidence_scores: {
            token: string;
            hexcode: string;
            confidence_score: number;
            identification_status: number
        }[];
        anamolydata_scores: {
            token: string;
            hexcode: string;
            confidence_score: number;
            identification_status: number
        }[];
    }[];
}

export type ScoreDocument = Score & Document;

export const ScoreSchema = SchemaFactory.createForClass(Score);
