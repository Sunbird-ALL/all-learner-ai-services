import { IsString, IsOptional, IsObject } from 'class-validator';

export class CreateTowreDto {

  @IsString()
  audio_file_path: string;

  @IsString()
  session_id: string;

  @IsOptional()
  @IsString()
  milestone_level?: string;

  @IsObject()
  towre_result: Record<string, any>;
}
