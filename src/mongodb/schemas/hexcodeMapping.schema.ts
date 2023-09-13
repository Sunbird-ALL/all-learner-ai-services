import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class hexcodeMapping extends Document {
    @Prop({ required: true })
    token: string;

    @Prop({ required: true })
    hexcode: string;

    @Prop({ required: true })
    language: string;
}

export type hexcodeMappingDocument = hexcodeMapping & Document;

export const hexcodeMappingSchema = SchemaFactory.createForClass(hexcodeMapping);
