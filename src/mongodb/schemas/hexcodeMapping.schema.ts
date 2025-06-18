import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class hexcodeMapping extends Document {
  @Prop({ required: true, index: true })
  token: string;

  @Prop({ required: true, index: true })
  hexcode: string;

  @Prop({ required: true, index: true })
  language: string;

  @Prop({ required: false, index: true })
  graphemes: [string];

  @Prop({ required: true, index: true })
  isCommon: boolean;

  @Prop({ required: true, index: true })
  indexNo: number;
}

export type hexcodeMappingDocument = hexcodeMapping & Document;

export const hexcodeMappingSchema =
  SchemaFactory.createForClass(hexcodeMapping);
