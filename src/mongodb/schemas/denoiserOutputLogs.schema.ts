import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class denoiserOutputLogs extends Document {
    @Prop({ required: true })
    user_id: string;

    @Prop({ required: true })
    session_id: string;

    @Prop({ required: true })
    sub_session_id: string;

    @Prop({ required: true })
    contentId: string;

    @Prop({ required: true })
    contentType: string;

    @Prop({ required: true })
    language: string;

    @Prop({ required: true })
    original_text: string;

    @Prop({ required: true })
    response_text: string;

    @Prop({ required: true })
    denoised_response_text: string;

    @Prop({ required: false })
    improved: boolean;

    @Prop({ required: false })
    comment: string;
}

export type denoiserOutputLogsDocument = denoiserOutputLogs & Document;

export const denoiserOutputLogsSchema = SchemaFactory.createForClass(denoiserOutputLogs);