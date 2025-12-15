import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ _id: false })
export class Attempt {
    @Prop({ required: true })
    session: string;

    @Prop({ required: true })
    subSession: string;

    @Prop({ required: true })
    score: number;

    @Prop({ default: Date.now })
    updatedAt: Date;
}

export const AttemptSchema = SchemaFactory.createForClass(Attempt);

@Schema()
export class Vocabulary extends Document {
    @Prop({ required: true })
    user_id: string;

    @Prop({ required: true })
    contentId: string;

    @Prop({ required: true })
    language: string;

    @Prop({ default: 0 })
    presentCount: number;

    @Prop({ default: 0 })
    spokenCorrectly: number;

    @Prop({ type: [AttemptSchema], default: [] })
    attempts: Attempt[];

    @Prop({ default: Date.now })
    createdAt: Date;

    @Prop({ default: Date.now })
    updatedAt: Date;
}

export type VocabularyDocument = Vocabulary & Document;

export const VocabularySchema = SchemaFactory.createForClass(Vocabulary);

// Fix index key
VocabularySchema.index({ user_id: 1, contentId: 1, language: 1 }, { unique: true });
