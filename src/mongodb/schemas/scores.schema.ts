import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Mixed } from 'mongoose';

@Schema({ timestamps: true })
export class Score {
    @Prop({ required: true, unique: true })
    user_id: string;

    @Prop({
        type: [
            {
                session_id: { type: String, required: true },
                sub_session_id: { type: String, required: false },
                contentType: { type: String, required: true },
                contentId: { type: String, required: false },
                createdAt: { type: Date, required: true },
                original_text: { type: String, required: true },
                response_text: { type: String, required: true },
                construct_text: { type: String, required: true },
                language: { type: String, required: true },
                confidence_scores: [
                    {
                        token: { type: String, required: true },
                        hexcode: { type: String },
                        confidence_score: { type: Number, required: true },
                        identification_status: { type: Number },
                    },
                ],
                missing_token_scores: [
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
                error_rate: {
                    word: { type: Number },
                    character: { type: Number }
                },
                count_diff: {
                    character: { type: Number },
                    word: { type: Number }
                },
                no_of_repetitions: { type: Number },
                eucledian_distance: {
                    insertions: {
                        chars: [{ type: String }],
                        count: { type: Number }
                    },
                    deletions: {
                        chars: [{ type: String }],
                        count: { type: Number }
                    },
                    substitutions: {
                        chars: [{
                            removed: { type: String },
                            replaced: { type: String }
                        }],
                        count: { type: Number }
                    }
                },
                fluencyScore: { type: Number },
                silence_Pause: {
                    total_duration: { type: Number },
                    count: { type: Number },
                },
                reptitionsCount: { type: Number },
                asrOutput: { type: String, required: true },
            },
        ],
        required: true,
    })
    sessions: {
        session_id: string;
        original_text: string;
        sub_session_id: string;
        contentType: string;
        contentId: string;
        response_text: string;
        construct_text: string;
        confidence_scores: {
            token: string;
            hexcode: string;
            confidence_score: number;
            identification_status: number
        }[];
        missing_token_scores: {
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
        error_rate: {
            word: number;
            character: number;
        };
        count_diff: {
            character: number,
            word: number
        },
        no_of_repetitions: number;
        eucledian_distance: {
            insertions: {
                chars: [string],
                count: number
            },
            deletions: {
                chars: [string],
                count: number
            },
            substitutions: {
                chars: [Mixed],
                count: number
            }
        };
        fluencyScore: number;
        silence_Pause: {
            total_duration: number;
            count: number;
        };
        reptitionsCount: number;
        asrOutput: string;
        createdAt: Date;
    }[];

    @Prop({
        type: [
            {
                session_id: { type: String, required: true },
                sub_session_id: { type: String, required: false },
                milestone_level: { type: String, required: true },
                sub_milestone_level: { type: String, required: false },
                createdAt: { type: Date, required: true },
            },
        ],
        required: false,
    })
    milestone_progress: {
        session_id: string;
        sub_session_id: string;
        milestone_level: string;
        sub_milestone_level: string;
        createdAt: Date;
    }[];
}

export type ScoreDocument = Score & Document;

export const ScoreSchema = SchemaFactory.createForClass(Score);
